/* Ordered file:// startup, with visible failures instead of an empty navigation. */
(() => {
  'use strict';
    let complete=false,startupError='';
  const tree=document.getElementById('treeNodes'),panel=document.getElementById('panel');
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  window.GDBStartup={ready(){complete=true}};
  const onError=event=>{if(!complete&&event.message)startupError=event.message};
  window.addEventListener('error',onError);
  function fail(error){
    if(tree)tree.innerHTML='<div class="startupTreeError"><strong>Catalogue could not load.</strong><br>See the startup error in the main panel.</div>';
    if(panel)panel.innerHTML=`<div class="startupFailure" role="alert"><strong>GDB Explorer could not initialise</strong><div>${escape(error.message||error)}</div><p>Extract the complete GDB Explorer File into one folder before opening index.html. If a file is missing, create a new GDB Explorer File using the toolbox.</p></div>`;
  }
  function load(path){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');let done=false;
      const finish=error=>{if(done)return;done=true;clearTimeout(timer);script.onload=null;script.onerror=null;error?reject(error):resolve()};
      script.src=path;script.async=false;
      script.onload=()=>finish();script.onerror=()=>finish(new Error('Required app file could not load: '+path));
      const timer=setTimeout(()=>finish(new Error('Timed out loading '+path)),30000);
      document.head.appendChild(script);
    });
  }
  async function start(){
    if(tree)tree.innerHTML='<div class="startupTreeError" role="status">Loading catalogue…</div>';
    try{
      await load('js/runtime.js');
      if(!window.GDBChunks)throw new Error('The runtime did not initialise: js/runtime.js. '+(startupError||''));
      if(document.body.hasAttribute('data-gdb-import-shell')){document.title='GDB Explorer';window.GDBCatalogue={name:'No GDB Explorer File open',path:'',featureSets:[],summary:{}}}
      else await load('data/catalogue.js');
      const data=window.GDBCatalogue;
      if(!data||!Array.isArray(data.featureSets)||data.featureSets.some(group=>!group||!Array.isArray(group.features)))throw new Error('The catalogue is missing or invalid: data/catalogue.js. '+(startupError||''));
      await load('js/core.js');
      if(!complete)throw new Error('The table of contents did not finish initialising: js/core.js. '+(startupError||''));
      await load('js/archive.js');
      await load('js/import.js');
    }catch(error){fail(error)}
    finally{window.removeEventListener('error',onError)}
  }
  start();
})();
