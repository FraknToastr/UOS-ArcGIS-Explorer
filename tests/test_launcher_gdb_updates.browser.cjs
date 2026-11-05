const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/home/n0rt/.nvm/versions/node/v22.23.2/lib/node_modules/@playwright/test/node_modules/playwright');
const root=path.resolve(__dirname,'..'),output='/tmp/uos-formation-gdb-review';fs.mkdirSync(output,{recursive:true});
(async()=>{
 const server=http.createServer((req,res)=>{const name=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!name.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(name,(error,data)=>{if(error){res.writeHead(404).end();return}res.setHeader('Content-Type',name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/html');res.end(data)})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.GDB_CHROMIUM_PATH||'/home/n0rt/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1440,height:960},reducedMotion:'no-preference'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const base='http://127.0.0.1:'+server.address().port;
  await page.goto(base+'/index.html');await page.waitForFunction(()=>UOSLauncher.stats().state==='ready');
  const button=page.locator('#next-ufo-formation');await page.waitForFunction(()=>document.querySelector('#next-ufo-formation').getAttribute('aria-disabled')==='false');
  const proof=await page.evaluate(async data=>{
   const image=new Image();image.src=data;await image.decode();const c=document.createElement('canvas');c.width=1536;c.height=1024;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const alpha=ctx.getImageData(0,0,c.width,c.height).data;
   const p=document.querySelector('#next-ufo-formation path');let included=0,empty=0,opaque=0,missed=0;
   for(let y=2;y<1024;y+=4)for(let x=2;x<1536;x+=4){const hit=p.isPointInFill(new DOMPoint(x,y)),a=alpha[(y*1536+x)*4+3];if(hit){included++;if(a<32)empty++}if(a>224){opaque++;if(!hit)missed++}}
   return {included,empty,opaque,missed};
  },'data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/alien-car.png')).toString('base64'));
  assert(proof.empty/proof.included<.015);assert(proof.missed/proof.opaque<.02);
  let artworkHit;
  for(const viewport of [{width:320,height:568},{width:768,height:1024},{width:1440,height:960}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(180);
   const hit=await page.evaluate(()=>{const p=document.querySelector('#next-ufo-formation path'),matrix=p.getScreenCTM();for(let y=60;y<940;y+=20)for(let x=60;x<1480;x+=20)if(p.isPointInFill(new DOMPoint(x,y))){const s=new DOMPoint(x,y).matrixTransform(matrix);if(document.elementFromPoint(s.x,s.y)?.closest('#next-ufo-formation'))return {x:s.x,y:s.y}}});
   assert(hit,'visible artwork remains an actual hit target');
   artworkHit=hit;
  }
  const artworkStyles=()=>page.evaluate(()=>{
   const p=getComputedStyle(document.querySelector('#next-ufo-formation path')),b=getComputedStyle(document.querySelector('#next-ufo-formation')),a=getComputedStyle(document.querySelector('#alien-car'));
   return {fill:p.fill,stroke:p.stroke,pathFilter:p.filter,outline:b.outlineStyle,artFilter:a.filter,opacity:a.opacity};
  });
  await page.mouse.move(0,0);await page.locator('#globe').focus();const resting=await artworkStyles();
  await page.mouse.move(artworkHit.x,artworkHit.y);await page.waitForTimeout(350);
  assert.deepEqual(await artworkStyles(),resting,'hover must not visually alter alien/car artwork');
  assert.match(await page.locator('#uos-accessible-tip').innerText(),/Next UFO formation: globe coverage/);
  await page.mouse.move(0,0);assert(await page.locator('#uos-accessible-tip').isHidden(),'tooltip clears on pointer exit');
  await page.keyboard.press('Escape');
  await button.focus();await page.keyboard.press('Enter');
  assert.deepEqual(await artworkStyles(),resting,'keyboard focus and activation must not visually alter the artwork');
  let formation=await page.evaluate(()=>UOSLauncher.stats().formation);assert(formation.transitioning&&formation.manual&&formation.clock>=20&&formation.clock<22);
  const after=formation.clock;await page.keyboard.press('Space');formation=await page.evaluate(()=>UOSLauncher.stats().formation);assert(formation.clock>=after&&formation.clock<after+1,'repeated activation does not queue or restart');
  await page.locator('#control-autoRotate').evaluate(input=>{input.checked=false;input.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.waitForTimeout(80);const frozen=await page.evaluate(()=>UOSLauncher.stats().formation.clock);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>UOSLauncher.stats().formation.clock),frozen);assert.equal(await button.getAttribute('aria-disabled'),'true');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!UOSLauncher.stats().pending);assert.match(await button.getAttribute('data-tooltip'),/reduced motion/);
  await page.screenshot({path:path.join(output,'launcher-control.png')});
  console.log('PASS artwork alpha outline, unchanged hover/focus/activation styles, custom tips, keyboard/manual transition, pause and reduced motion',proof);

  // Both explorer logos retain visible hover styling.
  for(const id of ['open-gdb-explorer','open-arcgis-online-explorer']){
   await page.mouse.move(0,0);
   const baseline=await page.locator('#'+id+' path').evaluate(p=>getComputedStyle(p).fill);
   const hit=await page.evaluate(id=>{const p=document.querySelector('#'+id+' path'),matrix=p.getScreenCTM();for(let y=80;y<680;y+=12)for(let x=100;x<2100;x+=12)if(p.isPointInFill(new DOMPoint(x,y))){const s=new DOMPoint(x,y).matrixTransform(matrix);if(document.elementFromPoint(s.x,s.y)?.closest('#'+id))return {x:s.x,y:s.y}}},id);
   assert(hit);await page.mouse.move(hit.x,hit.y);assert.notEqual(await page.locator('#'+id+' path').evaluate(p=>getComputedStyle(p).fill),baseline);
  }

  await page.goto(base+'/toolbox/ChatGPT_PYT_Factory_Conference_Edition.html');
  await page.waitForFunction(()=>document.querySelector('.factory-stage img')?.naturalWidth>0);
  assert.equal(await page.title(),'ChatGPT Pyt Factory — Conference Edition');
  assert.equal(await page.locator('.uos-brand,.uos-logo,.uos-accent,.uos-wordblock,.site-header,link[rel="icon"]').count(),0);
  assert.equal(await page.locator('#logoGrid .logo-cell').count(),144,'Factory background is retained');
  await page.screenshot({path:path.join(output,'conference-factory-desktop.png')});
  await page.setViewportSize({width:390,height:844});
  assert(await page.locator('.factory-stage img').isVisible());
  await page.screenshot({path:path.join(output,'conference-factory-mobile.png')});
  await page.setViewportSize({width:1440,height:960});
  console.log('PASS Conference Factory has no UOS logo, attribution, accents, word-block or favicon; factory image and animated background remain');

  await page.addInitScript(()=>localStorage.setItem('gdbExplorerAlwaysTopo','false'));
  await page.goto(base+'/gdb/index.html');await page.waitForFunction(()=>!!window.GDBImport);
  assert(await page.locator('.gdbImportMessages').isHidden(),'empty message row takes no space');
  await page.evaluate(()=>GDBImport.open(new File(['invalid archive'],'invalid.zip',{type:'application/zip'})));
  assert(await page.locator('.gdbImportMessages').isVisible(),'an actual import error reveals the message row');
  assert.match(await page.locator('#gdbImportError').innerText(),/ZIP could not open/);
  await page.reload();await page.waitForFunction(()=>!!window.GDBImport);
  assert(await page.locator('.gdbImportMessages').isHidden(),'reload starts with no default instruction row');
  await page.evaluate(async()=>{
   const f=(name,geometryType,attachments=0)=>({name,geometryType,kind:'Feature Class',rowCount:8,schemaFile:{path:'data/test-schema.js'},geometryFile:{path:'data/test-geometry.js'},attachmentSummary:{count:attachments},attributePages:[]});
   DATA={name:'Mixed geometry review',featureSets:[{name:'Test dataset',path:'Test dataset',features:[f('Area with photos','Polygon',3),f('Point sites','Point'),f('Transport lines','Polyline')]}]};
   const nativeLoad=GDBChunks.load;GDBChunks.load=(ref,...args)=>ref?.path==='data/test-schema.js'?Promise.resolve({fields:[]}):ref?.path==='data/test-geometry.js'?Promise.resolve({type:'FeatureCollection',features:[{type:'Feature',properties:{id:1},geometry:{type:'Polygon',coordinates:[[[138.59,-34.93],[138.61,-34.93],[138.61,-34.91],[138.59,-34.91],[138.59,-34.93]]]}}]}):nativeLoad(ref,...args);
   buildTree();await GDBChunks.code('vendor/maplibre.js');const Map=maplibregl.Map;maplibregl.Map=class extends Map{constructor(options){super(options);window.__reviewMap=this}};
  });
  assert.equal(await page.locator('.tocLegendItem').count(),9);
  assert.equal(await page.locator('.tocLegendHelp').count(),0);
  assert(await page.evaluate(()=>document.querySelector('#treeLegend').getBoundingClientRect().bottom<=document.querySelector('.expandLevelControl').getBoundingClientRect().top),'Expand controls sit below the legend');
  assert.deepEqual(await page.locator('.tocFrame>legend').allTextContents(),['Legend','GBD Contents']);
  assert(await page.locator('.tocFrame>legend').evaluateAll(labels=>labels.every(label=>parseFloat(getComputedStyle(label).fontSize)>=14&&Number(getComputedStyle(label).fontWeight)>=700)),'embedded frame labels are bold and readable');
  assert.equal(await page.locator('.tocContentsFrame #expandPills,.tocContentsFrame #treeSearch,.tocContentsFrame #tree').count(),3,'Contents frame contains expansion, search and the catalogue');
  await page.locator('[data-id="layer-0-0"]').click();await page.locator('[data-tab="spatial"]').click();await page.waitForSelector('#mapCanvas canvas');
  await page.waitForTimeout(700);
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#127984';x.fillRect(0,0,256,256);x.fillStyle='#fff';x.font='24px sans-serif';x.fillText('TEST TILE',60,128);return c.toDataURL().split(',')[1]}),'base64');
  let mode='hold',release,gate=new Promise(resolve=>release=resolve),requests=0;
  await page.route('https://api.metromap.com.au/**',async route=>{requests++;if(mode==='hold')await gate;if(mode==='error')return route.fulfill({status:403,headers:{'Access-Control-Allow-Origin':'*'},body:'Unauthorized'});return route.fulfill({status:200,contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'},body:png})});
  await page.evaluate(()=>{__reviewMap.jumpTo({center:[138.6,-34.92],zoom:14});window.__beforeBasemap={centre:__reviewMap.getCenter().toArray(),zoom:__reviewMap.getZoom(),features:__reviewMap.getSource('features'),selection:__reviewMap.getSource('selection')}});
  const useMetro=async()=>{await page.locator('[data-basemap="metromap"]').click();await page.locator('#metroKey').fill('review-test-key');await page.locator('#useMetroKey').click()};
  await useMetro();await page.waitForTimeout(100);assert.match(await page.locator('#mapStatus').innerText(),/Loading MetroMap imagery/);
  release();await page.waitForFunction(()=>document.querySelector('#mapStatus').textContent==='MetroMap imagery loaded');assert(requests>0);
  assert(await page.evaluate(()=>__reviewMap.getSource('features')===__beforeBasemap.features&&__reviewMap.getSource('selection')===__beforeBasemap.selection&&__reviewMap.getZoom()===__beforeBasemap.zoom&&JSON.stringify(__reviewMap.getCenter().toArray())===JSON.stringify(__beforeBasemap.centre)),'preserve feature/selection sources and camera');
  await page.screenshot({path:path.join(output,'gdb-metromap-test-tiles.png')});
  mode='error';await useMetro();await page.waitForFunction(()=>document.querySelector('#mapStatus').textContent.includes('access was rejected'));assert(!(await page.locator('#mapStatus').innerText()).includes('review-test-key'));
  await page.waitForTimeout(1300);assert.match(await page.locator('#mapStatus').getAttribute('class'),/error/,'idle must not overwrite failures');
  mode='hold';gate=new Promise(resolve=>release=resolve);await useMetro();await page.locator('[data-basemap="none"]').click();release();await page.waitForTimeout(300);assert.match(await page.locator('#mapStatus').innerText(),/Offline geometry/,'stale tiles must not update another basemap');
  await page.locator('#themeToggle').click();await page.evaluate(()=>document.documentElement.style.setProperty('--sidebar','420px'));await page.screenshot({path:path.join(output,'gdb-legend-dark.png')});
  const legend=await page.locator('#treeLegend').evaluate(el=>({width:el.clientWidth,height:el.clientHeight,overflow:el.scrollWidth>el.clientWidth}));assert(!legend.overflow);assert(legend.height<100,'compact legend');
  await page.locator('.expandPill[data-level="2"]').click();assert.equal(await page.locator('[data-id="folder-0"] .geometryIndicator').count(),3);assert.equal(await page.locator('[data-id="folder-0"] .attachmentIndicator').count(),1);
  await page.locator('.expandPill[data-level="3"]').click();
  await page.evaluate(()=>{const group=DATA.featureSets[0];group.features=[...group.features,...Array.from({length:500},(_,i)=>({...group.features[1],name:'Extra point '+i}))];buildTree()});
  const scrolling=await page.locator('#tree').evaluate(tree=>{const rect=tree.getBoundingClientRect(),frame=tree.closest('fieldset').getBoundingClientRect();return {height:tree.clientHeight,scrollHeight:tree.scrollHeight,bottom:rect.bottom,frameBottom:frame.bottom}});
  assert(scrolling.height>150&&scrolling.scrollHeight>scrolling.height&&scrolling.bottom<=scrolling.frameBottom,'framed catalogue retains its own bounded scroll area');
  await page.locator('#tree').evaluate(tree=>tree.scrollTop=tree.scrollHeight);await page.waitForSelector('[data-id="layer-0-502"]');
  assert((await page.locator('.treeRow').count())<=200,'virtualized rows remain bounded');
  assert.deepEqual(errors,[]);console.log('PASS GDB legend, actual raster tile success, access failure, persistent status, stale-event isolation and preserved overlays/camera',legend);
  await context.close();
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
