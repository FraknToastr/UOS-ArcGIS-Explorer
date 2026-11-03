const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
const {chromium}=require(process.env.REVIEW_PLAYWRIGHT||'/home/n0rt/.nvm/versions/node/v22.23.2/lib/node_modules/@playwright/test/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.GDB_CHROMIUM_PATH||'/home/n0rt/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const directory=process.env.UOS_CONNECT_RESULTS||'/tmp/uos-connect-browser';fs.mkdirSync(directory,{recursive:true});
 const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));
 const id='a'.repeat(32),bad='b'.repeat(32);
 await page.route('**/sharing/rest/**',async route=>{
  const url=new URL(route.request().url()),params=route.request().method()==='POST'?new URLSearchParams(route.request().postData()):url.searchParams;let body;
  if(url.pathname.endsWith('/community/self'))body={username:'connect_user',orgId:'org-connect',fullName:'Connect User'};
  else if(url.pathname.endsWith('/search')){requests.push({q:params.get('q'),start:Number(params.get('start')),num:Number(params.get('num'))});const query=params.get('q'),start=Number(params.get('start'));body={total:query.includes('pagination')?120:1,nextStart:query.includes('pagination')&&start===1?71:-1,results:[{id:query.includes('failure')?bad:id,title:query.includes('failure')?'Unavailable result':'Accessible planning map',type:'Web Map',owner:'connect_user',modified:Date.UTC(2026,10,1),snippet:'<b>Search fixture</b> for browser validation',access:'public'}]}}
  else if(url.pathname.includes(bad))body={error:{code:403,message:'Access denied to fixture item'}};
  else if(url.pathname.endsWith('/data'))body={operationalLayers:[]};
  else body={id,title:'Accessible planning map',type:'Web Map',owner:'connect_user'};
  await route.fulfill({json:body,headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.goto(pathToFileURL(path.resolve(__dirname,'../../online/index.html')).href);await page.waitForSelector('#view-connect.active');
 assert.equal(await page.locator('#connectionDialog').count(),0);assert(await page.getByRole('button',{name:'My content',exact:true}).isDisabled());
 await page.locator('#tokenInput').fill('browser-fixture-token');await page.locator('#verifyBtn').click();await page.waitForFunction(()=>document.querySelector('#authLabel').textContent==='connect_user');
 await page.getByRole('button',{name:'My content',exact:true}).click();await page.waitForSelector('.connect-result');assert(requests.at(-1).q.includes('owner:"connect_user"'));
 await page.getByRole('button',{name:'Web maps',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#portalResults').getAttribute('aria-busy')==='false');assert(requests.at(-1).q.includes('type:"Web Map"'));
 await page.getByRole('button',{name:'Organisation',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#portalResults').getAttribute('aria-busy')==='false');assert(requests.at(-1).q.includes('orgid:"org-connect"'));
 await page.locator('.connect-result').click();await page.waitForSelector('#view-content.active');assert.equal(await page.locator('#selection-content').inputValue(),'webmap:'+id);assert((await page.locator('#contentBody').innerText()).includes('Accessible planning map'));
 await page.locator('[data-view="connect"]').click();await page.locator('#portalSearch').fill('failure');await page.locator('#portalSearchBtn').click();await page.waitForSelector('.connect-result[data-search-item="'+bad+'"]');await page.locator('.connect-result').click();await page.waitForFunction(()=>document.querySelector('#scanStatus').textContent.includes('workspace has been kept'));
 assert(await page.locator('#view-connect').evaluate(node=>node.classList.contains('active')));await page.locator('[data-view="content"]').click();assert.equal(await page.locator('#selection-content').inputValue(),'webmap:'+id);
 await page.locator('[data-view="connect"]').click();await page.getByRole('button',{name:'All accessible',exact:true}).click();await page.getByRole('button',{name:'All types',exact:true}).click();await page.locator('#portalSearch').fill('pagination');await page.locator('#portalSearchBtn').click();await page.waitForFunction(()=>!document.querySelector('#searchNext').disabled);await page.locator('#searchNext').click();await page.waitForFunction(()=>document.querySelector('#searchPage').textContent.includes('71–71'));assert.equal(requests.at(-1).start,71);await page.locator('#searchPrev').click();await page.waitForFunction(()=>document.querySelector('#searchPage').textContent.includes('1–1'));assert.equal(requests.at(-1).start,1);
 const geometry=[];
 for(const size of [{width:1440,height:960},{width:1024,height:768},{width:800,height:900},{width:390,height:844},{width:320,height:640}]){
  await page.setViewportSize(size);await page.waitForTimeout(100);const rects=await page.evaluate(()=>{const a=document.querySelector('.connect-settings').getBoundingClientRect(),b=document.querySelector('.connect-browser').getBoundingClientRect();return {a:a.toJSON(),b:b.toJSON(),bodyOverflow:document.documentElement.scrollHeight>innerHeight+1,bodyWidth:document.documentElement.scrollWidth>innerWidth+1}});geometry.push({size,...rects});assert(!rects.bodyOverflow);assert(!rects.bodyWidth);
  if(size.width>800){assert(Math.abs(rects.a.width-360)<2);assert(Math.abs(rects.a.top-rects.b.top)<2)}else{assert(rects.b.top>rects.a.top);assert(Math.abs(rects.a.height/(rects.a.height+rects.b.height)-.4)<.025)}
  await page.screenshot({path:path.join(directory,'connect-'+size.width+'.png')});
 }
 await page.locator('#logoutBtn').click();assert(await page.getByRole('button',{name:'My content',exact:true}).isDisabled());assert(await page.getByRole('button',{name:'Organisation',exact:true}).isDisabled());
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({passed:true,requests,geometry,pageErrors:errors},null,2));console.log('PASS: actual Chromium Connect scopes/type search, result load/rollback, history pagination, desktop/mobile layouts and no page errors. REST responses are controlled fixtures.');await browser.close();
})().catch(error=>{console.error(error);process.exitCode=1});
