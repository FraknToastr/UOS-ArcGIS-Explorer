async function renderAttributeTable(page=0,version=renderVersion,signal=renderAbort.signal,columnPage=0){
  const item=selected;
  const pages=item.attributePages||[];
  page=Math.max(0,Math.min(page,Math.max(0,pages.length-1)));
  const rows=pages.length?await GDBChunks.load(pages[page],signal):[];
  if(signal.aborted||version!==renderVersion)return;
  tableState={rows,columns:item.attributeColumns||[],version};
  panel.innerHTML="";
  const originalCols=selected.attributeColumns||[];
  const fieldMap=new Map((selected.fields||[]).map(f=>[String(f.name).toLowerCase(),f]));
  const allDescriptors=originalCols.map((name,sourceIndex)=>{
    const field=fieldMap.get(String(name).toLowerCase())||{name,type:"Other"};
    return {name,sourceIndex,field,type:field.type||"Other",group:dtypeGroup(field.type||"Other")};
  }).sort((a,b)=>{
    const rank=dtypeSortRank(a.type)-dtypeSortRank(b.type);
    return rank||a.sourceIndex-b.sourceIndex;
  });

  const columnPages=Math.max(1,Math.ceil(allDescriptors.length/24));
  columnPage=Math.max(0,Math.min(columnPage,columnPages-1));
  const descriptors=allDescriptors.slice(columnPage*24,(columnPage+1)*24);
  const groups=[];
  descriptors.forEach(d=>{
    const last=groups[groups.length-1];
    if(last&&last.name===d.group)last.items.push(d);
    else groups.push({name:d.group,type:d.type,items:[d]});
  });

  const viewport=document.createElement("div");viewport.className="tableViewport";
  const table=document.createElement("table");table.className="dataTable";
  const typeHeader=groups.map(g=>`<th colspan="${g.items.length}" style="--dtype:${dtypeColor(g.type)}"><span class="dtypePill" style="--dtype:${dtypeColor(g.type)}">${esc(g.name)}</span></th>`).join("");
  const fieldHeader=descriptors.map(d=>`<th title="${esc(d.name)}" style="--dtype:${dtypeColor(d.type)}"><span class="fieldTypeDot" style="--dtype:${dtypeColor(d.type)}"></span>${esc(d.name)}</th>`).join("");
  const cell=(row,index,d)=>{
    const value=String(row[d.sourceIndex]??''),long=value.length>512;
    return `<td title="${esc(value.slice(0,256)+(value.length>256?'…':''))}"><span>${esc(value.slice(0,512))}${long?'…':''}</span>${long?`<button type="button" class="fullCellValue" data-value-row="${index}" data-value-column="${d.sourceIndex}" aria-label="View full value for ${esc(d.name)}, row ${index+1}">View full value</button>`:''}</td>`;
  };
  table.innerHTML=`<thead><tr class="typeHeader">${typeHeader}</tr><tr class="fieldHeader">${fieldHeader}</tr></thead><tbody>${rows.map((row,index)=>`<tr>${descriptors.map(d=>cell(row,index,d)).join("")}</tr>`).join("")}</tbody>`;
  viewport.appendChild(table);panel.appendChild(viewport);
  const status=document.createElement("div");status.className="tableStatus";
  const total=Number(item.exportedRowCount||0),offset=pages.slice(0,page).reduce((sum,p)=>sum+p.count,0);
  status.innerHTML=`<span>${total?`${offset+1}–${offset+rows.length}`:"0"} of ${total.toLocaleString()} exported rows${item.attributeRowsTruncated?" · export row limit reached":""}</span>
    <div class="pageControls"><button class="btn" data-page="${page-1}" ${page===0?"disabled":""}>Previous</button>
    <label>Page <input id="attributePage" aria-label="Attribute page" type="number" min="1" max="${Math.max(1,pages.length)}" value="${page+1}"></label><span>of ${Math.max(1,pages.length)}</span>
    <button class="btn" data-page="${page+1}" ${page>=pages.length-1?"disabled":""}>Next</button>
    ${columnPages>1?`<button class="btn" id="previousColumns" ${columnPage===0?"disabled":""}>← Fields</button><span>Fields ${columnPage*24+1}–${Math.min((columnPage+1)*24,allDescriptors.length)} / ${allDescriptors.length}</span><button class="btn" id="nextColumns" ${columnPage>=columnPages-1?"disabled":""}>Fields →</button>`:""}</div>`;
  panel.appendChild(status);
  const navigate=(newPage,newColumn=columnPage)=>{
    window.GDBCellValue?.close();tableState=null;
    renderAbort.abort();renderAbort=new AbortController();
    const nextVersion=++renderVersion;
    panel.innerHTML='<div class="loadMessage" role="status">Loading page…</div>';
    renderAttributeTable(newPage,nextVersion,renderAbort.signal,newColumn).catch(err=>{
      if(nextVersion===renderVersion&&err.name!=="AbortError"){
        panel.innerHTML=`<div class="loadMessage">${esc(err.message)} <button class="btn" id="retryPage">Retry</button></div>`;
        document.getElementById("retryPage").onclick=()=>navigate(newPage,newColumn);
      }
    });
  };
  status.querySelectorAll("[data-page]").forEach(button=>button.onclick=()=>navigate(Number(button.dataset.page)));
  status.querySelector("input").onchange=e=>navigate(Number(e.target.value)-1);
  status.querySelector("#previousColumns")?.addEventListener("click",()=>navigate(page,columnPage-1));
  status.querySelector("#nextColumns")?.addEventListener("click",()=>navigate(page,columnPage+1));
}

