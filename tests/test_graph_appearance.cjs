const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url'),{launchBrowser}=require('./browser_support.cjs');
(async()=>{const browser=await launchBrowser();try{
 const page=await browser.newPage({viewport:{width:1366,height:768},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.resolve(__dirname,'../online/index.html')).href);await page.locator('#dataMenu summary').click();await page.locator('#demoBtn').click();await page.locator('[data-view="dependencies"]').click();
 await page.waitForTimeout(250); // Let the newly revealed graph's ResizeObserver settle.
 const cards=page.locator('#graphCardsBtn'),clickOnly=page.locator('#graphClickHighlightsBtn'),nodes=page.locator('#nodes .node');
 assert.equal(await cards.getAttribute('aria-pressed'),'false');assert.equal(await clickOnly.getAttribute('aria-pressed'),'true');
 const base=await page.evaluate(()=>({nodes:UOSGraph.stats().nodes,edges:UOSGraph.stats().edges,positions:[...document.querySelectorAll('#nodes .node')].map(n=>n.getAttribute('transform'))}));
 const edgeStyle=()=>page.locator('.edge.connection-first').first().evaluate(e=>({color:getComputedStyle(e).stroke,opacity:getComputedStyle(e).strokeOpacity}));
 const quiet=await edgeStyle();assert.equal(quiet.opacity,'0.28');assert.equal(await page.locator('.graph-edge-clicked').count(),0,'automatic content selection does not highlight');
 assert(await page.locator('.graph-node-hit').evaluateAll(es=>es.every(e=>getComputedStyle(e).fill==='rgba(0, 0, 0, 0)'&&getComputedStyle(e).stroke==='none')),'cards start transparent, retaining hit regions');
 await cards.click();assert.equal(await cards.getAttribute('aria-pressed'),'true');assert(await page.locator('.graph-node-hit').first().evaluate(e=>getComputedStyle(e).fill!=='rgba(0, 0, 0, 0)'));await cards.click();
 assert.deepEqual(await page.evaluate(()=>({nodes:UOSGraph.stats().nodes,edges:UOSGraph.stats().edges,positions:[...document.querySelectorAll('#nodes .node')].map(n=>n.getAttribute('transform'))})),base,'appearance switches preserve paths, data and positions');
 await nodes.filter({has:page.locator('[fill="var(--graph-layer)"]')}).first().hover();assert.equal(await page.locator('.graph-edge-hover').count(),0,'hover keeps quiet connectors');
 await page.locator('.node[data-id="demo:service"]').click();assert((await page.locator('.graph-edge-clicked').count())>0);assert.equal((await edgeStyle()).opacity,'0.85');
 const box=await page.locator('#graph').boundingBox();await page.mouse.click(box.x+5,box.y+5);assert.equal(await page.locator('.graph-edge-clicked').count(),0);assert.equal((await edgeStyle()).opacity,'0.28');
 await page.locator('.node[data-id="demo:trees"]').focus();await page.keyboard.press('Enter');assert((await page.locator('.graph-edge-clicked').count())>0,'keyboard activation highlights');
 await clickOnly.click();assert.equal(await clickOnly.getAttribute('aria-pressed'),'false');assert.equal((await edgeStyle()).opacity,'0.65');
 await clickOnly.click();await page.locator('#selection-dependencies').selectOption('demo:map');assert.equal(await page.locator('.graph-edge-clicked').count(),0,'programmatic selection clears click highlight');
 await page.setViewportSize({width:390,height:844});assert(await cards.isVisible());assert(await clickOnly.isVisible());
 assert.deepEqual(errors,[]);console.log('PASS graph appearance defaults, transparent hit targets, independent adjacent toggles, quiet hover, click/keyboard highlight, background reset, mobile access and stable geometry');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
