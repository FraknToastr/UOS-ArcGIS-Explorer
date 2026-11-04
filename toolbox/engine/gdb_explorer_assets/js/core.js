
window.__GDB_LAST_RUNTIME_ERROR__="";
window.addEventListener("error",e=>{
  window.__GDB_LAST_RUNTIME_ERROR__=e?.message||"Unknown JavaScript error";
});
window.addEventListener("unhandledrejection",e=>{
  window.__GDB_LAST_RUNTIME_ERROR__=
    e?.reason?.message||String(e?.reason||"Unhandled promise rejection");
});

let DATA=window.GDBCatalogue;
delete window.GDBCatalogue;
const tree=document.getElementById("tree");
const treeNodes=document.getElementById("treeNodes");
const panel=document.getElementById("panel");
const tabs=document.getElementById("tabs");
const attachmentTab=document.getElementById("attachmentTab");
const spatialTab=document.getElementById("spatialTab");
let selected=null,selectedSet=null,selectedId=null,activeTab="attributes";
let tableState=null;
let renderVersion=0,renderAbort=null,disposeView=()=>{};

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const bytes=n=>{n=Number(n||0);if(n<1024)return n+" B";if(n<1048576)return(n/1024).toFixed(1)+" KB";if(n<1073741824)return(n/1048576).toFixed(1)+" MB";return(n/1073741824).toFixed(2)+" GB"};
const geomGlyph=g=>{g=String(g||"").toLowerCase();if(g.includes("point"))return"●";if(g.includes("polyline")||g.includes("line"))return"━";if(g.includes("polygon"))return"▰";return""};
const geomTitle=g=>g||"Non-spatial table";
const hasAttachments=f=>Number(f?.attachmentSummary?.count||0)>0;
const setHasAttachments=s=>s.features.some(hasAttachments);
const setGeometries=s=>[...new Set(s.features.map(f=>f.geometryType).filter(Boolean))];

document.getElementById("gdbEyebrow").textContent=DATA.name||"Geodatabase";

