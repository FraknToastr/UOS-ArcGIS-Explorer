/* Portable launcher: pinned classic COBE, shared camera/orbits, finite resource ownership. */
(()=>{
'use strict';
const $=id=>document.getElementById(id),reduced=matchMedia('(prefers-reduced-motion: reduce)');
const defaults={autoRotate:!reduced.matches,speed:.5,theta:.18,scale:1,mapSamples:32000,mapBrightness:6,diffuse:1.2,glow:1,satellites:true,craftType:'ufos'};
const settings={...defaults},wrap=$('wrap');let canvas=$('globe'),satellitesCanvas=$('satellites'),glContext=null;
const viewportFactor=Number(getComputedStyle(wrap).getPropertyValue('--globe-viewport'))||1.6;
const effectiveScale=()=>settings.scale/viewportFactor;
const backingWidth=()=>Math.max(1,Math.min(Math.round(size*quality),Math.floor(Math.sqrt(2000000)/dpr)));
let motionPreference=reduced.matches;
const destinations=window.UOS_WORKSPACE?.destinations||{};
for(const [id,key,fallback] of [['open-gdb-explorer','gdb','./gdb/index.html'],['open-arcgis-online-explorer','arcgis','./online/index.html']])$(id).setAttribute('href',destinations[key]||fallback);
let globe=null,satellites=null,frame=0,last=0,clock=0,spinAngle=0,spaceLast=-Infinity,phi=.35,drag=null,disposed=false,globeDirty=true,geometryDirty=true,resizeTimer=0,failed=false;
let metrics={frames:0,globeFrames:0,backgroundFrames:0,contexts:0,lost:0,raf:[],cost:[],resolution:[0,0],state:'initialising'};
let size=0,dpr=1,quality=1,adapted=false;
const viewUpdate={phi,theta:settings.theta},satelliteUpdate={phi,theta:settings.theta,scale:effectiveScale(),phase:0};
function status(message){$('globe-status').textContent=message;$('globe-status').hidden=!message}
function measure(){size=wrap.getBoundingClientRect().width;dpr=Math.min(devicePixelRatio||1,1.5);document.documentElement.style.setProperty('--launcher-logo-bottom',Math.ceil($('logo-launcher').getBoundingClientRect().bottom)+'px');geometryDirty=true}
function applySize(){
  if(!geometryDirty)return;geometryDirty=false;
  const width=backingWidth();
  // COBE itself multiplies width/height by devicePixelRatio. Passing CSS dimensions avoids DPR squared.
  globe?.update({width,height:width});satellitesCanvas.width=Math.floor(width*dpr);satellitesCanvas.height=Math.floor(width*dpr);metrics.resolution=[canvas.width,canvas.height];globeDirty=true;
}
function applySettings(){
  globe?.update({theta:settings.theta,scale:effectiveScale(),mapSamples:settings.mapSamples,mapBrightness:settings.mapBrightness,diffuse:settings.diffuse,glowColor:[settings.glow,settings.glow,settings.glow]});
  satellites?.setCraftType(settings.craftType);
  globeDirty=true;if(!settings.satellites)satellites?.clear();schedule();
}
function create(){
  failed=false;measure();
  try{
    const context=canvas.getContext('webgl2',{alpha:true,stencil:false,antialias:true,depth:false})||canvas.getContext('webgl',{alpha:true,stencil:false,antialias:true,depth:false});
    if(!context||typeof window.createGlobe!=='function')throw Error('Globe rendering unavailable in this browser');glContext=context;
    globe=window.createGlobe(canvas,{devicePixelRatio:dpr,width:backingWidth(),height:backingWidth(),phi,theta:settings.theta,dark:0,diffuse:settings.diffuse,scale:effectiveScale(),mapSamples:settings.mapSamples,mapBrightness:settings.mapBrightness,mapBaseBrightness:0,baseColor:[1,1,1],glowColor:[settings.glow,settings.glow,settings.glow],markers:[]});metrics.contexts++;
    status('');metrics.state='ready';
  }catch(error){failed=true;metrics.state='fallback';status('Globe unavailable. Both explorer links remain ready.');console.info(error.message)}
  if(!failed&&!satellites)try{satellites=window.UOSSatellites.create(satellitesCanvas,()=>{metrics.lost++;satellites?.destroy();satellites=null;settings.satellites=false;syncControls()})}catch(error){settings.satellites=false;console.info(error.message)}
  if(failed){satellites?.destroy();satellites=null;settings.satellites=false}
  satellites?.setCraftType(settings.craftType);
  syncControls();applySize();globeDirty=true;schedule();
}
function stop(){if(frame)cancelAnimationFrame(frame);frame=0;last=0}
function syncMotionPreference(){const next=reduced.matches;if(next===motionPreference)return;motionPreference=next;settings.autoRotate=!next;syncControls();spaceLast=-Infinity;globeDirty=true}
function schedule(){if(!frame&&!disposed&&!document.hidden)frame=requestAnimationFrame(tick)}
function tick(now){
  frame=0;if(disposed||document.hidden)return;
  syncMotionPreference();
  const before=performance.now(),dt=last?Math.min(.25,(now-last)/1000):0;
  if(last){metrics.raf.push(now-last);if(metrics.raf.length>180)metrics.raf.shift()}last=now;clock+=dt;
  if(!reduced.matches||spaceLast===-Infinity){if(clock-spaceLast>=1/30){window.UOSBackground?.draw(clock*1000);spaceLast=clock;metrics.backgroundFrames++}}
  if(settings.autoRotate&&!drag){const step=settings.speed*dt;phi+=step;spinAngle+=step;if(spinAngle>=Math.PI*2){spinAngle-=Math.PI*2;phi-=Math.PI*2}globeDirty=true}
  applySize();
  if(globe&&globeDirty){viewUpdate.phi=phi;viewUpdate.theta=settings.theta;globe.update(viewUpdate);globeDirty=false;metrics.globeFrames++}
  if(globe&&satellites&&settings.satellites){satelliteUpdate.phi=phi-spinAngle;satelliteUpdate.theta=settings.theta;satelliteUpdate.scale=effectiveScale();satelliteUpdate.phase=spinAngle;satellites.draw(satelliteUpdate)}
  metrics.frames++;metrics.cost.push(performance.now()-before);if(metrics.cost.length>180)metrics.cost.shift();
  // One bounded reduction after measured sustained frame delays; never oscillate quality.
  if(!adapted&&metrics.raf.length===30){adapted=true;const costs=[...metrics.raf].sort((a,b)=>a-b);if(costs[27]>45){quality=.8;geometryDirty=true}}
  if(!reduced.matches||settings.autoRotate||globeDirty)schedule();else last=0;
}
function bindCanvas(){
canvas.addEventListener('pointerdown',event=>{drag={x:event.clientX,phi};canvas.setPointerCapture(event.pointerId)});
canvas.addEventListener('pointermove',event=>{if(!drag)return;phi=drag.phi+(event.clientX-drag.x)/180;globeDirty=true;schedule()});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null});
canvas.addEventListener('keydown',event=>{if(event.key==='ArrowLeft')phi-=.12;else if(event.key==='ArrowRight')phi+=.12;else if(event.key==='ArrowUp')settings.theta=Math.min(1.2,settings.theta+.06);else if(event.key==='ArrowDown')settings.theta=Math.max(-1.2,settings.theta-.06);else if(event.key==='Home'){phi=.35;spinAngle=0;settings.theta=.18}else return;event.preventDefault();globeDirty=true;syncControls();schedule()});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();if(disposed||event.target!==canvas)return;metrics.lost++;globe?.destroy();globe=null;unwrapCanvas();satellites?.clear();failed=true;status('Globe paused after graphics context loss. Explorer links remain available.')});
canvas.addEventListener('webglcontextrestored',event=>{if(event.target===canvas&&!disposed&&!globe)create()});
}
function unwrapCanvas(){if(canvas.parentElement!==wrap)canvas.parentElement.replaceWith(canvas)}
function syncControls(){for(const input of document.querySelectorAll('[data-setting]')){const key=input.dataset.setting;if(input.type==='checkbox')input.checked=settings[key];else input.value=settings[key];const out=$('value-'+key);if(out)out.textContent=typeof settings[key]==='number'?String(Number(settings[key].toFixed(2))):''}}
for(const input of document.querySelectorAll('[data-setting]'))input.addEventListener('input',()=>{settings[input.dataset.setting]=input.type==='checkbox'?input.checked:input.tagName==='SELECT'?input.value:Number(input.value);syncControls();applySettings()});
function panel(open){$('globe-panel').hidden=!open;$('globe-settings').setAttribute('aria-expanded',String(open));if(open)$('control-autoRotate').focus();else $('globe-settings').focus()}
$('globe-settings').addEventListener('click',()=>panel($('globe-panel').hidden));$('close-globe-panel').addEventListener('click',()=>panel(false));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('globe-panel').hidden){panel(false);event.preventDefault()}});
$('reset-globe').addEventListener('click',()=>{Object.assign(settings,defaults);phi=.35;spinAngle=0;syncControls();applySettings()});
for(const link of document.querySelectorAll('.logo-hit'))link.addEventListener('keydown',event=>{if(event.key===' '){event.preventDefault();link.click()}});
if(new URLSearchParams(location.search).get('debugLogo')==='1')document.documentElement.dataset.logoDebug='true';
function queueResize(){clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(disposed)return;measure();window.UOSBackground?.resize();spaceLast=-Infinity;globeDirty=true;schedule()},100)}
let observer=new ResizeObserver(queueResize);observer.observe(wrap);
window.addEventListener('resize',queueResize);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else{last=0;globeDirty=true;schedule()}});
reduced.addEventListener('change',()=>{syncMotionPreference();schedule()});
function dispose(){disposed=true;stop();clearTimeout(resizeTimer);observer.disconnect();globe?.destroy();globe=null;unwrapCanvas();glContext?.getExtension('WEBGL_lose_context')?.loseContext();glContext=null;satellites?.destroy();satellites=null;window.UOSBackground?.release();metrics.state='disposed'}
window.addEventListener('pagehide',dispose);
window.addEventListener('pageshow',event=>{if(!event.persisted)return;disposed=false;window.UOSBackground?.resize();spaceLast=-Infinity;observer.observe(wrap);const fresh=document.createElement('canvas');fresh.id='satellites';fresh.setAttribute('aria-hidden','true');satellitesCanvas.replaceWith(fresh);satellitesCanvas=fresh;const next=document.createElement('canvas');next.id='globe';next.tabIndex=0;next.setAttribute('aria-label','Interactive globe. Drag to rotate.');canvas.replaceWith(next);canvas=next;bindCanvas();create()});
window.UOSLauncher={stats:()=>({...metrics,raf:[...metrics.raf],cost:[...metrics.cost],phi,cameraPhi:phi-spinAngle,spinAngle,theta:settings.theta,viewportFactor,effectiveScale:effectiveScale(),pending:!!frame,settings:{...settings},satellites:satellites?.stats()||null,hasGdb:!!window.UOS_WORKSPACE?.hasGdb}),projectSatellite:index=>window.UOSSatellites.positionAt(index,spinAngle,phi-spinAngle,settings.theta)};
bindCanvas();syncControls();create();
})();
