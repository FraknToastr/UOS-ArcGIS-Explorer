/* Browser checks run against the new independently deployed suite.
   GDB_IMPORT_ROOT=/abs/explorer-suite-v2 GDB_IMPORT_FIXTURES=/tmp/import-fixtures
   rtk node -e 'require("./explorer-suite-v2/tests/test_import_browser.cjs")' */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.PLAYWRIGHT_PACKAGE||'/home/n0rt/.nvm/versions/node/v22.23.2/lib/node_modules/@playwright/test/node_modules/playwright');
const root=path.resolve(process.env.GDB_IMPORT_ROOT||path.join(__dirname,'..')),fixtures=process.env.GDB_IMPORT_FIXTURES||'/tmp/uos-v2-import-fixtures';
const results=[];
const fixture=name=>path.join(fixtures,name+'.zip');
const percentile=(values,p)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))]||0};
(async()=>{
const server=http.createServer((req,res)=>{const name=decodeURIComponent(req.url.split('?')[0]),file=path.resolve(root,'.'+name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}fs.readFile(file,(error,data)=>{if(error){res.writeHead(404).end();return}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(data)})});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({executablePath:process.env.GDB_CHROMIUM_PATH||'/home/n0rt/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
for(const mode of ['file-workers','http-workers','file-inline-inflater']){
  const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
  await context.addInitScript(({inline})=>{
    localStorage.setItem('gdbExplorerAlwaysTopo','false');localStorage.setItem('gdbExplorerAttachmentThumbnails','false');
    window.__gdbWorkers=0;window.__gdbWorkersTerminated=0;window.__gdbHeartbeat=[];let last=performance.now();setInterval(()=>{const now=performance.now();window.__gdbHeartbeat.push(now-last);last=now},10);
    if(inline){window.Worker=class{constructor(){throw new DOMException('Workers deliberately blocked','SecurityError')}};window.__GDB_IMPORT_TEST__={nativeStreams:false}}
    else{const Native=window.Worker;window.Worker=class extends Native{constructor(...args){super(...args);window.__gdbWorkers++}terminate(){window.__gdbWorkersTerminated++;return super.terminate()}}}
  },{inline:mode.includes('inline')});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  const url=mode.startsWith('http')?'http://127.0.0.1:'+server.address().port+'/gdb/index.html':pathToFileURL(path.join(root,'gdb/index.html')).href;
  await page.goto(url);await page.waitForFunction(()=>!!window.GDBImport);
  const open=async name=>{await page.locator('#gdbZipInput').setInputFiles(fixture(name));await page.waitForFunction(()=>!GDBImport.stats().pending);return page.locator('#gdbImportError').innerText()};
  assert.equal(await open('valid'),'');
  assert.equal(await page.locator('.suiteReturn').getAttribute('href'),'../index.html');
  assert.equal(await page.evaluate(()=>GDBChunks.archiveStats().entryReads),2,'only build info and catalogue extracted at startup');
  await page.locator('[data-id="layer-0-0"]').click();await page.waitForSelector('#attributePage');
  assert.equal(await page.locator('.dataTable tbody tr').count(),150);
  const oldName=await page.evaluate(()=>GDBImport.stats().name);
  if(mode==='file-workers'&&fs.existsSync(fixture('entry-limit'))){
    await page.locator('#gdbZipInput').setInputFiles(fixture('entry-limit'));await page.waitForFunction(()=>GDBImport.stats().pending&&document.getElementById('gdbImportStatus').textContent.includes('entries'));
    await page.locator('#gdbCancelImport').click();await page.waitForTimeout(50);
    assert.equal(await page.evaluate(()=>GDBImport.stats().name),oldName);
    await page.locator('#gdbZipInput').setInputFiles(fixture('entry-limit'));await page.waitForFunction(()=>!GDBImport.stats().pending,{},{timeout:30000});
    assert((await page.locator('#gdbImportError').innerText()).includes('200,000'));
    assert.equal(await page.evaluate(()=>GDBImport.stats().name),oldName);
  }
  for(const name of ['javascript-catalogue','wrong-version','raw-geodatabase','missing-reference','invalid-count','deep-source-path','two-catalogues','drive-path','dot-alias','case-alias','backslash','device','catalogue-limit','chunk-limit','bad-crc']){
    assert(await open(name),'invalid ZIP rejected: '+name);
    assert.equal(await page.evaluate(()=>GDBImport.stats().name),oldName,'previous workspace retained: '+name);
    assert.equal(await page.locator('.dataTable tbody tr').count(),150,'active view retained: '+name);
    assert.equal(await page.evaluate(()=>window.__IMPORT_EXECUTED__),undefined,'imported scripts never executed');
  }
  await page.locator('[data-tab="metadata"]').click();await page.waitForSelector('.metadataViewport');
  assert((await page.locator('.metadataViewport').innerText()).includes('Benches'));
  await page.locator('[data-tab="storage"]').click();await page.waitForSelector('.storageStats');
  await page.locator('[data-tab="attachments"]').click();await page.waitForSelector('.attachCard');
  assert.equal(await page.locator('.attachCard').count(),40);
  assert.equal(await page.evaluate(()=>GDBChunks.archiveStats().objectURLs),0);
  await page.locator('.viewAttachment').first().click();await page.waitForSelector('#modalBody img[src^="blob:"]');
  assert.equal(await page.evaluate(()=>GDBChunks.archiveStats().objectURLs),1);
  await page.locator('#modalClose').click();assert.equal(await page.evaluate(()=>GDBChunks.archiveStats().objectURLs),0);
  const download=page.waitForEvent('download');await page.locator('.attachCard [data-gdb-download]').first().click();
  const downloaded=await download;
  assert(downloaded.suggestedFilename().endsWith('.png'));
  const expected=JSON.parse(fs.readFileSync(path.join(fixtures,'expected-attachment.json'),'utf8'));
  assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(await downloaded.path())).digest('hex'),expected.sha256,'downloaded attachment bytes retain exact identity');
  await page.locator('#attachmentThumbnails').check();await page.waitForSelector('.gallery img[src^="blob:"]');
  await page.locator('#attachmentThumbnails').uncheck();
  await page.locator('[data-tab="schema"]').click();await page.waitForSelector('.schemaTable');
  assert.equal(await page.evaluate(()=>GDBChunks.archiveStats().objectURLs),0,'view disposal revokes attachment URLs');
  assert.equal(await open('attachment-limit'),'');await page.locator('[data-id="layer-0-0"]').click();await page.waitForSelector('#attributePage');
  await page.locator('[data-tab="attachments"]').click();await page.waitForSelector('.attachCard');await page.locator('.viewAttachment').first().click();
  await page.waitForFunction(()=>document.getElementById('modalBody').textContent.includes('256 MiB'));
  assert.equal(await page.evaluate(()=>GDBChunks.archiveStats().objectURLs),0);await page.locator('#modalClose').click();
  assert.equal(await open('wrapped-suite'),'');
  assert.equal(await open('malicious-runtime'),'');assert.equal(await page.evaluate(()=>window.__IMPORT_EXECUTED__),undefined);
  assert.equal(await open('large-page'),'');
  const before=await page.evaluate(()=>{window.__gdbHeartbeat=[];return performance.now()});
  await page.locator('[data-id="layer-0-0"]').click();await page.waitForSelector('#attributePage');
  const measurement=await page.evaluate(start=>({ms:performance.now()-start,heartbeat:window.__gdbHeartbeat,workers:window.__gdbWorkers,archive:GDBChunks.archiveStats(),cache:GDBChunks.stats()}),before);
  assert(measurement.heartbeat.length>0,'decompression yields to the browser');
  assert(measurement.cache.fileBytes<=measurement.cache.maxFileBytes,'oversized data pages bypass the cache');
  assert.equal(await page.locator('.dataTable tbody tr').count(),150);
  assert.equal(await page.locator('.fullCellValue').count(),150);
  assert(await page.locator('.dataTable td').evaluateAll(cells=>cells.every(cell=>cell.title.length<=257)));
  await page.locator('.fullCellValue').first().click();await page.waitForSelector('#gdbCellDialog[open]');
  assert.equal((await page.locator('#gdbCellDialog pre').textContent()).length,65536,'full value retained and available on demand');
  await page.locator('#gdbCellDialog button').click();assert.equal(await page.locator('#gdbCellDialog pre').textContent(),'');
  // Replace and cancel in the same task, proving a stale candidate cannot commit.
  await page.evaluate(async()=>{const file=new File([new Uint8Array(32)],'cancelled.zip');const work=GDBImport.open(file);GDBImport.cancel();await work});
  assert.equal(await page.evaluate(()=>GDBImport.stats().name),'large-page.zip');
  await page.locator('#gdbClearImport').click();assert.equal(await page.locator('.treeRow[data-kind="layer"]').count(),0);assert.equal(await page.evaluate(()=>GDBChunks.archiveStats()),null);
  await page.waitForTimeout(1500);
  const workerLifecycle=await page.evaluate(()=>({created:window.__gdbWorkers,terminated:window.__gdbWorkersTerminated}));
  assert.equal(workerLifecycle.created,workerLifecycle.terminated,'idle ZIP workers terminate after Clear');
  assert.equal(await open('valid'),'');await page.reload();await page.waitForFunction(()=>!!window.GDBImport);
  assert.equal(await page.evaluate(()=>GDBImport.stats().name),'','no import persists across reload');
  assert.deepEqual(errors,[]);
  results.push({mode,result:'PASS',largePageWallMs:measurement.ms,heartbeatP95:percentile(measurement.heartbeat,.95),heartbeatMax:Math.max(...measurement.heartbeat),workersCreated:measurement.workers,workerLifecycle,cache:measurement.cache,readBytes:measurement.archive.readBytes});
  await context.close();
}
console.log(JSON.stringify({result:'PASS',results},null,2));
if(process.env.GDB_IMPORT_RESULTS)fs.writeFileSync(process.env.GDB_IMPORT_RESULTS,JSON.stringify({result:'PASS',results},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
