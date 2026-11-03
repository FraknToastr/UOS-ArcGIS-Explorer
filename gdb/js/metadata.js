/* Keep metadata lazy, but capture the complete selected hierarchy before rendering. */
async function loadMetadataContext(gdb,group,layer,signal){
  async function read(source){
    if(signal?.aborted)throw new DOMException("View changed","AbortError");
    const inline=source?.metadata;
    if(!source?.metadataFile){
      return inline&&typeof inline==="object"&&!Array.isArray(inline)?inline:
        {error:"Metadata was not included in this export. Re-export this geodatabase with the updated toolbox."};
    }
    try{
      const value=await GDBChunks.load(source.metadataFile,signal);
      if(!value||typeof value!=="object"||Array.isArray(value))throw new Error("The exported metadata file is invalid.");
      return value;
    }catch(error){
      if(signal?.aborted||error?.name==="AbortError")throw error;
      // A missing file is different from an item that genuinely has no recorded metadata.
      return {error:"Metadata could not be loaded. "+error.message};
    }
  }
  const metadata={gdb:await read(gdb),group:{},layer:{}};
  if(group?.kind==="featureDataset")metadata.group=await read(group);
  metadata.layer=await read(layer);
  return metadata;
}

function safeMetadataHtml(raw){
  if(raw===null||raw===undefined||String(raw).trim()===""){
    return `<span class="metadataEmpty">Not supplied</span>`;
  }

  const parser=new DOMParser();
  const doc=parser.parseFromString(String(raw),"text/html");

  const allowedTags=new Set([
    "DIV","P","SPAN","BR",
    "UL","OL","LI",
    "B","STRONG","I","EM","U",
    "H1","H2","H3","H4",
    "A"
  ]);

  const safeAttrs=new Set(["href","title"]);

  [...doc.body.querySelectorAll("*")].forEach(el=>{
    if(!allowedTags.has(el.tagName)){
      // Preserve readable text/children while removing unsupported markup.
      el.replaceWith(...el.childNodes);
      return;
    }

    [...el.attributes].forEach(attr=>{
      const name=attr.name.toLowerCase();
      if(!safeAttrs.has(name)){
        el.removeAttribute(attr.name);
        return;
      }

      if(name==="href"){
        const value=String(attr.value||"").trim();
        const allowed=/^(https?:|mailto:|#)/i.test(value);
        if(!allowed)el.removeAttribute("href");
        else{
          el.setAttribute("target","_blank");
          el.setAttribute("rel","noopener noreferrer");
        }
      }
    });
  });

  // Remove executable/non-content elements that DOMParser may retain.
  doc.body.querySelectorAll("script,style,iframe,object,embed,link,meta").forEach(
    el=>el.remove()
  );

  return doc.body.innerHTML||`<span class="metadataEmpty">Not supplied</span>`;
}

function metadataValue(v){
  if(Array.isArray(v)){
    if(!v.length)return `<span class="metadataEmpty">Not supplied</span>`;
    return `<div class="metadataTags">${v.map(x=>`<span class="metadataTag">${esc(x)}</span>`).join("")}</div>`;
  }
  if(v===null||v===undefined||String(v).trim()===""){
    return `<span class="metadataEmpty">Not supplied</span>`;
  }
  return esc(v);
}

function metadataCard(level,title,metadata,generatedRows=[],sectionId=""){
  metadata=metadata||{};

  const rows=[
    {key:"Title",value:metadata.title},
    {key:"Summary",value:metadata.summary},
    {key:"Description",value:metadata.description,html:true},
    {key:"Tags",value:metadata.tags||[]},
    {key:"Credits",value:metadata.credits},
    {key:"Access constraints",value:metadata.accessConstraints},
    ...generatedRows.map(([key,value])=>({key,value}))
  ];

  return `<section class="metadataCard" ${sectionId?`id="${esc(sectionId)}"`:""}>
    <div class="metadataCardHead">
      <strong>${esc(title)}</strong>
      <span class="metadataLevel">${esc(level)}</span>
    </div>
    ${metadata.error?`<p class="metadataReadError" role="alert">${esc(metadata.error)}</p>`:""}
    <div class="metadataRows">
      ${rows.map(row=>`
        <div class="metadataRow">
          <div class="metadataKey">${esc(row.key)}</div>
          <div class="metadataValue${row.html?" metadataHtml":""}">${row.html?safeMetadataHtml(row.value):metadataValue(row.value)}</div>
        </div>
      `).join("")}
    </div>
  </section>`;
}

function friendlyDatasetType(value,selectedItem){
  const v=String(value||"").trim();
  const low=v.toLowerCase();
  if(low==="featureclass"||low==="feature class")return"Feature Class";
  if(low==="table")return"Table";
  if(low==="relationshipclass"||low==="relationship class")return"Relationship Class";
  if(low==="featuredataset"||low==="feature dataset")return"Feature Dataset";
  if(low==="view")return"View";
  return v||(selectedItem?.geometryType?"Feature Class":"Dataset");
}

function renderMetadata(metadata){
  const viewport=document.createElement("div");
  viewport.className="metadataViewport";

  const items=[];

  // 1. Geodatabase
  items.push({
    id:"metadata-current-gdb",
    type:"Geodatabase",
    name:DATA.name||"Geodatabase",
    metadata:metadata.gdb||{},
    rows:[
      ["Name",DATA.name||""],
      ["Workspace type",DATA.workspaceType||""],
      ["Generated",DATA.generated||""],
      ["Dataset groups",DATA.summary?.featureSetCount??0],
      ["Datasets",DATA.summary?.featureCount??0]
    ]
  });

  // 2. Current Feature Dataset only, when the selected item belongs to one.
  if(selectedSet?.kind==="featureDataset"){
    items.push({
      id:"metadata-current-feature-dataset",
      type:"Feature Dataset",
      name:selectedSet.name||"Feature Dataset",
      metadata:metadata.group||{},
      rows:[
        ["Name",selectedSet.name||""],
        ["Contained datasets",selectedSet.features?.length??0]
      ]
    });
  }

  // 3. Current selected dataset only.
  if(selected){
    const realType=friendlyDatasetType(
      selected.dataType||selected.datasetType||selected.kind,
      selected
    );

    items.push({
      id:"metadata-current-dataset",
      type:realType,
      name:selected.name||realType,
      metadata:metadata.layer||{},
      rows:[
        ["Name",selected.name||""],
        ["Dataset type",realType],
        ["Geometry",selected.geometryType||"Non-spatial"],
        ["Record count",selected.rowCount??""],
        ["Spatial reference",selected.spatialReference?.name||""],
        ["WKID",selected.spatialReference?.wkid||""],
        ["Attachments",selected.attachmentSummary?.count??0]
      ]
    });
  }

  if(!items.length){
    viewport.innerHTML=`<div class="welcome"><div>
      <strong>No metadata available</strong>
      Select a dataset in the Table of Contents.
    </div></div>`;
    panel.appendChild(viewport);
    return;
  }

  // Navigator labels use the real object names, not generic type/count labels.
  const navButtons=items.map(item=>
    `<button class="metadataNavBtn" type="button"
      data-target="${esc(item.id)}"
      data-meta-type="${esc(item.type)}"
      title="${esc(item.type)} · ${esc(item.name)}">
      ${esc(item.type)} · ${esc(item.name)}
    </button>`
  ).join("");

  const cards=items.map(item=>
    metadataCard(
      item.type,
      `${item.name} metadata`,
      item.metadata,
      item.rows||[],
      item.id
    )
  ).join("");

  viewport.innerHTML=`
    <div class="metadataNav" id="metadataNav">
      <span class="metadataNavLabel">Navigate</span>
      ${navButtons}
    </div>
    <div class="metadataStack">${cards}</div>
  `;

  panel.appendChild(viewport);

  const nav=viewport.querySelector("#metadataNav");

  function scrollToMetadataSection(targetId){
    const target=viewport.querySelector(`#${CSS.escape(targetId)}`);
    if(!target)return;

    const navHeight=nav.getBoundingClientRect().height;
    const viewportRect=viewport.getBoundingClientRect();
    const targetRect=target.getBoundingClientRect();

    // Keep the complete target header visible below the sticky navigator.
    const desiredTop=
      viewport.scrollTop+
      (targetRect.top-viewportRect.top)-
      navHeight-
      8;

    viewport.scrollTo({
      top:Math.max(0,desiredTop),
      behavior:"smooth"
    });
  }

  nav.addEventListener("click",e=>{
    const btn=e.target.closest(".metadataNavBtn");
    if(!btn)return;
    scrollToMetadataSection(btn.dataset.target);
  });

  // Scroll-spy: highlight the named object whose metadata is in view.
  let spyTick=false;
  viewport.addEventListener("scroll",()=>{
    if(spyTick)return;
    spyTick=true;

    requestAnimationFrame(()=>{
      spyTick=false;
      const navBottom=nav.getBoundingClientRect().bottom+8;
      let activeId=items[0]?.id||"";

      for(const item of items){
        const el=viewport.querySelector(`#${CSS.escape(item.id)}`);
        if(!el)continue;

        if(el.getBoundingClientRect().top<=navBottom+6){
          activeId=item.id;
        }else{
          break;
        }
      }

      nav.querySelectorAll(".metadataNavBtn").forEach(btn=>{
        btn.classList.toggle(
          "active",
          btn.dataset.target===activeId
        );
      });
    });
  },{passive:true});

  // Mark the first navigation pill active initially.
  nav.querySelector(".metadataNavBtn")?.classList.add("active");
}

