/* Offline C64 SID jukebox. Actual PSID programs, streamed through Hermit's CPU/SID core. */
(() => {
'use strict';
const toggle=document.getElementById('audio-toggle'),restart=document.getElementById('audio-restart-song'),meter=document.getElementById('audio-meter');
const select=document.getElementById('audio-track'),previous=document.getElementById('audio-prev'),next=document.getElementById('audio-next'),volumeControl=document.getElementById('audio-volume'),status=document.getElementById('audio-track-status');
const tracks=window.UOSSIDTracks||[],decoded=new Map();
const resumeKey='uos.sid.resume.v1:'+new URL('.',location.href).pathname;
let checkpoint=null,resumeRecord=null,checkpointWait=null,navigating=false;
function readResume(){try{const s=JSON.parse(sessionStorage.getItem(resumeKey)||'null');if(!s||s.version!==1||!Number.isFinite(s.volume)||!s.checkpoint||typeof s.checkpoint.memory!=='string'||s.checkpoint.memory.length>90000)return null;const index=tracks.findIndex(t=>t.id===s.track&&t.sha256===s.sha256);if(index<0)return null;const text=atob(s.checkpoint.memory);if(text.length!==65536)return null;s.checkpoint.memory=Uint8Array.from(text,c=>c.charCodeAt(0));if(!Number.isFinite(s.checkpoint.rate)||s.checkpoint.rate<8000||s.checkpoint.rate>192000)return null;new window.UOSSIDCore(s.checkpoint.rate).restore(s.checkpoint);s.index=index;return s}catch{return null}}
function persist(){if(!checkpoint)return;try{let binary='';for(let i=0;i<checkpoint.memory.length;i+=8192)binary+=String.fromCharCode(...checkpoint.memory.subarray(i,i+8192));sessionStorage.setItem(resumeKey,JSON.stringify({version:1,track:tracks[loadedIndex]?.id,sha256:tracks[loadedIndex]?.sha256,active:wanted,volume,checkpoint:{...checkpoint,memory:btoa(binary)}}))}catch{}}
function acceptCheckpoint(s){checkpoint=s;if(checkpointWait){checkpointWait(s);checkpointWait=null}}
async function captureCheckpoint(){if(loadedIndex<0)return;if(backend==='scriptprocessor')acceptCheckpoint(engine.save());else if(node){await new Promise(resolve=>{const done=s=>{clearTimeout(timer);resolve(s)},timer=setTimeout(()=>{checkpointWait=null;resolve(null)},350);checkpointWait=done;node.port.postMessage({type:'checkpoint'})})}persist()}
let context=null,master=null,node=null,engine=null,initialising=null,ack=null;
let wanted=false,disposed=false,epoch=0,trackIndex=0,loadedIndex=-1,loadId=0,backend='uninitialised',volume=.35,contextsCreated=0,elapsed=0,pcmRms=0,peak=0,renderedFrames=0;
const aborted=()=>new DOMException('Audio selection changed','AbortError');
function running(){return wanted&&!disposed&&!document.hidden&&context?.state==='running'&&loadedIndex===trackIndex&&!!node}
function ui(message){
  const active=running(),track=tracks[trackIndex];
  toggle.textContent=message||(active?'MUTE SID':wanted?(context?.state==='running'?'LOADING SID':'RESUME SID'):'PLAY SID');toggle.setAttribute('aria-pressed',String(active));
  restart.disabled=!context;if(select)select.value=String(trackIndex);
  if(status)status.textContent=track?track.composer+' · subtune '+track.subtune+' · '+track.model+' PAL':'';
  if(meter)meter.style.transform=active?'scaleX('+Math.min(1,Math.max(.1,pcmRms*5))+')':'scaleX(0)';
}
function bytes(index){
  if(!decoded.has(index)){
    const text=atob(tracks[index].data),value=new Uint8Array(text.length);for(let i=0;i<text.length;i++)value[i]=text.charCodeAt(i);decoded.set(index,value);
  }
  return decoded.get(index);
}
function cancelAck(){if(ack){clearTimeout(ack.timer);ack.reject(aborted());ack=null}}
function report(data){if(data.id!==loadId)return;renderedFrames=data.frames;elapsed=data.seconds;pcmRms=data.rms;peak=data.peak;ui()}
function setGain(silent=false){
  if(!master||!context)return;
  master.gain.cancelScheduledValues(context.currentTime);master.gain.setTargetAtTime(silent?0:volume*.45,context.currentTime,.008);
}
function pauseSource(){if(backend==='audio-worklet')node?.port.postMessage({type:'pause'});setGain(true);ui()}
const processorSource=()=>`const SIDCore=${window.UOSSIDCore.toString()};
class UOSSIDProcessor extends AudioWorkletProcessor{
 constructor(){super();this.sid=new SIDCore(sampleRate);this.id=0;this.running=false;this.pending=null;this.frames=0;this.squares=0;this.peak=0;this.since=0;
 this.port.onmessage=({data})=>{if(data.type==='load'){this.pending=data;this.running=false}else if(data.type==='play'&&data.id===this.id)this.running=true;else if(data.type==='pause')this.running=false;else if(data.type==='checkpoint'){this.running=false;this.port.postMessage({type:'checkpoint',id:this.id,state:this.sid.save()})}else if(data.type==='dispose'){this.running=false;this.pending=null;this.closed=true}}}
 process(inputs,outputs){
  if(this.closed)return false;
  const out=outputs[0][0];
  if(this.pending){const data=this.pending;this.pending=null;try{this.sid.load(new Uint8Array(data.bytes),data.subtune);if(data.checkpoint)this.sid.restore(data.checkpoint);this.id=data.id;this.frames=this.since=this.squares=this.peak=0;this.port.postMessage({type:'loaded',id:data.id})}catch(error){this.port.postMessage({type:'error',id:data.id,message:error.message})}}
  if(!this.running){out.fill(0);return true}
  this.sid.render(out);for(let i=0;i<out.length;i++){this.squares+=out[i]*out[i];this.peak=Math.max(this.peak,Math.abs(out[i]))}
  this.frames+=out.length;this.since+=out.length;
  if(this.since>=sampleRate/10){this.port.postMessage({type:'stats',id:this.id,frames:this.frames,seconds:this.sid.time(),rms:Math.sqrt(this.squares/this.since),peak:this.peak,state:this.sid.save()});this.since=this.squares=this.peak=0}
  return true;
 }
}registerProcessor('uos-sid',UOSSIDProcessor);`;
async function initialiseNode(active){
  if(node)return;if(initialising?.context===active)return initialising.promise;
  const loading=(async()=>{
    if(!window.UOSSIDCore||!tracks.length)throw Error('Bundled SID runtime or tunes are missing');
    if(active.audioWorklet&&window.AudioWorkletNode&&window.__UOS_AUDIO_TEST__?.forceScriptProcessor!==true){
      let url,moduleTimer;
      try{
        url=URL.createObjectURL(new Blob([processorSource()],{type:'text/javascript'}));
        await Promise.race([active.audioWorklet.addModule(url),new Promise((_,reject)=>{moduleTimer=setTimeout(()=>reject(Error('AudioWorklet module load timed out')),1800)})]);
        if(disposed||context!==active)throw aborted();
        const source=new AudioWorkletNode(active,'uos-sid',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1]});
        source.port.onmessage=({data})=>{
          if(context!==active)return;
          if(data.type==='loaded'&&ack?.id===data.id){const ready=ack;ack=null;clearTimeout(ready.timer);ready.resolve()}
          else if(data.type==='error'&&ack?.id===data.id){const failed=ack;ack=null;clearTimeout(failed.timer);failed.reject(Error(data.message))}
          else if(data.type==='checkpoint'&&data.id===loadId)acceptCheckpoint(data.state);
          else if(data.type==='stats'){report(data);if(data.id===loadId&&data.state)checkpoint=data.state}
        };
        source.onprocessorerror=()=>{if(context===active){wanted=false;++epoch;cancelAck();pauseSource();source.disconnect();node=null;backend='failed';toggle.title='SID audio processor stopped; press Play to initialise it again';ui('AUDIO STOPPED')}};
        node=source;backend='audio-worklet';node.connect(master);return;
      }catch(error){if(disposed||context!==active)throw aborted();toggle.title='AudioWorklet unavailable; using bounded SID audio fallback'}
      finally{clearTimeout(moduleTimer);if(url)URL.revokeObjectURL(url)}
    }
    if(disposed||context!==active)throw aborted();
    engine=new window.UOSSIDCore(active.sampleRate);node=active.createScriptProcessor(2048,0,1);backend='scriptprocessor';
    node.onaudioprocess=event=>{
      const out=event.outputBuffer.getChannelData(0);if(!running()){out.fill(0);return}
      engine.render(out);let sum=0,maximum=0;for(let i=0;i<out.length;i++){sum+=out[i]*out[i];maximum=Math.max(maximum,Math.abs(out[i]))}
      if(!checkpoint||engine.time()-checkpoint.scalars[11]>=.1)checkpoint=engine.save();
      report({id:loadId,frames:Math.round(engine.time()*active.sampleRate),seconds:engine.time(),rms:Math.sqrt(sum/out.length),peak:maximum});
    };
    node.connect(master);
  })().finally(()=>{if(initialising?.promise===loading)initialising=null});
  initialising={context:active,promise:loading};return loading;
}
async function loadTrack(index,restore=null){
  cancelAck();pauseSource();const id=++loadId,data=bytes(index);loadedIndex=-1;elapsed=pcmRms=peak=renderedFrames=0;
  if(backend==='audio-worklet'){
    const ready=new Promise((resolve,reject)=>{ack={id,resolve,reject,timer:setTimeout(()=>{if(ack?.id===id){ack=null;reject(Error('SID processor did not initialise the selected tune'))}},5000)}});
    const copy=data.slice().buffer;node.port.postMessage({type:'load',id,bytes:copy,subtune:tracks[index].subtune-1,checkpoint:restore},[copy]);await ready;
  }else {engine.load(data,tracks[index].subtune-1);if(restore)engine.restore(restore)}
  if(id===loadId){loadedIndex=index;if(restore){checkpoint=restore;elapsed=restore.scalars[11]}}
}
async function play(reset=false){
  const run=++epoch;wanted=true;ui('LOADING SID');
  try{
    if(!context){
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('Web Audio is unavailable');
      const active=context=resumeRecord?new Audio({sampleRate:resumeRecord.checkpoint.rate}):new Audio();contextsCreated++;master=active.createGain();master.gain.value=0;master.connect(active.destination);
      active.addEventListener('statechange',()=>{if(context===active)ui()});
    }
    const active=context,resuming=active.resume(); // Keep resume inside the user's gesture.
    setTimeout(()=>{if(context===active&&run===epoch&&wanted&&active.state!=='running')ui('RESUME SID')},600);
    await initialiseNode(active);await resuming;
    if(run!==epoch||disposed||document.hidden||!wanted)return;
    if(reset){resumeRecord=null;checkpoint=null}
    if(reset||loadedIndex!==trackIndex){const saved=resumeRecord;resumeRecord=null;await loadTrack(trackIndex,saved?.checkpoint||null)}
    if(run!==epoch||disposed||document.hidden||!wanted)return;
    if(backend==='audio-worklet')node.port.postMessage({type:'play',id:loadId});setGain();ui();
  }catch(error){if(run!==epoch||error.name==='AbortError')return;wanted=false;pauseSource();context?.suspend().catch(()=>{});toggle.title=error.message;ui('AUDIO UNAVAILABLE')}
}
function mute(){wanted=false;++epoch;cancelAck();pauseSource();context?.suspend().catch(()=>{});ui()}
function choose(index){
  if(!tracks.length)return;
  trackIndex=((index%tracks.length)+tracks.length)%tracks.length;resumeRecord=null;checkpoint=null;try{sessionStorage.removeItem(resumeKey)}catch{}loadedIndex=-1;++epoch;cancelAck();pauseSource();elapsed=pcmRms=peak=renderedFrames=0;
  if(wanted&&!document.hidden&&!disposed)play(true);else ui();
}
function changeVolume(value){volume=Math.max(0,Math.min(1,Number(value)||0));if(volumeControl)volumeControl.value=String(Math.round(volume*100));setGain(!running())}
toggle.addEventListener('click',()=>{if(wanted&&context?.state==='running')mute();else play(false)});
restart.addEventListener('click',()=>play(true));
document.addEventListener('click',async event=>{const link=event.target.closest('a.logo-hit');if(!link||event.defaultPrevented||event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!wanted||loadedIndex<0)return;event.preventDefault();if(navigating)return;navigating=true;pauseSource();await captureCheckpoint();location.assign(link.href.baseVal||link.href)},true);
previous?.addEventListener('click',()=>choose(trackIndex-1));next?.addEventListener('click',()=>choose(trackIndex+1));
if(select){select.replaceChildren(...tracks.map((track,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=track.title+' — '+track.composer;return option}));select.addEventListener('change',()=>choose(Number(select.value)))}
volumeControl?.addEventListener('input',()=>changeVolume(Number(volumeControl.value)/100));
const jukebox=document.getElementById('audio-jukebox');
document.addEventListener('pointerdown',event=>{if(jukebox?.open&&!jukebox.contains(event.target))jukebox.open=false});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&jukebox?.open){jukebox.open=false;jukebox.querySelector('summary').focus()}});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){++epoch;cancelAck();pauseSource();context?.suspend().catch(()=>{});ui()}
  else if(wanted)play(false);
});
window.addEventListener('pagehide',()=>{
  if(backend==='scriptprocessor'&&engine&&loadedIndex>=0)checkpoint=engine.save();persist();
  disposed=true;wanted=false;++epoch;cancelAck();pauseSource();if(backend==='audio-worklet'){node?.port.postMessage({type:'dispose'});node?.port.close()}
  if(node){node.onaudioprocess=null;node.disconnect()}master?.disconnect();context?.close().catch(()=>{});node=master=engine=context=null;initialising=null;loadedIndex=-1;decoded.clear();ui();
});
function restoreSession(){resumeRecord=readResume();if(!resumeRecord)return;trackIndex=resumeRecord.index;volume=resumeRecord.volume;elapsed=resumeRecord.checkpoint.scalars[11];wanted=!!resumeRecord.active;disposed=false;navigating=false;changeVolume(volume);ui();if(wanted)play(false)}
window.addEventListener('pageshow',event=>{if(event.persisted){disposed=false;wanted=false;restoreSession();ui()}});
window.UOSAudio={mute,play,restart:()=>play(true),select:choose,next:()=>choose(trackIndex+1),previous:()=>choose(trackIndex-1),setVolume:changeVolume,
  stats:()=>({wanted,state:context?.state||'uninitialised',voices:running()?3:0,scheduler:running(),step:Math.floor(elapsed*8),trackIndex,title:tracks[trackIndex]?.title||'',composer:tracks[trackIndex]?.composer||'',subtune:tracks[trackIndex]?.subtune||0,model:6581,clock:'PAL',engine:'Hermit jsSID 0.9.1',backend,elapsed,renderedFrames,pcmRms,peak,volume,contextsCreated,sourceNodes:node?1:0,loadPending:!!ack,decodedBytes:[...decoded.values()].reduce((sum,data)=>sum+data.byteLength,0),bufferFrames:backend==='audio-worklet'?128:backend==='scriptprocessor'?2048:0})};
ui();
restoreSession();
})();
