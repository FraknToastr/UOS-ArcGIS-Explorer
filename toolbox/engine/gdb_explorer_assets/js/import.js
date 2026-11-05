/* Session-only file import controller. A candidate replaces the workspace atomically. */
(() => {
'use strict';
const input=document.getElementById('gdbZipInput'),open=document.getElementById('gdbOpenZip'),cancel=document.getElementById('gdbCancelImport'),clear=document.getElementById('gdbClearImport'),status=document.getElementById('gdbImportStatus'),error=document.getElementById('gdbImportError');
let pending=null,sequence=0,currentName='',disposed=false;
function ready(){open.textContent=currentName?'Replace GDB Explorer File':'Open GDB Explorer File';clear.disabled=!currentName;cancel.hidden=!pending;open.disabled=disposed}
function stop(){++sequence;pending?.abort();pending=null;ready()}
async function load(file){
  stop();const id=sequence,controller=new AbortController();pending=controller;error.textContent='';status.textContent='Checking GDB Explorer File: '+file.name+'…';ready();let candidate=null;
  try{
    await GDBChunks.code('vendor/zip-2.24.0.min.js');
    if(controller.signal.aborted)throw new DOMException('Import cancelled','AbortError');
    candidate=await GDBArchive.prepare(file,controller.signal,message=>{if(id===sequence)status.textContent=message});
    if(controller.signal.aborted||id!==sequence||disposed){candidate.dispose();return}
    GDBWorkspace.replace(candidate.catalogue,candidate);currentName=candidate.name;candidate=null;
    status.textContent='GDB Explorer File: '+currentName+' · session only';
  }catch(failure){
    candidate?.dispose();
    if(id===sequence&&failure.name!=='AbortError'){error.textContent='GDB Explorer File could not open: '+failure.message;status.textContent=currentName?currentName+' · previous workspace retained':'No GDB Explorer File open'}
  }finally{if(id===sequence){pending=null;ready()}}
}
open.addEventListener('click',()=>input.click());
input.addEventListener('change',()=>{const file=input.files?.[0];input.value='';if(file)load(file)});
cancel.addEventListener('click',()=>{stop();status.textContent=currentName?currentName+' · import cancelled; workspace retained':'Import cancelled'});
clear.addEventListener('click',()=>{stop();GDBWorkspace.clear();currentName='';status.textContent='GDB Explorer File cleared from this tab';error.textContent='';ready()});
window.addEventListener('pagehide',()=>{disposed=true;stop();GDBChunks.setArchive(null);currentName=''});
window.addEventListener('pageshow',event=>{if(event.persisted){disposed=false;GDBWorkspace.clear();status.textContent='';ready()}});
window.GDBImport={open:load,cancel:()=>cancel.click(),stats:()=>({pending:!!pending,name:currentName,sessionOnly:true})};
ready();
})();
