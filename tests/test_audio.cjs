/* Actual offline SID playback: real AudioContext, graph samples, worklet and fallback. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVIEW_PLAYWRIGHT||'/home/n0rt/.nvm/versions/node/v22.23.2/lib/node_modules/@playwright/test/node_modules/playwright');
const root=path.resolve(process.env.UOS_AUDIO_ROOT||path.join(__dirname,'..'));
(async()=>{
 const server=http.createServer((request,response)=>{const name=decodeURIComponent(request.url.split('?')[0]),file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return}fs.readFile(file,(error,data)=>{if(error){response.writeHead(404).end();return}response.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');response.end(data)})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.GDB_CHROMIUM_PATH||'/home/n0rt/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const results=[];
 try{for(const mode of ['file','http','file-forced-fallback']){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.addInitScript(({fallback})=>{
    if(fallback)window.__UOS_AUDIO_TEST__={forceScriptProcessor:true};
    const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(){super();window.testContext=this;const create=this.createGain.bind(this);this.createGain=()=>{const gain=create();window.testAnalyser=this.createAnalyser();window.testAnalyser.fftSize=4096;gain.connect(window.testAnalyser);return gain}}};
  },{fallback:mode.includes('forced')});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  const href=mode==='http'?'http://127.0.0.1:'+server.address().port+'/index.html':pathToFileURL(path.join(root,'index.html')).href;
  await page.goto(href);await page.waitForFunction(()=>!!window.UOSAudio);
  assert.equal(await page.evaluate(()=>UOSAudio.stats().state),'uninitialised','no AudioContext before a gesture');
  const sources=await page.evaluate(()=>UOSSIDTracks.map(track=>({id:track.id,subtune:track.subtune,composer:track.composer,sha256:track.sha256,data:track.data})));
  assert.deepEqual(sources.map(track=>track.subtune),[1,1,2]);
  for(const track of sources){const bytes=Buffer.from(track.data,'base64');assert.equal(bytes.subarray(0,4).toString(),'PSID');assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),track.sha256);assert(bytes.subarray(54,86).toString('latin1').includes(track.composer))}
  await page.locator('#audio-toggle').click();await page.waitForFunction(()=>UOSAudio.stats().scheduler&&UOSAudio.stats().pcmRms>.001);
  const backends=[];
  for(let index=0;index<3;index++){
    if(index){await page.locator('#audio-jukebox summary').click();await page.locator('#audio-next').click();}
    await page.waitForFunction(wanted=>{const state=UOSAudio.stats();return state.trackIndex===wanted&&state.scheduler&&state.renderedFrames>4096&&state.pcmRms>.001},index);
    const state=await page.evaluate(()=>UOSAudio.stats());assert.equal(state.contextsCreated,1);assert.equal(state.sourceNodes,1);assert.equal(state.voices,3);assert.equal(state.subtune,index===2?2:1);
    const actual=await page.evaluate(()=>{const data=new Float32Array(testAnalyser.fftSize);testAnalyser.getFloatTimeDomainData(data);return data.reduce((sum,value)=>sum+value*value,0)/data.length});
    assert(actual>1e-8,'actual audio graph contains nonzero '+state.title+' samples');
    backends.push({title:state.title,composer:state.composer,subtune:state.subtune,backend:state.backend,pcmRms:state.pcmRms,actualGraphRms:Math.sqrt(actual),bufferFrames:state.bufferFrames});
    if(index)await page.keyboard.press('Escape');
  }
  await page.locator('#audio-jukebox summary').click();await page.locator('#audio-restart-song').click();await page.keyboard.press('Escape');await page.waitForFunction(()=>UOSAudio.stats().scheduler&&!UOSAudio.stats().loadPending);assert((await page.evaluate(()=>UOSAudio.stats().elapsed))<.4,'restart resets emulated tune time');
  await page.locator('#audio-toggle').click();await page.waitForFunction(()=>UOSAudio.stats().state==='suspended');assert.equal(await page.evaluate(()=>UOSAudio.stats().voices),0);
  await page.locator('#audio-jukebox summary').click();await page.locator('#audio-prev').click();assert.equal(await page.evaluate(()=>UOSAudio.stats().wanted),false,'selecting while muted does not start playback');await page.keyboard.press('Escape');
  for(let i=0;i<6;i++){await page.locator('#audio-toggle').click();await page.waitForFunction(()=>UOSAudio.stats().scheduler);await page.locator('#audio-toggle').click();await page.waitForFunction(()=>UOSAudio.stats().state==='suspended')}
  await page.evaluate(()=>{UOSAudio.play();UOSAudio.select(0);UOSAudio.select(1);UOSAudio.select(2)});await page.waitForFunction(()=>UOSAudio.stats().scheduler&&UOSAudio.stats().trackIndex===2&&UOSAudio.stats().pcmRms>.001);
  assert.equal(await page.evaluate(()=>UOSAudio.stats().contextsCreated),1);assert.equal(await page.evaluate(()=>UOSAudio.stats().sourceNodes),1);
  await page.evaluate(()=>UOSAudio.setVolume(0));await page.waitForTimeout(150);
  assert(await page.evaluate(()=>{const data=new Float32Array(testAnalyser.fftSize);testAnalyser.getFloatTimeDomainData(data);return data.every(value=>Math.abs(value)<.0001)}),'volume zero silences the actual graph');await page.evaluate(()=>UOSAudio.setVolume(.35));
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});await page.waitForFunction(()=>UOSAudio.stats().state==='suspended');assert.equal(await page.evaluate(()=>UOSAudio.stats().scheduler),false);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))});await page.waitForFunction(()=>UOSAudio.stats().scheduler);
  await page.setViewportSize({width:390,height:844});await page.locator('#audio-jukebox summary').click();const box=await page.locator('.sid-panel').boundingBox();assert(box.x>=0&&box.x+box.width<=391,'compact SID popup fits mobile');await page.keyboard.press('Escape');
  const final=await page.evaluate(()=>UOSAudio.stats());
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));await page.waitForFunction(()=>testContext.state==='closed');assert.equal(await page.evaluate(()=>UOSAudio.stats().sourceNodes),0);
  assert.deepEqual(errors,[]);results.push({mode,result:'PASS',tracks:backends,contextsCreated:final.contextsCreated,decodedBytes:final.decodedBytes});await context.close();
 }
 console.log(JSON.stringify({result:'PASS',realWebAudio:true,results},null,2));
 if(process.env.UOS_AUDIO_RESULTS)fs.writeFileSync(process.env.UOS_AUDIO_RESULTS,JSON.stringify({result:'PASS',realWebAudio:true,results},null,2));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