// Keep the full value in the loaded data page and materialise only the single
// requested value in a safe text node. Long values never duplicate into titles.
window.GDBCellValue={close(){const dialog=document.getElementById('gdbCellDialog');if(dialog){if(dialog.open)dialog.close();dialog.querySelector('pre').textContent=''}}};
document.addEventListener('click',event=>{
  const button=event.target.closest?.('.fullCellValue');if(!button||!tableState||tableState.version!==renderVersion)return;
  const row=Number(button.dataset.valueRow),column=Number(button.dataset.valueColumn),value=tableState.rows[row]?.[column];
  if(value===undefined)return;
  let dialog=document.getElementById('gdbCellDialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='gdbCellDialog';dialog.setAttribute('aria-labelledby','gdbCellTitle');
    dialog.innerHTML='<div class="cellDialogHead"><h2 id="gdbCellTitle"></h2><button type="button" class="iconBtn">Close</button></div><pre tabindex="0"></pre>';
    dialog.querySelector('button').addEventListener('click',()=>window.GDBCellValue.close());dialog.addEventListener('close',()=>{dialog.querySelector('pre').textContent=''});document.body.appendChild(dialog);
  }
  dialog.querySelector('h2').textContent=(tableState.columns[column]||'Value')+' · row '+(row+1);
  dialog.querySelector('pre').textContent=String(value);dialog.showModal();
});

function renderSchema(page=0){
  panel.innerHTML="";
  const fields=selected.fields||[];
  const count=Math.max(1,Math.ceil(fields.length/150));
  page=Math.max(0,Math.min(count-1,page));
  const wrap=document.createElement("div");wrap.className="panelScroll";
  wrap.innerHTML=`<table class="schemaTable"><thead><tr>
    <th>Name</th><th>Alias</th><th>Type</th><th>Length</th><th>Precision</th><th>Scale</th>
    <th>Nullable</th><th>Required</th><th>Domain</th><th>Default</th>
  </tr></thead><tbody>${fields.slice(page*150,(page+1)*150).map(f=>`<tr>
    <td>${esc(f.name)}</td><td>${esc(f.alias||"")}</td><td class="schemaTypeCell"><span class="dtypePill" style="--dtype:${dtypeColor(f.type)}">${esc(f.type)}</span></td>
    <td>${esc(f.length)}</td><td>${esc(f.precision)}</td><td>${esc(f.scale)}</td>
    <td>${f.nullable?"Yes":"No"}</td><td>${f.required?"Yes":"No"}</td>
    <td>${esc(f.domain||"")}</td><td>${esc(f.defaultValue??"")}</td>
  </tr>`).join("")}</tbody></table>`;
  panel.appendChild(wrap);
  if(count>1){
    const pager=document.createElement("div");pager.className="attachPager";
    pager.innerHTML=`<button class="btn" ${page===0?"disabled":""}>Previous fields</button><span>Fields ${page*150+1}–${Math.min(fields.length,(page+1)*150)} of ${fields.length}</span><button class="btn" ${page>=count-1?"disabled":""}>Next fields</button>`;
    pager.firstChild.onclick=()=>renderSchema(page-1);pager.lastChild.onclick=()=>renderSchema(page+1);
    wrap.prepend(pager);
  }
}

