/* Offline classic-script loader. Data cache is limited by file bytes and entry count.
   The byte allowance is a cache policy, not a promise about total browser heap. */
(() => {
  const cache=new Map(),codeLoads=new Map(),receivers=new WeakMap();
  const MAX_BYTES=8*1024*1024,MAX_ENTRIES=4;
  let cachedBytes=0,queue=Promise.resolve(),archive=null,archiveEpoch=0;
  const abortError=()=>new DOMException('View changed','AbortError');
  function safePath(path){
    if(typeof path!=='string'||!/^((js|vendor|data)\/)[a-zA-Z0-9_./-]+$/.test(path)||path.includes('..'))throw new Error('Invalid app resource path');
    return path;
  }
  function script(path,signal,data){
    return new Promise((resolve,reject)=>{
      if(signal?.aborted){reject(abortError());return}
      const node=document.createElement('script');
      node.src=safePath(path);node.async=true;
      let received=false,value,settled=false;
      if(data)receivers.set(node,payload=>{received=true;value=payload});
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);receivers.delete(node);node.remove()};
      const finish=(error)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve(value)};
      const cancel=()=>finish(abortError());
      node.onload=()=>finish(data&&!received?new Error('Invalid data file: '+path):null);
      node.onerror=()=>finish(new Error('Cannot load '+path));
      const timer=setTimeout(()=>finish(new Error('Timed out loading '+path)),30000);
      signal?.addEventListener('abort',cancel,{once:true});
      document.head.appendChild(node);
    });
  }
  window.GDBChunks={
    receive(node,payload){receivers.get(node)?.(payload)},
    load(ref,signal,retain=true){
      if(!ref)return Promise.resolve(null);
      if(signal?.aborted)return Promise.reject(abortError());
      const path=safePath(ref.path),epoch=archiveEpoch,source=archive;
      if(cache.has(path)){
        const hit=cache.get(path);cache.delete(path);cache.set(path,hit);return Promise.resolve(hit.value);
      }
      const work=queue.catch(()=>{}).then(async()=>{
        if(signal?.aborted||epoch!==archiveEpoch)throw abortError();
        if(cache.has(path))return cache.get(path).value;
        const value=source?await source.load(ref,signal):await script(path,signal,true),weight=source?source.weight(ref):Number(ref.bytes)||0;
        if(signal?.aborted||epoch!==archiveEpoch)throw abortError();
        if(retain&&weight>0&&weight<=MAX_BYTES){
          while(cache.size>=MAX_ENTRIES||cachedBytes+weight>MAX_BYTES){const first=cache.keys().next().value;cachedBytes-=cache.get(first).weight;cache.delete(first)}
          cache.set(path,{value,weight});cachedBytes+=weight;
        }
        return value;
      });
      // A resolved queue must never retain its last payload.
      queue=work.then(()=>undefined,()=>undefined);
      return work;
    },
    code(path){
      path=safePath(path);
      if(!codeLoads.has(path))codeLoads.set(path,script(path,null,false).catch(err=>{codeLoads.delete(path);throw err}));
      return codeLoads.get(path);
    },
    css(path){
      if(document.querySelector('link[data-gdb-vendor]'))return;
      const link=document.createElement('link');link.rel='stylesheet';link.href=safePath(path);link.dataset.gdbVendor='true';document.head.appendChild(link);
    },
    clear(){cache.clear();cachedBytes=0},
    setArchive(next){const previous=archive;archive=next;++archiveEpoch;queue=Promise.resolve();cache.clear();cachedBytes=0;if(previous&&previous!==next)previous.dispose()},
    isArchive(){return !!archive},
    archiveStats(){return archive?.stats()||null},
    attachmentURL(attachment,signal,scope='view'){
      if(signal?.aborted)return Promise.reject(abortError());
      if(archive)return archive.attachmentURL(attachment,signal,scope);
      const path=attachment?.dataUrl;
      if(typeof path!=='string'||!/^attachments\/[a-zA-Z0-9_.-]+$/.test(path)||path.includes('..'))return Promise.reject(new Error('Invalid attachment resource path'));
      return Promise.resolve(path);
    },
    releaseAttachments(scope){archive?.release(scope)},
    stats(){return {entries:cache.size,fileBytes:cachedBytes,maxEntries:MAX_ENTRIES,maxFileBytes:MAX_BYTES}},
    storage:{getItem(key){try{return localStorage.getItem(key)}catch{return null}},setItem(key,value){try{localStorage.setItem(key,value);return true}catch{return false}},removeItem(key){try{localStorage.removeItem(key);return true}catch{return false}}}
  };
})();
