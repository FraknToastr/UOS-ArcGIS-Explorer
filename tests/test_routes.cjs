/* Actual browser navigation, local-file and hosted subdirectory. */
const {chromium}=require(process.env.REVIEW_PLAYWRIGHT||'/home/n0rt/.nvm/versions/node/v22.23.2/lib/node_modules/@playwright/test/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const root=process.env.UOS_SUITE_ROOT?path.resolve(process.env.UOS_SUITE_ROOT):path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(!u.pathname.startsWith('/suite/')){res.writeHead(404);res.end();return}const f=path.resolve(root,decodeURIComponent(u.pathname.slice(7))||'index.html');if(!f.startsWith(root+path.sep)){res.writeHead(403);res.end();return}try{const ext=path.extname(f);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json'})[ext]||'application/octet-stream');res.end(fs.readFileSync(f))}catch{res.writeHead(404);res.end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.GDB_CHROMIUM_PATH||'/home/n0rt/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 for(const url of [pathToFileURL(root+'/index.html').href,`http://127.0.0.1:${server.address().port}/suite/index.html`]){
  const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForSelector('#open-gdb-explorer');
  await page.locator('#open-gdb-explorer').focus();await page.keyboard.press('Enter');await page.waitForURL('**/gdb/index.html');
  await page.waitForSelector('[role=tree]');assert.equal(await page.locator('.startupFailure').count(),0);
  if(await page.locator('[data-kind=layer]').count()){
   await page.locator('[data-kind=layer]').first().click();await page.waitForSelector('#attributePage');
   await page.locator('[data-tab=metadata]').click();await page.waitForSelector('.metadataViewport');
   await page.locator('[data-tab=storage]').click();await page.waitForSelector('.storageView');
  }
  await page.locator('.suiteReturn').click();await page.waitForURL('**/index.html');await page.waitForSelector('#open-arcgis-online-explorer');
  await page.locator('#open-arcgis-online-explorer').focus();await page.keyboard.press('Enter');await page.waitForURL('**/online/index.html');
  await page.locator('#dataMenu summary').click();await page.locator('#demoBtn').click();assert((await page.locator('#contentBody tr').count())>0);
  await page.locator('.suiteReturn').click();await page.waitForSelector('#open-gdb-explorer');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',url,checks:'GDB empty shell, both keyboard launch actions, AGOL demo, return links, no page errors'}));await context.close();
 }
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
