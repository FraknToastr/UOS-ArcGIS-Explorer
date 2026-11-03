/* Real WebGL craft variants, shared resources, enlarged artwork and control access. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/home/n0rt/.nvm/versions/node/v22.23.2/lib/node_modules/@playwright/test/node_modules/playwright');
const root=process.env.UOS_SUITE_ROOT||path.resolve(__dirname,'..'),out=process.env.UOS_CRAFT_OUTPUT||'/tmp/uos-craft-mode-checks';fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.GDB_CHROMIUM_PATH||'/home/n0rt/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],results=[];page.on('pageerror',error=>errors.push(error.message));
 await context.addInitScript(()=>{const upload=WebGLRenderingContext.prototype.bufferData;WebGLRenderingContext.prototype.bufferData=function(target,data,...rest){if(data instanceof Float32Array&&data.byteLength===36288)window.__craftUploadedMesh=Array.from(data);return upload.call(this,target,data,...rest)}});
 async function run(name,fn){try{results.push({name,passed:true,...await fn()});console.log('PASS',name)}catch(error){results.push({name,passed:false,error:error.stack});console.log('FAIL',name,error.message)}fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({environment:{browser:browser.version(),node:process.version,rendering:'SwiftShader software WebGL',origin:'file://'},results},null,2))}
 await page.goto('file://'+root+'/index.html');await page.waitForFunction(()=>window.UOSLauncher?.stats().state==='ready');await page.waitForFunction(()=>!UOSLauncher.stats().pending);
 await run('artwork-enlarged-with-aligned-responsive-native-hit-regions',async()=>{
  const measurements=[];
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:1024},{width:1440,height:960},{width:1920,height:1080},{width:568,height:320},{width:1440,height:600}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(180);
   const result=await page.evaluate(()=>{
    const logo=document.querySelector('#logo-launcher'),alien=document.querySelector('#alien-car'),l=logo.getBoundingClientRect(),a=alien.getBoundingClientRect(),paths=[...document.querySelectorAll('.logo-hit path')],matrix=logo.getScreenCTM();
    const hits=paths.map(path=>{for(let y=120;y<680;y+=8)for(let x=100;x<2100;x+=8){const p=new DOMPoint(x,y);if(path.isPointInFill(p)){const screen=p.matrixTransform(matrix);if(document.elementFromPoint(screen.x,screen.y)?.closest('.logo-hit')===path.parentElement)return path.parentElement.id}}return null});
    const controls=[...document.querySelectorAll('#audio-ui>button,#audio-ui>details>summary')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect();return {id:e.id||e.parentElement.id,bounds:r.toJSON(),hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}});
    return {viewport:[innerWidth,innerHeight],logo:l.toJSON(),alien:a.toJSON(),viewBox:logo.getAttribute('viewBox'),hits,controls};
   });
   for(const box of [result.logo,result.alien]){assert(box.left>=-1&&box.top>=-1);assert(box.right<=viewport.width+1&&box.bottom<=viewport.height+1)}
   assert(result.hits.every(Boolean));assert.equal(result.viewBox,'0 0 2170 725');assert(result.controls.every(c=>c.hit),'corner art cannot intercept the SID/globe controls');
   if(viewport.width===1440&&viewport.height===960){assert(Math.abs(result.logo.width-702)<1);assert.equal(result.alien.width,700)}
   if(viewport.width===1920){assert.equal(result.logo.width,750);assert.equal(result.alien.width,700)}
   if(viewport.width<=600)assert(result.logo.width<=viewport.width-16+.1);
   measurements.push(result);
  }
  await page.setViewportSize({width:1440,height:960});await page.waitForTimeout(180);return {desktopSizeMultiplier:1.25,measurements,globeOverlapPolicy:'No globe avoidance: enlarged corner art may overlap Earth.'};
 });
 await run('ufo-selector-preserves-phase-and-reuses-one-buffer-and-program',async()=>{
 assert.equal(await page.locator('#control-craftType').inputValue(),'ufos');assert.equal(await page.locator('#control-craftType').getAttribute('aria-label'),'Orbiting craft type');assert.equal(await page.locator('#control-craftType').getAttribute('title'),null);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#control-autoRotate').evaluate(e=>{e.checked=true;e.dispatchEvent(new Event('input',{bubbles:true}))});await page.waitForTimeout(300);await page.locator('#control-autoRotate').evaluate(e=>{e.checked=false;e.dispatchEvent(new Event('input',{bubbles:true}))});await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!UOSLauncher.stats().pending);
  const before=await page.evaluate(()=>{
   const g=document.querySelector('#satellites').getContext('webgl'),calls={createBuffer:0,createProgram:0,bufferData:0};window.__craftResources={g,calls,program:g.getParameter(g.CURRENT_PROGRAM),buffer:g.getParameter(g.ARRAY_BUFFER_BINDING),original:{}};
   for(const name of Object.keys(calls)){const method=g[name].bind(g);window.__craftResources.original[name]=method;g[name]=(...args)=>{calls[name]++;return method(...args)}}return UOSLauncher.stats();
  });
  await page.locator('#globe-settings').click();
  for(let i=0;i<20;i++)await page.locator('#control-craftType').selectOption(i%2?'satellites':'ufos');
  await page.locator('#control-craftType').selectOption('ufos');await page.locator('#close-globe-panel').click();await page.waitForFunction(()=>!UOSLauncher.stats().pending);
  const after=await page.evaluate(()=>{const r=window.__craftResources,g=r.g;return {stats:UOSLauncher.stats(),sameBuffer:g.getParameter(g.ARRAY_BUFFER_BINDING)===r.buffer,sameProgram:g.getParameter(g.CURRENT_PROGRAM)===r.program,calls:r.calls,actualBufferBytes:g.getBufferParameter(g.ARRAY_BUFFER,g.BUFFER_SIZE)}});
  assert.equal(after.stats.settings.craftType,'ufos');assert.equal(after.stats.satellites.craftType,'ufos');assert.equal(after.stats.contexts,before.contexts);assert.equal(after.stats.spinAngle,before.spinAngle);assert.equal(after.stats.cameraPhi,before.cameraPhi);assert(after.sameBuffer&&after.sameProgram);assert.deepEqual(after.calls,{createBuffer:0,createProgram:0,bufferData:0});assert.equal(after.actualBufferBytes,after.stats.satellites.bufferBytes);assert.equal(after.stats.satellites.gpuBuffers,1);assert.equal(after.stats.satellites.meshUploads,1);assert.equal(after.stats.satellites.orbits,12);assert.equal(after.stats.satellites.vertices,1200);
  const frames=after.stats.frames;await page.waitForTimeout(200);assert.equal((await page.evaluate(()=>UOSLauncher.stats())).frames,frames,'craft switches cannot leave a render loop in reduced-motion idle');
  await page.screenshot({path:path.join(out,'ufo-desktop.png')});await page.setViewportSize({width:390,height:844});await page.waitForTimeout(180);await page.screenshot({path:path.join(out,'ufo-mobile.png')});await page.setViewportSize({width:1440,height:960});await page.waitForTimeout(180);return {phaseBefore:before.spinAngle,phaseAfter:after.stats.spinAngle,...after};
 });
 await run('both-real-webgl-meshes-occlude-and-fit-at-maximum-scale',async()=>{
  const proof=await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=c.height=600;const renderer=UOSSatellites.create(c),g=c.getContext('webgl'),pixels=new Uint8Array(600*600*4),phi=.35,theta=.18,scale=1.25/1.6;let candidate;
   for(let index=0;index<12&&!candidate;index++)for(let phase=0;phase<Math.PI*2;phase+=.001){const p=UOSSatellites.positionAt(index,phase,phi,theta),r=Math.hypot(p.x,p.y);if(p.z<-.2&&r>.792&&r<.799&&Array.from({length:12},(_,i)=>UOSSatellites.positionAt(i,phase,phi,theta)).every((q,i)=>i===index||Math.hypot(q.x-p.x,q.y-p.y)>.2)){candidate={index,phase,p};break}}
   if(!candidate)throw Error('No isolated limb-crossing craft found');
   const result=[];
   for(const type of ['satellites','ufos']){
    renderer.setCraftType(type);renderer.draw({phi,theta,scale:1,phase:candidate.phase});g.readPixels(0,0,600,600,g.RGBA,g.UNSIGNED_BYTE,pixels);let interior=0,outer=0,boundary=0;
    for(let y=0;y<600;y++)for(let x=0;x<600;x++){const wx=(x+.5)/300-1,wy=(y+.5)/300-1;if(Math.hypot(wx-candidate.p.x,wy-candidate.p.y)>.08||!pixels[(y*600+x)*4+3])continue;const radius=Math.hypot(wx,wy);if(radius<.8-2/600)interior++;else if(radius<.8)boundary++;else outer++}
    let borderAlpha=0,visibleFrames=0;
    for(let step=0;step<48;step++){renderer.draw({phi,theta,scale,phase:step*Math.PI*2/48});g.readPixels(0,0,600,600,g.RGBA,g.UNSIGNED_BYTE,pixels);let visible=0;for(let i=3;i<pixels.length;i+=4)visible+=pixels[i]>0;if(visible)visibleFrames++;for(let x=0;x<600;x++)borderAlpha+=pixels[x*4+3]+pixels[(599*600+x)*4+3];for(let y=0;y<600;y++)borderAlpha+=pixels[(y*600)*4+3]+pixels[(y*600+599)*4+3]}
    result.push({type,interiorPixels:interior,outerPixels:outer,antialiasedBoundaryPixels:boundary,borderAlpha,visibleFrames,vertices:renderer.stats().vertices});
   }const resources=renderer.stats();renderer.destroy();return {candidate,result,resources,maximumClipExtent:(1.18+.055)*scale};
  });
  assert(proof.maximumClipExtent<1);for(const result of proof.result){assert.equal(result.interiorPixels,0);assert(result.outerPixels>0);assert.equal(result.borderAlpha,0);assert.equal(result.visibleFrames,48)}return proof;
 });
 await run('ufo-underside-faces-earth-through-every-orbital-plane',async()=>{
  const proof=await page.evaluate(()=>{
   const data=window.__craftUploadedMesh,stats=UOSLauncher.stats().satellites;if(!data)throw Error('Actual craft mesh upload was not captured');
   const start=data.length/7-stats.vertices,centres=[];for(let i=start;i<data.length/7;i++){const at=i*7;if(Math.hypot(data[at],data[at+1])<1e-8)centres.push(data[at+2])}
   const bottom=Math.min(...centres),top=Math.max(...centres);let alignment=1,maxStep=0;
   for(let index=0;index<12;index++){let previous=null;for(let step=0;step<=360;step++){const p=UOSSatellites.worldAt(index,step*Math.PI/180),r=Math.hypot(p.x,p.y,p.z),down=[p.x*bottom/r,p.y*bottom/r,p.z*bottom/r],toward=[-p.x/r,-p.y/r,-p.z/r],length=Math.hypot(...down);alignment=Math.min(alignment,down.reduce((sum,v,i)=>sum+v*toward[i],0)/length);if(previous)maxStep=Math.max(maxStep,Math.hypot(...down.map((v,i)=>v-previous[i]))/length);previous=down}}
   return {bottom,top,alignment,maxStep,planes:12,frames:361};
  });
  assert(Math.abs(proof.bottom+.009)<1e-6,'flat underside lies on the inward radial axis');assert(Math.abs(proof.top-.025)<1e-6,'dome lies on the outward radial axis');assert(proof.alignment>1-1e-12);assert(proof.maxStep<.018,'orientation changes continuously across the phase wrap');return proof;
 });
 await run('enlarged-art-keeps-jukebox-and-globe-controls-accessible',async()=>{
  const checks=[];
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1440,height:600}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(180);await page.locator('#audio-jukebox>summary').click();
   const result=await page.evaluate(()=>{
    const panel=document.querySelector('#audio-jukebox .sid-panel'),r=panel.getBoundingClientRect(),controls=[...panel.querySelectorAll('button,select,input')].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect();return {id:e.id,hit:e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),bounds:r.toJSON()}});return {viewport:[innerWidth,innerHeight],panel:r.toJSON(),controls,restartSongInRow:!!document.querySelector('.sid-controls #audio-restart-song')};
   });
   assert(result.panel.left>=-1&&result.panel.right<=viewport.width+1&&result.panel.top>=-1&&result.panel.bottom<=viewport.height+1);assert(result.controls.every(control=>control.hit));assert(result.restartSongInRow,'the dedicated restart-song action remains reachable in the jukebox row');checks.push(result);await page.locator('#audio-jukebox>summary').click();await page.locator('#globe-settings').click();assert(await page.locator('#control-craftType').isVisible());await page.locator('#control-craftType').selectOption('ufos');await page.locator('#close-globe-panel').click();
  }return {checks};
 });
 assert.deepEqual(errors,[]);await context.close();await browser.close();console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,total:results.length,out}));if(results.some(r=>!r.passed))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1});
