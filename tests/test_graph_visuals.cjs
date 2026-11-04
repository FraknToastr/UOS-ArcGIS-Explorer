// Real-browser visual acceptance for the graph shown in the feedback screenshots.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{launchBrowser}=require('./browser_support.cjs');
const titles=['Urban Tree Map - Genus_V2','ASSETSTREE_ForestTreeAPP_020425','City Plan Shape','Light Gray Canvas Reference','Trees_Audit_2023_Full_Data','Basemap'];
const fixture={nodes:Array.from({length:18},(_,i)=>({id:'n'+i,title:titles[i%titles.length],kind:i===0?'webmap':i<5?'service':'layer',type:i===0?'Web Map':i<5?'Feature Service':'Feature Layer',meta:i<5?{typeKeywords:['Metadata','Data']}:{} })),edges:Array.from({length:17},(_,i)=>({source:'n'+Math.floor(i/4),target:'n'+(i+1)}))};
(async()=>{
 const browser=await launchBrowser();try{
  const page=await browser.newPage({viewport:{width:2048,height:1152},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve(__dirname,'../online/index.html')).href);
  await page.locator('#importFile').setInputFiles({name:'graph-visuals.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
  await page.locator('[data-view="dependencies"]').click();await page.locator('#selection-dependencies').selectOption('n0');
  await page.locator('#graphV2Btn').click();
  assert.equal(await page.locator('[data-graph-density="balanced"]').textContent(),'Normal');
  for(const layout of ['dependency','balanced','radial'])for(const density of ['roomy','balanced','compact']){
   await page.locator('[data-graph-layout="'+layout+'"]').click();await page.locator('[data-graph-density="'+density+'"]').click();await page.waitForTimeout(150);
   const proof=await page.evaluate(()=>{
    const canvas=document.querySelector('#graph').getBoundingClientRect(),nodes=[...document.querySelectorAll('.graph-node-hit')].map(e=>e.getBoundingClientRect());
    const left=Math.min(...nodes.map(n=>n.left)),right=Math.max(...nodes.map(n=>n.right)),top=Math.min(...nodes.map(n=>n.top)),bottom=Math.max(...nodes.map(n=>n.bottom));
    const label=document.querySelector('.graph-node-label'),pixels=parseFloat(getComputedStyle(label).fontSize)*label.getScreenCTM().a;
    return {pixels,fillX:(right-left)/canvas.width,fillY:(bottom-top)/canvas.height,labels:[...document.querySelectorAll('.graph-node-label')].every(e=>getComputedStyle(e).display!=='none'),state:UOSGraph.stats()};
   });
   assert.equal(proof.state.nodes,18);assert(proof.labels,'labels stay visible in all layouts/densities');
   assert(proof.pixels>=13&&proof.pixels<=14.1,'desktop labels remain readable without being enlarged: '+JSON.stringify({layout,density,proof}));
   assert(proof.fillX>.9&&proof.fillY>.9,'graph occupies both axes of the available canvas');
   if(density==='balanced')await page.screenshot({path:'/tmp/uos-graph-'+layout+'-refined.png'});
  }
  const service=page.locator('.node[data-id="n1"] circle'),legend=page.locator('#graphLegend .legend-item').filter({hasText:/^Service$/}).locator('.legend-symbol');
  assert.equal(await service.evaluate(e=>getComputedStyle(e).fill),await legend.evaluate(e=>getComputedStyle(e).backgroundColor),'ordinary service colour matches its legend');
  await page.locator('#graphAutoFitBtn').click();await page.locator('#zoomInBtn').click();await page.waitForTimeout(150);
  const frozen=await page.evaluate(()=>UOSGraph.stats().transform);
  await page.locator('[data-graph-density="compact"]').click();await page.waitForTimeout(150);
  assert.deepEqual(await page.evaluate(()=>UOSGraph.stats().transform),frozen,'density respects suppressed auto-fit');
  await page.locator('#graphFitBtn').click();await page.waitForTimeout(150);assert.notDeepEqual(await page.evaluate(()=>UOSGraph.stats().transform),frozen,'manual fit always works');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);
  for(const control of ['#graphDensityControl','#graphAutoFitBtn','[data-graph-layout="radial"]'])assert(await page.locator(control).isVisible(),'mobile graph controls stay available');
  assert.deepEqual(errors,[]);console.log('PASS graph visual acceptance: native readable labels, viewport fill, palettes, controls, and suppressed auto-fit');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
