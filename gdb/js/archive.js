/* Imported ZIPs are data sources. Their scripts, HTML and vendor files never execute. */
(() => {
'use strict';
const MiB=1024*1024;
const LIMITS=Object.freeze({entries:200000,catalogue:32*MiB,chunk:128*MiB,attachment:256*MiB,directoryRead:64*MiB});
const abort=()=>new DOMException('Import or view cancelled','AbortError');
const reserved=/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i;
function pathName(value,directory=false){
  if(typeof value!=='string'||!value||value.length>2048||/[\\\x00-\x1f<>:"|?*#%]/.test(value)||value.startsWith('/'))throw Error('Unsafe GDB Explorer File resource path');
  const name=directory&&value.endsWith('/')?value.slice(0,-1):value;
  const parts=name.split('/');
  if(parts.some(part=>!part||part==='.'||part==='..'||/[. ]$/.test(part)||reserved.test(part)))throw Error('Unsafe or ambiguous GDB Explorer File resource path: '+value);
  return name;
}
function parseWrapped(text,kind){
  text=text.replace(/^\uFEFF/,'').trim();
  const prefix=kind==='catalogue'?'window.GDBCatalogue=':'GDBChunks.receive(document.currentScript,';
  const suffix=kind==='catalogue'?';':');';
  if(!text.startsWith(prefix)||!text.endsWith(suffix))throw Error('Invalid '+kind+' data wrapper; expected JSON-only GDB Explorer data');
  try{return JSON.parse(text.slice(prefix.length,-suffix.length))}catch{throw Error('Invalid '+kind+' JSON; imported JavaScript is never executed')}
}
function validCatalogue(data,entries,prefix){
  if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.featureSets)||typeof data.name!=='string')throw Error('Invalid GDB catalogue');
  const text=(value,label)=>{if(value!=null&&(typeof value!=='string'||value.length>4096))throw Error('Invalid catalogue '+label)};
  const sourcePath=value=>text(value,'source path');
  const count=(value,label)=>{if(value!=null&&(typeof value!=='number'||!Number.isSafeInteger(value)||value<0))throw Error('Invalid catalogue '+label)};
  text(data.name,'name');sourcePath(data.path);
  if(data.featureSets.length>LIMITS.entries)throw Error('Catalogue exceeds the 200,000 item limit');
  let items=data.featureSets.length;
  const check=(ref,required=false)=>{
    if(!ref){if(required)throw Error('Catalogue is missing a required data reference');return}
    if(typeof ref!=='object'||typeof ref.path!=='string'||!ref.path.startsWith('data/'))throw Error('Invalid catalogue data reference');
    count(ref.count,'page count');
    const entry=entries.get(prefix+pathName(ref.path));
    if(!entry||entry.directory)throw Error('GDB Explorer File is missing referenced data: '+ref.path);
    if(entry.uncompressedSize>LIMITS.chunk)throw Error('Referenced data exceeds the 128 MiB chunk limit: '+ref.path);
  };
  check(data.storageFile,true);check(data.metadataFile);
  for(const group of data.featureSets){
    if(!group||typeof group.name!=='string'||!Array.isArray(group.features))throw Error('Invalid GDB catalogue group');
    text(group.name,'group name');text(group.kind,'group kind');sourcePath(group.path);
    if(group.kind!=='root'){
      const base=String(data.path||'').replaceAll('\\','/').replace(/\/$/,''),full=String(group.path||'').replaceAll('\\','/');
      const relative=base&&full.startsWith(base+'/')?full.slice(base.length+1):group.name;
      if(relative.split('/').filter(Boolean).length>32)throw Error('Catalogue hierarchy exceeds 32 nested dataset levels');
    }
    items+=group.features.length;if(items>LIMITS.entries)throw Error('Catalogue exceeds the 200,000 item limit');
    check(group.metadataFile);
    for(const item of group.features){
      if(!item||typeof item.name!=='string'||!Array.isArray(item.attributeColumns))throw Error('Invalid GDB catalogue dataset');
      text(item.name,'dataset name');text(item.kind,'dataset kind');text(item.geometryType,'geometry type');count(item.rowCount,'row count');count(item.exportedRowCount,'exported row count');
      if(item.attributeColumns.length>10000||item.attributeColumns.some(column=>typeof column!=='string'||column.length>4096))throw Error('Invalid catalogue attribute columns');
      for(const key of ['schemaFile','analyticsFile','metadataFile','geometryFile','spatialAttributeIndexFile','attachmentParentIndexFile'])check(item[key],key==='schemaFile');
      for(const key of ['attributePages','spatialAttributePages','attachmentPages']){
        if(item[key]!=null&&!Array.isArray(item[key]))throw Error('Invalid catalogue page list');
        for(const ref of item[key]||[])check(ref);
      }
    }
  }
  return data;
}
async function prepare(file,signal,onProgress=()=>{}){
  if(!(file instanceof Blob)||file.size<22)throw Error('Choose a compatible GDB Explorer File (.zip); raw .gdb folders are not supported');
  if(!window.zip?.ZipReader)throw Error('The file reader is missing. Extract the complete GDB Explorer installation folder.');
  if(signal?.aborted)throw abort();
  const nativeStreams=window.__GDB_IMPORT_TEST__?.nativeStreams!==false;
  zip.configure({maxWorkers:1,chunkSize:64*1024,terminateWorkerTimeout:1000,workerStartupTimeout:1500,useWebWorkers:true});
  // zip.js reads the central directory at once. Bound that allocation separately
  // from decompressed payloads; payload reads remain streamed and bounded below.
  const input=new zip.BlobReader(file),read=input.readUint8Array.bind(input);
  input.readUint8Array=(offset,length,...args)=>{if(length>LIMITS.directoryRead)throw Error('GDB Explorer File directory exceeds the 64 MiB metadata-read limit');return read(offset,length,...args)};
  const reader=new zip.ZipReader(input,{useWebWorkers:true,useCompressionStream:nativeStreams,checkSignature:true,checkCrc32:true,checkOverlappingEntry:true,strictness:'strict'});
  const lifetime=new AbortController(),entries=new Map(),aliases=new Set(),directories=new Set(),files=new Set(),urls=new Map(),scopeEpochs=new Map();
  let disposed=false,entryReads=0,readBytes=0,ioQueue=Promise.resolve();
  const active=()=>{if(disposed||lifetime.signal.aborted||signal?.aborted)throw abort()};
  const dispose=()=>{if(disposed)return;disposed=true;lifetime.abort();for(const value of urls.values())URL.revokeObjectURL(value.url);urls.clear();entries.clear();reader.close().catch(()=>{})};
  async function extractNow(entry,limit,viewSignal,text){
    active();if(viewSignal?.aborted)throw abort();
    if(!entry||entry.directory)throw Error('GDB Explorer File resource is missing');
    if(entry.uncompressedSize>limit)throw Error('GDB Explorer File resource exceeds its '+(limit/MiB)+' MiB read limit');
    const controller=new AbortController(),cancel=()=>controller.abort();
    lifetime.signal.addEventListener('abort',cancel,{once:true});viewSignal?.addEventListener('abort',cancel,{once:true});signal?.addEventListener('abort',cancel,{once:true});
    const parts=[],decoder=text?new TextDecoder('utf-8',{fatal:true}):null;let count=0;
    let yielded=performance.now();
    const writable=new WritableStream({async write(chunk){
      if(controller.signal.aborted)throw abort();count+=chunk.byteLength;
      if(count>limit||count>entry.uncompressedSize)throw Error('GDB Explorer File resource exceeds its declared or allowed size');
      parts.push(text?decoder.decode(chunk,{stream:true}):chunk.slice());
      // If workers are blocked, zip.js uses its bundled inline inflater. Yield
      // between bounded output chunks rather than running an unbroken unzip.
      if(performance.now()-yielded>8){await new Promise(resolve=>setTimeout(resolve,0));yielded=performance.now()}
    }});
    try{
      await entry.getData(writable,{signal:controller.signal,checkSignature:true,checkCrc32:true,checkOverlappingEntry:true,useWebWorkers:true,useCompressionStream:nativeStreams});active();
      if(count!==entry.uncompressedSize)throw Error('GDB Explorer File resource size does not match its directory entry');
      entryReads++;readBytes+=count;
      return text?parts.join('')+decoder.decode():new Blob(parts);
    }finally{lifetime.signal.removeEventListener('abort',cancel);viewSignal?.removeEventListener('abort',cancel);signal?.removeEventListener('abort',cancel)}
  }
  // One decompressor at a time bounds transient memory even under rapid clicks.
  const extract=(...args)=>{const work=ioQueue.catch(()=>{}).then(()=>extractNow(...args));ioQueue=work.then(()=>undefined,()=>undefined);return work};
  try{
    let count=0;
    for await(const entry of reader.getEntriesGenerator()){
      active();if(++count>LIMITS.entries)throw Error('GDB Explorer File exceeds the 200,000 entry limit');
      const name=pathName(entry.filename,entry.directory),identity=name.normalize('NFC').toLowerCase();
      const mode=(entry.externalFileAttributes>>>16)&0xf000;
      if(aliases.has(identity))throw Error('GDB Explorer File contains duplicate or case-aliased resource paths');
      if(mode&&mode!==0x8000&&mode!==0x4000)throw Error('GDB Explorer File contains a symbolic link or non-regular member');
      if(entry.encrypted)throw Error('Encrypted GDB Explorer File entries are not supported');
      if(!Number.isSafeInteger(entry.uncompressedSize)||entry.uncompressedSize<0||!Number.isSafeInteger(entry.compressedSize)||entry.compressedSize<0)throw Error('Invalid GDB Explorer File entry size');
      if(!entry.directory&&![0,8].includes(entry.compressionMethod))throw Error('Unsupported GDB Explorer File compression method');
      aliases.add(identity);entries.set(name,entry);
      (entry.directory?directories:files).add(identity);
      const parts=identity.split('/');for(let i=1;i<parts.length;i++)directories.add(parts.slice(0,i).join('/'));
      if(count%512===0){onProgress('Checking GDB Explorer File directory · '+count.toLocaleString()+' entries');await new Promise(resolve=>setTimeout(resolve,0))}
    }
    for(const filePath of files)if(directories.has(filePath))throw Error('GDB Explorer File contains a file/folder path collision');
    const catalogues=[...entries.keys()].filter(name=>name==='data/catalogue.js'||name.endsWith('/data/catalogue.js'));
    if(catalogues.length!==1)throw Error('Choose one compatible GDB Explorer File containing exactly one data/catalogue.js');
    const catalogueName=catalogues[0],prefix=catalogueName.slice(0,-'data/catalogue.js'.length);
    const info=entries.get(prefix+'BUILD_INFO.json');
    if(!info)throw Error('GDB BUILD_INFO.json is missing. Create a new GDB Explorer File using the toolbox.');
    const build=JSON.parse(await extract(info,MiB,signal,true));
    if(!build||!['22.5','22.6','22.7'].includes(build.version))throw Error('Unsupported GDB Explorer File format. Create a new file using the GDB Explorer toolbox.');
    onProgress('Reading catalogue…');
    const catalogue=validCatalogue(parseWrapped(await extract(entries.get(catalogueName),LIMITS.catalogue,signal,true),'catalogue'),entries,prefix);
    active();
    return {catalogue,name:typeof file.name==='string'?file.name:'GDB_Explorer_File.zip',version:build.version,dispose,
      async load(ref,viewSignal){const name=pathName(ref.path);if(!name.startsWith('data/'))throw Error('Imported data must be beneath data/');return parseWrapped(await extract(entries.get(prefix+name),LIMITS.chunk,viewSignal,true),'chunk')},
      weight(ref){return entries.get(prefix+pathName(ref.path))?.uncompressedSize||0},
      async attachmentURL(attachment,viewSignal,scope='view'){
        const scopeEpoch=scopeEpochs.get(scope)||0;
        const name=pathName(attachment.dataUrl);if(!name.startsWith('attachments/'))throw Error('Invalid imported attachment path');
        const entry=entries.get(prefix+name);if(!entry)throw Error('Attachment is missing from the GDB Explorer File');
        const key=scope+'\n'+name,existing=urls.get(key);if(existing)return existing.url;
        const viewBytes=[...urls.values()].filter(value=>value.scope==='view').reduce((sum,value)=>sum+value.bytes,0);
        if(scope==='view'&&(entry.uncompressedSize>16*MiB||viewBytes+entry.uncompressedSize>64*MiB))throw Error('Thumbnail memory limit reached; use View or Download');
        const blob=await extract(entry,LIMITS.attachment,viewSignal,false);active();if(viewSignal?.aborted||scopeEpoch!==(scopeEpochs.get(scope)||0))throw abort();
        if(urls.has(key))return urls.get(key).url;
        if(scope==='view'&&[...urls.values()].filter(value=>value.scope==='view').reduce((sum,value)=>sum+value.bytes,0)+blob.size>64*MiB)throw Error('Thumbnail memory limit reached; use View or Download');
        // HTML and SVG are download-only; never create an executable document from archive content.
        const type=/^(image\/(png|jpeg|gif|webp|avif|bmp)|application\/pdf)$/i.test(String(attachment.contentType||''))?attachment.contentType:'application/octet-stream';
        const url=URL.createObjectURL(new Blob([blob],{type}));urls.set(key,{url,scope,bytes:blob.size});return url;
      },
      release(scope){for(const name of scope?[scope]:['view','modal','download'])scopeEpochs.set(name,(scopeEpochs.get(name)||0)+1);for(const [key,value] of urls)if(!scope||value.scope===scope){URL.revokeObjectURL(value.url);urls.delete(key)}},
      stats:()=>({entryCount:count,entryReads,readBytes,objectURLs:urls.size,objectURLBytes:[...urls.values()].reduce((sum,value)=>sum+value.bytes,0),disposed})
    };
  }catch(error){dispose();throw error}
}
window.GDBArchive={prepare,limits:LIMITS,parseWrapped,pathName};
})();
