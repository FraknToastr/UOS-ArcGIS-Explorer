/* Generate the conference variant without modifying the supplied Factory app. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'toolbox/ChatGPT_PYT_Factory.html'),'utf8');
const branding=/<header class="site-header">[\s\S]*?<\/header>/;
const header=source.match(branding)?.[0];
if(!header?.includes('class="uos-brand"')||!header.includes('class="uos-logo"'))throw Error('The expected UOS branding block was not found; review the Factory source before regenerating.');
const conference=source
 .replace(branding,'')
 .replace(/<link\b[^>]*\brel="icon"[^>]*>/g,'')
 .replace(/^\.(?:site-header|uos-brand|uos-logo|uos-accent|uos-wordblock)[^{]*\{[^}]*\}\s*/gm,'')
 .replace(/<title>[\s\S]*?<\/title>/,'<title>ChatGPT Pyt Factory — Conference Edition</title>');
if(/class="uos-|Urban Operating System|Made by Josh Roberts/.test(conference))throw Error('Conference output still contains a UOS branding element.');
const output=path.join(root,'toolbox/ChatGPT_PYT_Factory_Conference_Edition.html');
if(process.argv.includes('--check')){
 if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==conference)throw Error('Regenerate the Conference Factory HTML with node scripts/build_conference_factory.cjs');
 console.log('Conference Factory HTML matches its source, with the complete UOS branding block removed.');
}else{
 fs.writeFileSync(output,conference);
 console.log('Generated toolbox/ChatGPT_PYT_Factory_Conference_Edition.html');
}
