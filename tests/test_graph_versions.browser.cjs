// Real-browser acceptance for the independently configurable V1/V2 graph modes.
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{launchBrowser}=require('./browser_support.cjs');
const fixture={nodes:Array.from({length:10},(_,i)=>({
 id:'n'+i,title:['Urban Tree Map - Genus_V2','City Plan Feature Service','Trees_Audit_2023_Full_Data','ASSETSTREE_ForestTreeAPP_020425'][i%4],
 kind:i===0?'webmap':i===1?'service':i===9?'table':'layer',type:i===0?'Web Map':i===1?'Feature Service':i===9?'Table':'Feature Layer',
 meta:i===1?{typeKeywords:['Metadata','Data','Feature Service']}:{}
})),edges:Array.from({length:9},(_,i)=>({source:'n'+Math.floor(i/3),target:'n'+(i+1)}))};
(async()=>{
 const browser=await launchBrowser();try{
  const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const stats=()=>page.evaluate(()=>UOSGraph.stats());
  async function settle(){await page.waitForFunction(()=>!window.UOSGraph?.stats().animating);await page.waitForTimeout(80)}
  async function version(name){await page.locator('[data-graph-version="'+name+'"]').click();await settle()}
  async function spacing(value){await page.locator('#spacingInput').evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}))},value);await settle()}
  async function open(){
   await page.goto(pathToFileURL(path.resolve(__dirname,'../online/index.html')).href);
   assert.equal((await stats()).layoutVersion,'v1','each fresh page defaults to V1');
   assert.equal(await page.locator('#graphV1Btn').getAttribute('aria-pressed'),'true');
   await page.locator('#importFile').setInputFiles({name:'graph-versions.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
   await page.locator('[data-view="dependencies"]').click();await page.locator('#selection-dependencies').selectOption('n0');await settle();
  }
  await open();
  for(const size of [{width:1440,height:960},{width:390,height:844}]){
   await page.setViewportSize(size);await settle();
   for(const engine of ['v1','v2']){
    await version(engine);
    assert.equal(await page.locator('[data-graph-density="balanced"]').textContent(),engine==='v1'?'Balanced':'Normal');
    for(const layout of ['dependency','balanced','radial'])for(const density of ['roomy','balanced','compact']){
     const layoutButton=page.locator('[data-graph-layout="'+layout+'"]'),densityButton=page.locator('[data-graph-density="'+density+'"]');
     assert(await layoutButton.isVisible()&&await layoutButton.isEnabled(),engine+' layout controls remain available');
     assert(await densityButton.isVisible()&&await densityButton.isEnabled(),engine+' density controls remain available');
     await layoutButton.click();await densityButton.click();await settle();
     const state=await stats();assert.equal(state.layoutVersion,engine);assert.equal(state.layout,layout);assert.equal(state.preferences.density,density);
     assert.equal(state.nodes,10);assert.equal(state.edges,9);assert.equal(await layoutButton.getAttribute('aria-pressed'),'true');assert.equal(await densityButton.getAttribute('aria-pressed'),'true');
     assert(await page.locator('.graph-node-label').evaluateAll(labels=>labels.length===10&&labels.every(label=>getComputedStyle(label).display!=='none')),engine+' resource labels stay visible including Roomy Radial');
     const connector=await page.locator('#edges .edge').first().getAttribute('d');
     assert(engine==='v1'?connector.includes(' C')&&!connector.includes(' Q'):/ [LQ]/.test(connector)&&!connector.includes(' C'),engine+' uses its own connector renderer');
    }
    for(const control of ['#graphAutoFitBtn','#graphFitBtn','#focusBtn','#graphCardsBtn','#graphClickHighlightsBtn'])assert(await page.locator(control).isEnabled(),engine+' supporting controls remain enabled');
    assert(await page.locator('#spacingInput').isEnabled(),engine+' spacing control remains enabled');
   }
  }
  console.log('PASS both versions expose three working layouts/densities and their supporting controls on desktop/mobile');

  // Start with fresh defaults so independent version settings are unambiguous.
  await page.setViewportSize({width:1440,height:960});await open();
  await page.locator('[data-graph-layout="radial"]').click();await page.locator('[data-graph-density="roomy"]').click();await spacing(190);
  await page.locator('#graphAutoFitBtn').click();await settle();
  await page.locator('#graphCardsBtn').click();await page.locator('#graphClickHighlightsBtn').click();
  await page.locator('input[data-kind="table"]').uncheck();await settle();
  const shared={selection:await page.locator('#selection-dependencies').inputValue(),count:(await stats()).nodes,edges:(await stats()).edges,appearance:(await stats()).appearance};
  await version('v2');
  let state=await stats();assert.equal(state.layout,'dependency');assert.equal(state.preferences.density,'balanced');assert.equal(state.preferences.spacing,135);assert.equal(state.preferences.autoFit,true);
  assert.equal(await page.locator('#selection-dependencies').inputValue(),shared.selection);assert.equal(state.nodes,shared.count);assert.equal(state.edges,shared.edges);assert.deepEqual(state.appearance,shared.appearance);assert.equal(await page.locator('input[data-kind="table"]').isChecked(),false);
  await page.locator('[data-graph-layout="balanced"]').click();await page.locator('[data-graph-density="compact"]').click();await spacing(100);
  const beforeV1=(await stats()).transform;await version('v1');state=await stats();
  assert.equal(state.layout,'radial');assert.equal(state.preferences.density,'roomy');assert.equal(state.preferences.spacing,190);assert.equal(await page.locator('#spacingInput').inputValue(),'190');assert.equal(state.preferences.autoFit,false);
  assert.deepEqual(state.transform,beforeV1,'switching to a version with auto-fit off preserves the current camera');
  assert.equal(await page.locator('#graphCardsBtn').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#graphClickHighlightsBtn').getAttribute('aria-pressed'),'false');
  await page.locator('#zoomInBtn').click();await settle();const zoomed=(await stats()).transform;
  await page.locator('#graphFitBtn').click();await settle();assert.notDeepEqual((await stats()).transform,zoomed,'manual Fit works with auto-fit suppressed');
  await version('v2');state=await stats();assert.equal(state.layout,'balanced');assert.equal(state.preferences.density,'compact');assert.equal(state.preferences.spacing,100);assert.equal(state.preferences.autoFit,true);
  const serviceFill=await page.locator('.node[data-id="n1"] circle').evaluate(circle=>getComputedStyle(circle).fill);
  const serviceLegend=await page.locator('#graphLegend .legend-item').filter({hasText:/^Service$/}).locator('.legend-symbol').evaluate(symbol=>getComputedStyle(symbol).backgroundColor);
  assert.equal(serviceFill,serviceLegend,'ordinary feature services retain their shared corrected legend colour');
  await version('v1');assert.equal(await page.locator('.node[data-id="n1"] circle').evaluate(circle=>getComputedStyle(circle).fill),serviceFill,'switching versions retains shared colours');
  assert.deepEqual(errors,[]);console.log('PASS independent layout/density/spacing/auto-fit settings, stable selection/filters/appearance/colours, and manual Fit');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
