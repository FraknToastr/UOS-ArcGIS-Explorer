const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{launchBrowser}=require('./browser_support.cjs');
(async()=>{const browser=await launchBrowser();try{const page=await browser.newPage({viewport:{width:900,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const route of ['index.html','online/index.html','gdb/index.html']){
 await page.goto(pathToFileURL(path.resolve(__dirname,'..',route)).href);await page.waitForFunction(()=>!!window.UOSTooltips);
 assert.equal(await page.locator('body [title],body svg title').count(),0,'native tips removed on '+route);
 await page.evaluate(()=>{const b=document.createElement('button');b.id='tip-test';b.title='Accessible tip for a large pointer';b.style.cssText='position:fixed;right:8px;bottom:8px;z-index:2147483646';b.textContent='Test';document.body.append(b)});
 const button=page.locator('#tip-test'),tip=page.locator('#uos-accessible-tip');await button.hover();await tip.waitFor({state:'visible'});
 const box=await tip.boundingBox();assert(box.x>=8&&box.y>=8&&box.x+box.width<=892&&box.y+box.height<=692,'tip fits viewport');
 assert.equal(await button.getAttribute('title'),null);assert.equal(await button.getAttribute('aria-describedby'),'uos-accessible-tip');
 await page.mouse.move(450,350);assert(await tip.isHidden(),'tip disappears immediately after pointer leaves');
 await page.keyboard.press('Tab');await button.focus();await tip.waitFor({state:'visible'});await page.keyboard.press('Escape');assert(await tip.isHidden(),'Escape dismisses');
 await page.locator('body').click({position:{x:450,y:350}});await button.hover();await tip.waitFor({state:'visible'});await button.evaluate(b=>b.remove());await tip.waitFor({state:'hidden'});
}
assert.deepEqual(errors,[]);console.log('PASS: accessible tips on launcher, Online and GDB; viewport edges, keyboard, Escape, hover exit, dynamic titles and removal');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
