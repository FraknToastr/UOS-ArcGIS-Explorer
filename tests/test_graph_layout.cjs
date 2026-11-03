const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url'),{launchBrowser}=require('./browser_support.cjs');
const kinds=['experience','webmap','webscene','service','layer','table','other'];
const fixture={format:'arcgis-explorer',version:2,nodes:[{id:'root',kind:'webmap',title:'City operations and planning Web Map',type:'Web Map'},...Array.from({length:30},(_,i)=>({id:'n'+i,kind:kinds[i%7],title:['Water supply network','Planning precinct boundaries','Street trees inventory','Property and land parcels','Development applications'][i%5]+' '+(i+1),type:kinds[i%7]}))],edges:Array.from({length:30},(_,i)=>i%5?{source:'root',target:'n'+i}:{source:'n'+i,target:'root'})};
(async()=>{const browser=await launchBrowser();try{const page=await browser.newPage(),errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(pathToFileURL(path.resolve(__dirname,'../online/index.html')).href);await page.locator('#importFile').setInputFiles({name:'mixed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
await page.locator('[data-view="dependencies"]').click();await page.locator('#selection-dependencies').selectOption('root');await page.locator('[data-graph-view="first"]').click();
for(const size of [{width:1920,height:1080},{width:1366,height:768},{width:900,height:740},{width:390,height:844}]){await page.setViewportSize(size);await page.waitForTimeout(500);
 for(const layout of ['balanced','radial','dependency']){await page.locator('[data-graph-layout="'+layout+'"]').click();await page.waitForTimeout(350);
 const state=await page.evaluate(()=>UOSGraph.stats());assert.equal(state.nodes,31);assert.equal(state.edges,30);const canvas=await page.locator('#graph').boundingBox(),boxes=await page.locator('.graph-node-hit').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}));
 for(let i=0;i<boxes.length;i++){const a=boxes[i];assert(a.x>=canvas.x-1&&a.y>=canvas.y-1&&a.x+a.w<=canvas.x+canvas.width+1&&a.y+a.h<=canvas.y+canvas.height+1,'all nodes fit '+JSON.stringify({size,layout,a,canvas}));for(let j=i+1;j<boxes.length;j++){const b=boxes[j];assert(a.x+a.w<=b.x+.5||b.x+b.w<=a.x+.5||a.y+a.h<=b.y+.5||b.y+b.h<=a.y+.5,'no card overlap')}}
 if(size.width>=1366&&layout==='balanced')assert(state.transform.k*14>=13,'desktop labels stay readable '+JSON.stringify(state));
 results.push({size,layout,k:state.transform.k,labelPixels:state.transform.k*14});
 if(size.width===1366&&layout==='balanced')await page.screenshot({path:'/tmp/uos-graph-balanced.png'});
 }
}
await page.locator('[data-graph-view="all"]').click();await page.waitForTimeout(250);assert.equal((await page.evaluate(()=>UOSGraph.stats())).view,'all');await page.locator('[data-graph-view="branch"]').click();assert.equal((await page.evaluate(()=>UOSGraph.stats())).view,'branch');
const large={nodes:Array.from({length:1200},(_,i)=>({id:'chain'+i,title:'Dependency '+i,kind:'layer'})),edges:Array.from({length:1199},(_,i)=>({source:'chain'+i,target:'chain'+(i+1)}))};
await page.locator('#importFile').setInputFiles({name:'large.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(large))});await page.locator('[data-view="dependencies"]').click();await page.waitForTimeout(500);
const largeState=await page.evaluate(()=>UOSGraph.stats());assert.equal(largeState.nodes,1200);assert.equal(largeState.edges,1199);assert(largeState.overview);
const largeBox=await page.locator('#graph').boundingBox();assert(await page.locator('.graph-node-hit').evaluateAll((nodes,r)=>nodes.every(n=>{const b=n.getBoundingClientRect();return b.left>=r.x-1&&b.right<=r.x+r.width+1&&b.top>=r.y-1&&b.bottom<=r.y+r.height+1}),largeBox),'large dependency overview retains all nodes inside viewport');
assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',largeNodes:largeState.nodes,results},null,2));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
