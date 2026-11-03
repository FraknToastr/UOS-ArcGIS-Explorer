/* Real polygon clicks on a 6,000-feature export whose table is limited to 5,000 rows. */
const path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
(async()=>{
  const app=path.resolve(__dirname,"../gdb"),browser=await require('./browser_support.cjs').launchBrowser();
  try{
    const context=await browser.newContext({viewport:{width:1920,height:1080},offline:true});
    await context.addInitScript(()=>localStorage.setItem('gdbExplorerAlwaysTopo','false'));
    const page=await context.newPage(),errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
    const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    await page.goto(pathToFileURL(path.join(app,'index.html')).href);await page.waitForFunction(()=>window.GDBImport);await page.locator('#gdbZipInput').setInputFiles(process.env.GDB_IMPORT_FIXTURE||'/tmp/uos-v2-fixtures/polygon-popups.zip');await page.waitForSelector('[data-id="layer-0-0"]');await page.evaluate(()=>{window.__zipReadPaths=[];const load=GDBChunks.load;GDBChunks.load=function(ref,...args){__zipReadPaths.push(ref?.path);return load.call(this,ref,...args)}});await page.locator('[data-id="layer-0-0"]').click();await page.waitForSelector('#attributePage');
    assert((await page.locator('.tableStatus').innerText()).includes('5000')||(await page.locator('.tableStatus').innerText()).includes('5,000'));
    // Wrap only the constructor to access the actual test map; no production test hooks.
    await page.evaluate(async()=>{await GDBChunks.code('vendor/maplibre.js');const Original=maplibregl.Map;maplibregl.Map=class extends Original{constructor(options){super(options);window.__popupTestMap=this}}});
    await page.locator('[data-tab="spatial"]').click();await page.waitForSelector('#mapCanvas canvas');
    await page.waitForFunction(()=>window.__popupTestMap?.loaded());
    assert(!(await page.evaluate(()=>__zipReadPaths)).some(url=>url?.includes('-popup-')),'supplemental details remain unloaded before a map click');
    for(const [oid,name] of [[537,'Pagoda Tree'],[5794,'Tuckeroo']]){
      await page.evaluate(oid=>{
        const feature=selected.spatialGeoJSON.features.find(feature=>feature.properties.id===oid),ring=feature.geometry.coordinates[0];
        const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);window.__popupTestCentre=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
        __popupTestMap.fitBounds([[Math.min(...xs),Math.min(...ys)],[Math.max(...xs),Math.max(...ys)]],{duration:0,padding:100,maxZoom:20});
      },oid);
      await page.waitForFunction(oid=>__popupTestMap.loaded()&&__popupTestMap.queryRenderedFeatures(__popupTestMap.project(__popupTestCentre),{layers:['polygons']}).some(feature=>Number(feature.properties.id)===oid),oid);
      const point=await page.evaluate(()=>{const p=__popupTestMap.project(__popupTestCentre),r=document.getElementById('mapCanvas').getBoundingClientRect();return {x:r.left+p.x,y:r.top+p.y}});
      await page.mouse.click(point.x,point.y);
      await page.waitForFunction(({oid,name})=>document.getElementById('mapDockTitle').textContent.endsWith('OBJECTID '+oid)&&document.getElementById('mapDockBody').innerText.includes(name),{oid,name});
      const popup=await page.locator('#mapDockBody').innerText();assert(!popup.includes('Feature ID'));assert(popup.includes(name));
      if(oid===5794){assert(popup.includes('Cupaniopsis'));assert(popup.includes('anacardioides'));assert(popup.includes('151766'))}
    }
    assert.equal((await page.evaluate(()=>__zipReadPaths)).filter(url=>url?.includes('-popup-')).length,1,'a click loads only its supplemental page');
    assert(!(await page.evaluate(()=>__zipReadPaths)).some(url=>url?.includes('spatial-attribute-index')),'normal clicks use geometry pointers without reading the fallback index');
    await page.screenshot({path:'/tmp/uos-v2-polygon-5794.png'});
    await page.locator('[data-tab="attributes"]').click();await page.waitForSelector('#attributePage');assert.equal(await page.locator('.dataTable tbody tr').count(),150);
    assert.equal(await page.locator('#mapCanvas canvas').count(),0);assert.deepEqual(errors,[]);
    console.log('PASS: actual polygon clicks show attributes for OIDs 537 and 5794; 5,000-row table cap retained; supplemental page lazy; map released; CPU 4x; no page errors.');
    await context.close();
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
