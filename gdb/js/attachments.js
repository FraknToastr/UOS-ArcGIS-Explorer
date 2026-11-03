function attachmentKind(a){
  const t=String(a.contentType||"").toLowerCase();
  if(/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(t))return"image";
  if(t==="application/pdf"||String(a.name||"").toLowerCase().endsWith(".pdf"))return"pdf";
  return"file";
}
const ATTACHMENT_THUMBNAIL_STORAGE="gdbExplorerAttachmentThumbnails";
let attachmentThumbnails=GDBChunks.storage.getItem(ATTACHMENT_THUMBNAIL_STORAGE)==="true";

function attachmentPreviewHTML(attachment,enabled){
  const kind=attachmentKind(attachment);
  if(enabled&&kind==="image"&&attachment.embedded&&attachment.dataUrl){
    if(GDBChunks.isArchive?.())return `<img loading="lazy" decoding="async" data-gdb-preview="${esc(attachment.dataUrl)}" data-gdb-type="${esc(attachment.contentType)}" alt="${esc(attachment.name)}">`;
    return `<img loading="lazy" decoding="async" src="${esc(attachment.dataUrl)}" alt="${esc(attachment.name)}">`;
  }
  return `<div class="fileGlyph">${kind==="image"?"IMAGE":kind==="pdf"?"PDF":"FILE"}</div>`;
}
function attachmentActionsHTML(attachment,index,viewClass){
  if(!attachment.embedded||!attachment.dataUrl)return '<span class="contextMeta">Excluded by export size limit</span>';
  const imported=GDBChunks.isArchive?.();
  return `<button class="btn ${viewClass}" data-index="${index}" type="button">View</button><a class="btn" href="${imported?'#':esc(attachment.dataUrl)}" ${imported?`data-gdb-download="${esc(attachment.dataUrl)}" data-gdb-type="${esc(attachment.contentType)}"`:''} download="${esc(attachment.name)}">Download</a>`;
}

async function renderAttachments(page=0,version=renderVersion,signal=renderAbort.signal){
  const item=selected,pages=item.attachmentPages||[];
  page=Math.max(0,Math.min(page,Math.max(0,pages.length-1)));
  const loaded=pages.length?await GDBChunks.load(pages[page],signal):[];
  if(signal.aborted||version!==renderVersion)return;
  item.attachments=loaded;
  panel.innerHTML="";
  const wrap=document.createElement("div");wrap.className="panelScroll";
  const cards=()=>loaded.map((attachment,index)=>`<article class="attachCard">
    <div class="thumb">${attachmentPreviewHTML(attachment,attachmentThumbnails)}</div>
    <div class="attachBody">
      <div class="attachName" title="${esc(attachment.name)}">${esc(attachment.name)}</div>
      <div class="attachParent">${esc(attachment.parentLabel||"")}</div>
      <div class="contextMeta">${esc(attachment.contentType)} · ${bytes(attachment.sizeBytes)}</div>
      <div class="actions">${attachmentActionsHTML(attachment,index,"viewAttachment")}</div>
    </div></article>`).join("");
  wrap.innerHTML=`<div class="attachPager attachmentToolbar">
    <div class="pageControls">
      <button class="btn" data-attachment-page="${page-1}" type="button" ${page===0?"disabled":""}>Previous</button>
      <span>${loaded.length?`Attachments ${page*40+1}–${page*40+loaded.length} of ${Number(item.attachmentSummary.count).toLocaleString()}`:"No attachments"}</span>
      <button class="btn" data-attachment-page="${page+1}" type="button" ${page>=pages.length-1?"disabled":""}>Next</button>
    </div>
    <label class="thumbnailToggle"><input id="attachmentThumbnails" type="checkbox" ${attachmentThumbnails?"checked":""}>Show thumbnails</label>
  </div>
  ${loaded.length?`<div class="gallery">${cards()}</div>`:'<div class="welcome"><div><strong>No attachments</strong>This layer has no linked attachments.</div></div>'}`;
  panel.appendChild(wrap);
  hydrateAttachmentPreviews(wrap,signal);
  const toggle=wrap.querySelector("#attachmentThumbnails");
  toggle.checked=attachmentThumbnails;
  toggle.addEventListener("change",()=>{
    attachmentThumbnails=toggle.checked;
    GDBChunks.storage.setItem(ATTACHMENT_THUMBNAIL_STORAGE,String(attachmentThumbnails));
    if(!attachmentThumbnails)GDBChunks.releaseAttachments?.('view');
    // Replace only cards on this page; keep paging controls, scroll position and loaded data.
    const gallery=wrap.querySelector(".gallery");
    if(loaded.length&&gallery)gallery.innerHTML=cards();
    hydrateAttachmentPreviews(wrap,signal);
  });
  const navigate=newPage=>{
    renderAbort.abort();renderAbort=new AbortController();const next=++renderVersion;
    GDBChunks.releaseAttachments?.('view');closeModal();
    panel.innerHTML='<div class="loadMessage">Loading attachments…</div>';
    renderAttachments(newPage,next,renderAbort.signal).catch(err=>{if(next===renderVersion&&err.name!=="AbortError")panel.innerHTML=`<div class="loadMessage">${esc(err.message)}. Select Attachments to retry.</div>`});
  };
  wrap.querySelectorAll("[data-attachment-page]").forEach(button=>{
    button.addEventListener("click",()=>navigate(Number(button.dataset.attachmentPage)));
  });
}