// Complete catalogue model, with a bounded window of visible tree rows.
let treePage=0,treeQuery="",treeRows=[],treeModel=new Map(),treeFocus="gdb-root",treeNotice="";
let expansionLevel=Number(GDBChunks.storage.getItem("gdbExplorerExpandLevel")||3);
const treeExpansion=new Map(),TREE_ROW_HEIGHT=30,TREE_WINDOW=200;
let treeCatalogueSets=null,treeCatalogueSources=[],treeCatalogueLayers=[];
let treeRevision=0,treeWindowKey="";
function treeIcon(type,geometry){
  const g=String(geometry||"").toLowerCase();
  const path=type==="database"?'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>':
    type==="folder"?'<path d="M3 6h7l2 3h9v11H3ZM3 9h18"/>':
    type==="table"?'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16"/>':
    g.includes("point")?'<circle cx="8" cy="8" r="2"/><circle cx="17" cy="14" r="2"/><circle cx="7" cy="18" r="2"/>':
    g.includes("line")?'<path d="m3 18 6-12 6 10 6-12"/>':
    g.includes("polygon")?'<path d="m4 5 13-2 4 12-9 6-9-7Z"/>':'<path d="M5 3h10l4 4v14H5ZM14 3v5h5M8 12h8M8 16h8"/>';
  return `<svg class="catalogueIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}
function buildTree(){
  const scrollPosition=tree.scrollTop;
  let model=treeModel,rootNode=model.get("gdb-root");
  if(treeCatalogueSets!==DATA.featureSets||treeCatalogueSources.length!==DATA.featureSets.length||DATA.featureSets.some((set,index)=>treeCatalogueSources[index]!==set.features)){
  model=new Map();rootNode={id:"gdb-root",label:DATA.name||"Geodatabase",type:"database",children:[],depth:0};
  model.set(rootNode.id,rootNode);
  const add=(node,parent)=>{node.parent=parent.id;node.depth=parent.depth+1;parent.children.push(node);model.set(node.id,node);return node};
  const folders=new Map();
  const normalizedFields=new Map();
  DATA.featureSets.forEach((set,si)=>{
    let parent=rootNode;
    if(set.kind!=="root"){
      const base=String(DATA.path||"").replaceAll("\\","/").replace(/\/$/,"");
      const full=String(set.path||"").replaceAll("\\","/");
      const relative=base&&full.startsWith(base+"/")?full.slice(base.length+1):String(set.name||"Dataset");
      let key="";
      for(const part of relative.split("/").filter(Boolean)){
        key+="/"+part;
        if(!folders.has(key))folders.set(key,add({id:`folder-${folders.size}`,label:part,type:"folder",children:[]},parent));
        parent=folders.get(key);
      }
    }
    const groupSearch=String(set.name||"").toLowerCase();
    set.features.forEach((feature,fi)=>{
      const fields=String(feature.searchText||"");
      if(!normalizedFields.has(fields))normalizedFields.set(fields,fields.toLowerCase());
      add({id:`layer-${si}-${fi}`,label:feature.name,labelSearch:String(feature.name||"").toLowerCase(),groupSearch,fieldSearch:normalizedFields.get(fields),type:feature.kind==="Table"?"table":"feature",geometry:feature.geometryType,count:feature.rowCount,attachments:Number(feature.attachmentSummary?.count||0),children:[]},parent);
    });
  });
  treeCatalogueSets=DATA.featureSets;treeCatalogueSources=DATA.featureSets.map(set=>set.features);
  treeCatalogueLayers=[...model.values()].filter(node=>node.type==="feature"||node.type==="table");
  }
  const mark=(node,ancestorMatch=false)=>{
    const own=!treeQuery||(node.labelSearch||String(node.label).toLowerCase()).includes(treeQuery)||node.groupSearch?.includes(treeQuery)||node.fieldSearch?.includes(treeQuery);
    let any=false;
    for(const child of node.children)any=mark(child,ancestorMatch||own)||any;
    node.matches=!treeQuery||ancestorMatch||own||any;
    return node.matches;
  };
  mark(rootNode);
  rootNode.count=treeCatalogueLayers.reduce((count,node)=>count+Number(node.matches),0);
  treeNotice=rootNode.count?"":treeQuery?"No matching datasets.":"No datasets found.";
  const rows=[];
  const visit=(node,reveal=false)=>{
    if(!node.matches&&!reveal)return;
    const branch=node.type==="database"||node.type==="folder";
    node.branch=branch;
    node.open=branch&&(treeQuery?true:(treeExpansion.has(node.id)?treeExpansion.get(node.id):node.depth<expansionLevel-1));
    rows.push(node);
    if(node.open){
      const children=treeQuery?node.children.filter(c=>c.matches||reveal):node.children;
      children.forEach((child,i)=>{child.pos=i+1;child.siblings=children.length;visit(child,reveal||(!!treeQuery&&String(node.label).toLowerCase().includes(treeQuery))) });
    }
  };
  // Root remains present for an empty catalogue or an unmatched search.
  rootNode.matches=true;visit(rootNode);
  treeModel=model;treeRows=rows;
  treeRevision++;
  if(!rows.some(n=>n.id===treeFocus))treeFocus=rows[0].id;
  treeNodes.setAttribute("role","tree");treeNodes.setAttribute("aria-label","Geodatabase catalogue");
  treeNodes.style.position="relative";treeNodes.style.height=(rows.length*TREE_ROW_HEIGHT+(treeNotice?60:0))+"px";
  renderTreeWindow(scrollPosition);
}
function renderTreeWindow(scrollPosition){
  const hadFocus=treeNodes.contains(document.activeElement);
  const scroll=typeof scrollPosition==="number"?scrollPosition:tree.scrollTop;
  const start=Math.max(0,Math.min(Math.floor((scroll/TREE_ROW_HEIGHT-8)/32)*32,Math.max(0,treeRows.length-TREE_WINDOW)));
  const rows=treeRows.slice(start,start+TREE_WINDOW);
  if(hadFocus&&!rows.some(node=>node.id===treeFocus))treeFocus=rows[0]?.id||"gdb-root";
  const key=`${treeRevision}/${start}/${treeFocus}/${selectedId}`;
  if(key===treeWindowKey)return;
  treeWindowKey=key;
  treeNodes.innerHTML=rows.map((node,index)=>{
    const selected=node.id===selectedId;
    return `<div role="treeitem" id="toc-${node.id}" aria-level="${node.depth+1}" aria-posinset="${node.pos||1}" aria-setsize="${node.siblings||1}" aria-selected="${selected}" ${node.branch?`aria-expanded="${node.open}"`:""} tabindex="${node.id===treeFocus?0:-1}" class="treeRow${selected?" active":""}" data-id="${node.id}" data-kind="${node.branch?"branch":"layer"}" style="top:${(start+index)*TREE_ROW_HEIGHT}px;--depth:${node.depth}"><span class="twisty" aria-hidden="true">${node.branch?`<svg viewBox="0 0 16 16" class="disclosure ${node.open?"open":""}"><path d="m6 3 5 5-5 5"/></svg>`:""}</span>${treeIcon(node.type,node.geometry)}${node.attachments?`<span class="attachmentIndicator" data-tooltip="${node.attachments.toLocaleString()} attachments" aria-label="${node.attachments.toLocaleString()} attachments available"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 12.5 13 7a3.5 3.5 0 0 1 5 5l-6.5 6.5a5 5 0 1 1-7-7L11 5.5"/></svg></span>`:""}<span class="nodeLabel" data-tooltip="${esc(node.label)}">${esc(node.label)}</span><span class="tocCount">${node.count==null?"":Number(node.count).toLocaleString()}</span></div>`;
  }).join("")+(treeNotice?`<div class="emptyTree" role="presentation" style="position:absolute;top:${treeRows.length*TREE_ROW_HEIGHT}px">${esc(treeNotice)}</div>`:"");
  if(hadFocus)treeNodes.querySelector(`[data-id="${CSS.escape(treeFocus)}"]`)?.focus({preventScroll:true});
}
// Kept as a no-op for the existing theme/resize hooks; row widths use CSS.
function sizeTocPills(){}
function focusTree(id){
  const index=treeRows.findIndex(n=>n.id===id);if(index<0)return;
  treeFocus=id;
  const top=index*TREE_ROW_HEIGHT;
  if(top<tree.scrollTop)tree.scrollTop=top;
  else if(top+TREE_ROW_HEIGHT>tree.scrollTop+tree.clientHeight)tree.scrollTop=top+TREE_ROW_HEIGHT-tree.clientHeight;
  renderTreeWindow();treeNodes.querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus({preventScroll:true});
}
function toggleBranch(id,force){
  const node=treeModel.get(id);if(!node?.branch)return;
  treeExpansion.set(id,force===undefined?!node.open:force);
  document.querySelectorAll(".expandPill").forEach(button=>{button.classList.remove("active");button.setAttribute("aria-pressed","false")});
  buildTree();focusTree(id);
}
tree.addEventListener("scroll",renderTreeWindow,{passive:true});
tree.addEventListener("focusin",event=>{const row=event.target.closest(".treeRow");if(row)treeFocus=row.dataset.id});
tree.addEventListener("click",event=>{
  const row=event.target.closest(".treeRow");if(!row)return;
  const id=row.dataset.id;focusTree(id);
  if(row.dataset.kind==="branch")toggleBranch(id);else selectLayer(id);
});
tree.addEventListener("keydown",event=>{
  const row=event.target.closest(".treeRow");if(!row||event.altKey||event.ctrlKey||event.metaKey)return;
  const id=row.dataset.id,index=treeRows.findIndex(n=>n.id===id),node=treeRows[index];
  let target;
  if(event.key==="ArrowDown")target=treeRows[Math.min(index+1,treeRows.length-1)]?.id;
  else if(event.key==="ArrowUp")target=treeRows[Math.max(0,index-1)]?.id;
  else if(event.key==="Home")target=treeRows[0]?.id;
  else if(event.key==="End")target=treeRows.at(-1)?.id;
  else if(event.key==="ArrowRight"){
    if(node.branch&&!node.open)toggleBranch(id,true);
    else if(node.open&&node.children.length)target=treeRows[index+1]?.id;
  }else if(event.key==="ArrowLeft"){
    if(node.branch&&node.open)toggleBranch(id,false);else target=node.parent;
  }else if(event.key==="Enter"||event.key===" "){
    if(node.branch)toggleBranch(id);else selectLayer(id);
  }else return;
  event.preventDefault();if(target)focusTree(target);
});

function selectLayer(id){
  const [,si,fi]=id.split("-").map((v,i)=>i?Number(v):v);
  selectedSet=DATA.featureSets[si];
  selected=Object.assign({},selectedSet.features[fi]);
  selectedId=id;

  // Deliberately preserve activeTab when switching layers.
  let ancestor=treeModel.get(id)?.parent;
  while(ancestor){treeExpansion.set(ancestor,true);ancestor=treeModel.get(ancestor)?.parent}
  if(!treeRows.some(node=>node.id===id)){
    treeQuery="";document.getElementById("treeSearch").value="";buildTree();
  }
  const selectedIndex=treeRows.findIndex(node=>node.id===id);
  if(selectedIndex>=0&&(selectedIndex*TREE_ROW_HEIGHT<tree.scrollTop||selectedIndex*TREE_ROW_HEIGHT>tree.scrollTop+tree.clientHeight-TREE_ROW_HEIGHT))tree.scrollTop=selectedIndex*TREE_ROW_HEIGHT;
  renderTreeWindow();

  document.getElementById("layerTitle").textContent=selected.name;
  document.getElementById("layerMeta").textContent=
    `${DATA.featureSets[si].name} · ${selected.kind} · ${selected.rowCount==null?"Unknown":Number(selected.rowCount).toLocaleString()} rows`;

  document.getElementById("layerPills").innerHTML=[
    selected.geometryType?`<span class="pill">${esc(selected.geometryType)}</span>`:"",
    selected.spatialReference?.name?`<span class="pill">${esc(selected.spatialReference.name)}</span>`:"",
    hasAttachments(selected)?`<span class="pill">${Number(selected.attachmentSummary.count).toLocaleString()} attachments</span>`:""
  ].join("");

  // Keep all tabs navigable. Tabs without applicable content present an
  // informative empty state rather than forcing the user to another tab.
  attachmentTab.disabled=false;
  spatialTab.disabled=false;

  tabs.querySelectorAll(".tab").forEach(
    t=>t.classList.toggle("active",t.dataset.tab===activeTab)
  );

  renderActiveTab();
}

tabs.addEventListener("click",e=>{
  const btn=e.target.closest(".tab");
  if(!btn||btn.disabled||(!selected&&btn.dataset.tab!=="storage"))return;
  activeTab=btn.dataset.tab;
  tabs.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t===btn));
  renderActiveTab();
});

async function renderActiveTab(){
  const version=++renderVersion;
  renderAbort?.abort();
  renderAbort=new AbortController();
  const signal=renderAbort.signal;
  disposeView();disposeView=()=>{};
  closeAttachmentModal();
  window.GDBCellValue?.close();
  GDBChunks.releaseAttachments?.('view');
  tableState=null;
  panel.innerHTML='<div class="loadMessage" role="status">Loading selected view…</div>';
  if(!selected&&activeTab!=="storage")return;
  // Drop previous tab payloads; the bounded loader may retain only small reusable chunks.
  if(selected)for(const key of ["fields","attachments","spatialGeoJSON","attributeRows"])delete selected[key];
  const item=selected,group=selectedSet,tab=activeTab;
  try{
    const module=({attributes:"tables",schema:"tables",analytics:"tables",attachments:"attachments",spatial:"spatial",metadata:"metadata",storage:"storage"})[tab];
    await GDBChunks.code(`js/${module}.js`);
    if(signal.aborted)return;
    if(["attributes","schema","analytics","spatial"].includes(tab)){
      const detail=await GDBChunks.load(item.schemaFile,signal);
      if(signal.aborted)return;
      item.fields=detail.fields;
    }
    if(tab==="analytics"){
      const analytics=await GDBChunks.load(item.analyticsFile,signal);
      if(signal.aborted)return;
      item.fields=item.fields.map(f=>Object.assign({},f,analytics[f.name]||{}));
    }
    if(tab==="spatial"){
      await GDBChunks.code("js/attachments.js");
      if(signal.aborted)return;
      item.spatialGeoJSON=item.geometryFile?await GDBChunks.load(item.geometryFile,signal,false):null;
      if(signal.aborted)return;
      if(item.spatialGeoJSON){
        await GDBChunks.code("vendor/maplibre.js");
        if(signal.aborted)return;
        GDBChunks.css("vendor/maplibre.css");
        window.maplibregl?.setWorkerCount?.(1);
      }
    }
    let metadata;
    if(tab==="metadata")metadata=await loadMetadataContext(DATA,group,item,signal);
    let storage;
    if(tab==="storage")storage=await GDBChunks.load(DATA.storageFile,signal);
    if(signal.aborted||version!==renderVersion)return;
    panel.innerHTML="";
    if(tab==="attributes")await renderAttributeTable(0,version,signal);
    else if(tab==="schema")renderSchema();
    else if(tab==="analytics")renderAnalytics();
    else if(tab==="attachments")await renderAttachments(0,version,signal);
    else if(tab==="spatial")await renderSpatial(version,signal);
    else if(tab==="metadata")renderMetadata(metadata);
    else if(tab==="storage")renderStorage(storage);
  }catch(err){
    if(signal.aborted||err?.name==="AbortError"||version!==renderVersion)return;
    panel.innerHTML=`<div class="welcome"><div><strong>Could not load this view</strong>${esc(err.message)}<br>Extract the complete ZIP and keep all folders together. <button class="btn" id="retryView" type="button">Retry</button></div></div>`;
    document.getElementById("retryView").onclick=renderActiveTab;
  }
}
function closeAttachmentModal(){
  if(typeof closeModal==="function")closeModal();
}
window.addEventListener("pagehide",()=>{renderAbort?.abort();disposeView();GDBChunks.clear()});

// Switch catalogues only after import validation completes. View generations and
// abort signals prevent reads from the previous session from repainting this one.
window.GDBWorkspace={
  replace(data,archive=null){
    renderAbort?.abort();++renderVersion;disposeView();disposeView=()=>{};closeAttachmentModal();window.GDBCellValue?.close();
    GDBChunks.setArchive(archive);DATA=data;selected=null;selectedSet=null;selectedId=null;tableState=null;activeTab='attributes';
    treeCatalogueSets=null;treeExpansion.clear();treeQuery='';treeFocus='gdb-root';tree.scrollTop=0;
    document.getElementById('treeSearch').value='';document.getElementById('gdbEyebrow').textContent=DATA.name||'Geodatabase';
    document.getElementById('layerTitle').textContent='Select a layer';document.getElementById('layerMeta').textContent='Choose a dataset from the explorer to load it.';document.getElementById('layerPills').innerHTML='';
    tabs.querySelectorAll('.tab').forEach(tab=>tab.classList.toggle('active',tab.dataset.tab==='attributes'));
    panel.innerHTML='<div class="welcome"><div><strong>'+esc(DATA.name||'GDB Explorer')+'</strong>'+(DATA.featureSets.length?'Choose a dataset to load it.':'Open a modular GDB Explorer export ZIP to explore its data. Imports remain in this tab until you clear them or close the page.')+'</div></div>';
    buildTree();window.dispatchEvent(new CustomEvent('gdbworkspacechange'));
  },
  empty(){return {name:'No ZIP open',path:'',featureSets:[],summary:{}}},
  clear(){this.replace(this.empty())}
};

function applyExpansionLevel(level,persist=true){
  level=Number(level);
  const valid=[1,2,3].includes(level)?level:3;

  expansionLevel=valid;treeExpansion.clear();buildTree();

  document.querySelectorAll(".expandPill").forEach(btn=>{
    btn.classList.toggle("active",Number(btn.dataset.level)===valid);
    btn.setAttribute("aria-pressed",String(Number(btn.dataset.level)===valid));
  });

  if(persist)GDBChunks.storage.setItem("gdbExplorerExpandLevel",String(valid));
}

document.getElementById("expandPills").addEventListener("click",e=>{
  const btn=e.target.closest(".expandPill");
  if(!btn)return;
  applyExpansionLevel(Number(btn.dataset.level));
});

let searchTimer;
document.getElementById("treeSearch").addEventListener("input",e=>{
  const q=e.target.value.trim().toLowerCase();
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>{
    treeQuery=q;treePage=0;buildTree();

  },140);
});

const root=document.documentElement;
const storedTheme=GDBChunks.storage.getItem("gdbExplorerTheme");
root.dataset.theme=(storedTheme==="light"||storedTheme==="dark")?storedTheme:"light";
requestAnimationFrame(sizeTocPills);
function updateThemeButton(){document.getElementById("themeToggle").textContent=root.dataset.theme==="dark"?"Light theme":"Dark theme"}
updateThemeButton();
document.getElementById("themeToggle").addEventListener("click",()=>{
  root.dataset.theme=root.dataset.theme==="dark"?"light":"dark";
  GDBChunks.storage.setItem("gdbExplorerTheme",root.dataset.theme);updateThemeButton();requestAnimationFrame(sizeTocPills);
});

const resizer=document.getElementById("resizer");
let drag=false;
resizer.addEventListener("pointerdown",e=>{drag=true;resizer.classList.add("dragging");resizer.setPointerCapture(e.pointerId)});
resizer.addEventListener("pointermove",e=>{
  if(!drag)return;
  const width=Math.max(420,Math.min(900,e.clientX));
  root.style.setProperty("--sidebar",width+"px");requestAnimationFrame(sizeTocPills);
  GDBChunks.storage.setItem("gdbExplorerSidebarWidth",String(width));
});
resizer.addEventListener("pointerup",()=>{drag=false;resizer.classList.remove("dragging")});
const savedWidth=Number(GDBChunks.storage.getItem("gdbExplorerSidebarWidth"));
if(savedWidth>=420&&savedWidth<=900)root.style.setProperty("--sidebar",savedWidth+"px");

buildTree();
const savedExpandLevel=Number(GDBChunks.storage.getItem("gdbExplorerExpandLevel")||3);
applyExpansionLevel([1,2,3].includes(savedExpandLevel)?savedExpandLevel:3);
window.GDBStartup?.ready();
