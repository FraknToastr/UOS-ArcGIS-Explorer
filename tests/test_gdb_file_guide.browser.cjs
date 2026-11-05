const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const {launchBrowser}=require('./browser_support.cjs');
const root=path.resolve(__dirname,'..'),fixtures=fs.mkdtempSync(path.join(os.tmpdir(),'gdb-file-guide-fixtures-')),output='/tmp/gdb-file-guide-review';fs.mkdirSync(output,{recursive:true});
const created=spawnSync('rtk',['proxy','python3',path.join(__dirname,'create_gdb_file_guide_fixtures.py'),fixtures],{encoding:'utf8'});
if(created.status!==0)throw Error(created.stderr||created.stdout);
(async()=>{
 const browser=await launchBrowser(),context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  const url=pathToFileURL(path.join(root,'gdb/index.html')).href;
  await page.goto(url);await page.waitForFunction(()=>!!window.GDBImport);
  assert.equal(await page.title(),'GDB Explorer');
  assert.equal(await page.locator('#gdbOpenZip').innerText(),'Open GDB Explorer File');
  assert.equal(await page.locator('#gdbClearImport').innerText(),'Clear GDB Explorer File');
  assert(await page.locator('.gdbImportMessages').isHidden());
  const guide=page.locator('.gdb-file-welcome');await guide.waitFor({state:'visible'});
  assert.equal(await guide.locator('li').count(),4);
  assert.equal(await guide.locator('h2').innerText(),'Create a GDB Explorer File');
  assert(!/U[·]?OS|Suite|v\d|\bZIP\b/.test(await guide.innerText()));
  await page.waitForFunction(()=>document.querySelector('.toolbox-lid img')?.naturalWidth===37);
  for(const viewport of [{width:1920,height:1080},{width:1440,height:1000},{width:1100,height:700}]){
   await page.setViewportSize(viewport);
   for(const theme of ['light','dark']){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    const layout=await guide.evaluate(element=>{
     const face=element.querySelector('.toolbox-face'),graphic=element.querySelector('.gdb-file-toolbox'),heading=face.querySelector('h2'),last=face.querySelector('li:last-child'),f=face.getBoundingClientRect(),g=graphic.getBoundingClientRect();
     return {font:parseFloat(getComputedStyle(last).fontSize),titleSize:parseFloat(getComputedStyle(heading).fontSize),faceOverflow:face.scrollWidth>face.clientWidth,guideOverflow:element.scrollWidth>element.clientWidth,lastBottom:last.getBoundingClientRect().bottom,faceBottom:f.bottom,graphicWidth:g.width,graphicHeight:g.height};
    });
    assert(layout.font>=14&&layout.titleSize>=20);assert(!layout.faceOverflow&&!layout.guideOverflow,JSON.stringify(layout));assert(layout.lastBottom<=layout.faceBottom+1);assert(layout.graphicWidth<=761);
    await page.screenshot({path:path.join(output,`guide-${viewport.width}-${theme}.png`)});
   }
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>GDBImport.open(new File(['bad'],'invalid.zip')));
  assert(await guide.isVisible(),'failed first import preserves instructions');
  assert.match(await page.locator('#gdbImportError').innerText(),/^GDB Explorer File could not open:/);
  assert(await page.locator('.gdbImportMessages').isVisible());
  // Cancel before the asynchronous file reader starts; guide and empty state survive.
  await page.evaluate(()=>{const work=GDBImport.open(new File(['cancel'],'cancelled.zip'));GDBImport.cancel();return work});
  assert(await guide.isVisible());assert.match(await page.locator('#gdbImportStatus').innerText(),/Import cancelled/);
  for(const version of ['22.5','22.6','22.7']){
   await page.locator('#gdbZipInput').setInputFiles(path.join(fixtures,'existing-'+version+'.zip'));await page.waitForFunction(()=>!GDBImport.stats().pending);
   assert.equal(await page.locator('#gdbImportError').innerText(),'');
   assert.equal(await guide.count(),0,'loaded legacy exports use the normal selection welcome');
   assert.equal(await page.locator('#gdbOpenZip').innerText(),'Replace GDB Explorer File');
   await page.locator('[data-id="layer-0-0"]').click();await page.waitForSelector('.dataTable tbody tr');
   await page.evaluate(()=>GDBImport.open(new File(['bad'],'invalid-replacement.zip')));
   assert.equal(await guide.count(),0,'failed replacement retains the active view');
   assert.equal(await page.locator('.dataTable tbody tr').count(),1);
   await page.locator('#gdbClearImport').click();assert(await guide.isVisible(),'Clear returns to the toolbox instructions');
  }
  await page.reload();await page.waitForFunction(()=>!!window.GDBImport);assert(await guide.isVisible());assert(await page.locator('.gdbImportMessages').isHidden());
  await page.goto(pathToFileURL(path.join(fixtures,'packaged/gdb/index.html')).href);await page.waitForFunction(()=>!!window.GDBImport);
  assert.equal(await guide.count(),0,'a bundled export does not ask the user to create a file');
  await page.locator('[data-id="layer-0-0"]').click();await page.waitForSelector('.dataTable tbody tr');
  await page.locator('#gdbZipInput').setInputFiles(path.join(fixtures,'existing-22.7.zip'));await page.waitForFunction(()=>!GDBImport.stats().pending);
  await page.locator('#gdbClearImport').click();assert(await guide.isVisible(),'clearing a replacement in a bundled app also shows the guide');
  assert.deepEqual(errors,[]);
  console.log('PASS GDB Explorer File guide: themes, responsive text, startup, cancellation, errors, legacy imports, replacement, clear, reload and bundled exports');
  console.log('Screenshots:',output);
 }finally{await context.close();await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