panel.addEventListener("click",e=>{
  const b=e.target.closest(".viewAttachment");
  if(!b||!selected||activeTab!=="attachments")return;
  openAttachment(selected.attachments[Number(b.dataset.index)]);
});

let attachmentModalAbort=null;
function hydrateAttachmentPreviews(root,signal){
  if(!GDBChunks.isArchive?.())return;
  (async()=>{for(const img of root.querySelectorAll('[data-gdb-preview]')){
    if(signal?.aborted||!img.isConnected)return;
    try{const url=await GDBChunks.attachmentURL({dataUrl:img.dataset.gdbPreview,contentType:img.dataset.gdbType},signal,'view');if(!signal?.aborted&&img.isConnected)img.src=url}
    catch(error){if(error.name!=='AbortError'&&img.isConnected){img.alt='Thumbnail unavailable · use View';img.title=error.message}}
  }})();
}
document.addEventListener('click',event=>{
  const link=event.target.closest?.('[data-gdb-download]');if(!link)return;
  event.preventDefault();
  GDBChunks.releaseAttachments?.('download');
  const a={dataUrl:link.dataset.gdbDownload,contentType:link.dataset.gdbType,name:link.download};
  link.setAttribute('aria-busy','true');
  GDBChunks.attachmentURL(a,renderAbort?.signal,'download').then(url=>{
    if(!link.isConnected)return;const action=document.createElement('a');action.href=url;action.download=a.name||'attachment';document.body.appendChild(action);action.click();action.remove();
  }).catch(error=>{if(error.name!=='AbortError')link.title='Download failed: '+error.message}).finally(()=>link.removeAttribute('aria-busy'));
});
async function openAttachment(a){
  if(!a?.embedded||!a.dataUrl)return;
  closeModal();const controller=new AbortController();attachmentModalAbort=controller;
  document.getElementById("modalTitle").textContent=a.name||"Attachment";
  const dl=document.getElementById("modalDownload");dl.download=a.name||"attachment";
  const body=document.getElementById("modalBody");body.innerHTML="";
  document.getElementById("modal").classList.add("open");
  let url=a.dataUrl;
  if(GDBChunks.isArchive?.()){
    body.textContent='Loading attachment…';
    try{url=await GDBChunks.attachmentURL(a,controller.signal,'modal')}
    catch(error){if(!controller.signal.aborted)body.textContent='Attachment could not load: '+error.message;return}
    if(controller.signal.aborted)return;body.innerHTML='';
  }
  dl.href=url;
  const kind=attachmentKind(a);
  if(kind==="image"){const img=document.createElement("img");img.src=url;body.appendChild(img)}
  else if(kind==="pdf"){const fr=document.createElement("iframe");fr.src=url;fr.setAttribute('sandbox','allow-same-origin');body.appendChild(fr)}
  else{body.innerHTML=`<div class="notice" style="color:white">No inline viewer for this file type. Use Download.</div>`}
  document.getElementById("modal").classList.add("open");
}
function closeModal(){attachmentModalAbort?.abort();attachmentModalAbort=null;GDBChunks.releaseAttachments?.('modal');GDBChunks.releaseAttachments?.('download');document.getElementById("modal").classList.remove("open");document.getElementById("modalBody").innerHTML="";document.getElementById("modalDownload").removeAttribute("href")}
document.getElementById("modalClose").addEventListener("click",closeModal);
document.getElementById("modal").addEventListener("click",e=>{if(e.target.id==="modal")closeModal()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});