function dtypeGroup(type){
  const t=String(type||"").toLowerCase();
  if(t.includes("oid"))return"Object ID";
  if(t.includes("geometry"))return"Geometry";
  if(t.includes("string")||t.includes("text"))return"Text";
  if(t.includes("date"))return"Date";
  if(t.includes("double")||t.includes("single")||t.includes("float"))return"Decimal";
  if(t.includes("integer")||t.includes("smallinteger"))return"Integer";
  if(t.includes("guid")||t.includes("globalid"))return"GUID";
  if(t.includes("blob")||t.includes("raster"))return"Binary";
  return type||"Other";
}
function dtypeSortRank(type){
  const g=dtypeGroup(type);
  return({Text:1,Integer:2,Decimal:3,Date:4,GUID:5,"Object ID":6,Geometry:7,Binary:8}[g]||20);
}
function dtypeColor(type){
  type=String(type||"").toLowerCase();
  if(type.includes("string")||type.includes("text"))return"#7c9cff";
  if(type.includes("date"))return"#c084fc";
  if(type.includes("double")||type.includes("single")||type.includes("float"))return"#22c55e";
  if(type.includes("integer")||type.includes("smallinteger")||type.includes("oid"))return"#14b8a6";
  if(type.includes("guid")||type.includes("globalid"))return"#f59e0b";
  if(type.includes("geometry"))return"#ef4444";
  return"#94a3b8";
}
function renderAnalytics(page=0){
  panel.innerHTML="";
  const usable=(selected.fields||[]).filter(
    f=>!["oid","geometry"].includes(String(f.type||"").toLowerCase())
  );

  const groups=new Map();
  const count=Math.max(1,Math.ceil(usable.length/24));
  page=Math.max(0,Math.min(count-1,page));
  usable.slice(page*24,(page+1)*24).forEach(f=>{
    const group=dtypeGroup(f.type);
    if(!groups.has(group))groups.set(group,[]);
    groups.get(group).push(f);
  });

  const ordered=[...groups.entries()].sort((a,b)=>{
    const ar=dtypeSortRank(a[1][0]?.type);
    const br=dtypeSortRank(b[1][0]?.type);
    return ar-br||String(a[0]).localeCompare(String(b[0]));
  });

  const viewport=document.createElement("div");
  viewport.className="analyticsViewport";

  if(!ordered.length){
    viewport.innerHTML=`<div class="welcome"><div><strong>No analytics fields</strong>No profileable fields are available for this layer.</div></div>`;
    panel.appendChild(viewport);
    return;
  }

  const columns=ordered.map(([group,fields])=>{
    const representative=fields[0]?.type||"Other";
    const colour=dtypeColor(representative);

    const cards=fields.map(f=>{
      const vals=f.topValues||[];
      return `<section class="analyticsCard" style="--dtype:${dtypeColor(f.type)}">
        <div class="analyticsHead">
          ${esc(f.name)}
          <span style="color:var(--muted);font-weight:400"> · ${esc(f.type)}</span>
        </div>
        ${vals.length
          ? vals.map(v=>`<div class="analyticsRow">
              <span class="value" title="${esc(v.value)}">${esc(v.value)}</span>
              <span>${Number(v.count).toLocaleString()}</span>
              <span>${esc(v.percent)}%</span>
            </div>`).join("")
          : `<div class="notice" style="margin:10px">${esc(f.topValuesStatus||"No analytics")}</div>`
        }
      </section>`;
    }).join("");

    return `<section class="analyticsTypeColumn" style="--dtype:${colour}">
      <div class="analyticsTypeHeader" style="--dtype:${colour}">
        <strong>${esc(group)}</strong>
        <span>${fields.length} field${fields.length===1?"":"s"}</span>
      </div>
      ${cards}
    </section>`;
  }).join("");

  viewport.innerHTML=`<div class="analyticsColumns">${columns}</div>`;
  panel.appendChild(viewport);
  if(count>1){
    const pager=document.createElement("div");pager.className="attachPager";
    pager.innerHTML=`<button class="btn" ${page===0?"disabled":""}>Previous fields</button><span>Analytics fields ${page*24+1}–${Math.min(usable.length,(page+1)*24)} of ${usable.length}</span><button class="btn" ${page>=count-1?"disabled":""}>Next fields</button>`;
    pager.firstChild.onclick=()=>renderAnalytics(page-1);pager.lastChild.onclick=()=>renderAnalytics(page+1);viewport.prepend(pager);
  }
}
