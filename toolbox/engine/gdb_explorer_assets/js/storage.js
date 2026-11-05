/* Bounded, local-only SVG/CSS charts. No record, image, geometry or chart-engine loads. */
const storageViewState={measure:'source',scope:'all',query:'',page:0,reverseSize:false};
const storagePalette=['#107d77','#5362c7','#bd4f71','#b26a16','#177fb0','#8358b3','#48813b','#ad5142'];
const storageNumber=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
function storageMeasure(layer,measure){return layer?.[({source:'sourceBytes',export:'exportBytes',zip:'zipBytes'})[measure]]??null}
function storageGroups(items){
  const groups=new Map();
  for(const item of items){const key=item.group;if(!groups.has(key))groups.set(key,0);groups.set(key,groups.get(key)+(item.value||0))}
  return [...groups].map(([group,value])=>({group,value})).sort((a,b)=>b.value-a.value);
}
function storageMosaic(items,x=0,y=0,width=1000,height=370){
  if(!items.length)return [];
  if(items.length===1)return [{...items[0],x,y,width,height}];
  const sum=items.reduce((n,item)=>n+(item.weight??item.value),0);
  let index=1,part=items[0].weight??items[0].value;
  while(index<items.length-1&&Math.abs(part+(items[index].weight??items[index].value)-sum/2)<Math.abs(part-sum/2)){part+=items[index].weight??items[index].value;index++}
  const ratio=part/sum;
  return width>=height
    ?[...storageMosaic(items.slice(0,index),x,y,width*ratio,height),...storageMosaic(items.slice(index),x+width*ratio,y,width*(1-ratio),height)]
    :[...storageMosaic(items.slice(0,index),x,y,width,height*ratio),...storageMosaic(items.slice(index),x,y+height*ratio,width,height*(1-ratio))];
}
function renderStorage(data){
  if(!data){panel.innerHTML='<div class="welcome"><div><strong>No storage snapshot</strong>Re-export with the updated toolbox.</div></div>';return}
  const wrap=document.createElement('section');wrap.className='storageView';panel.appendChild(wrap);
  const state=storageViewState,signal=renderAbort.signal;
  const all=data.layers||[],chosen=all.find(layer=>layer.id===selectedId);
  if(state.scope==='group'&&!chosen)state.scope='all';
  const scope=state.scope==='group'?all.filter(layer=>layer.group===chosen.group):all;
  const known=scope.filter(layer=>storageNumber(storageMeasure(layer,state.measure)));
  const total=known.reduce((n,layer)=>n+storageMeasure(layer,state.measure),0);
  const attachmentLayers=scope.filter(layer=>layer.attachments?.known);
  const attachmentBytes=attachmentLayers.reduce((n,layer)=>n+layer.attachments.bytes,0);
  const attachmentCount=attachmentLayers.reduce((n,layer)=>n+layer.attachments.count,0);
  const measureLabel={source:'ArcGIS-reported sizes',export:'Extracted dataset files',zip:'Compressed dataset payload'}[state.measure];
  const totalLabel=known.length===scope.length?'Sized content':`Sized content · ${known.length}/${scope.length}`;
  const fmt=value=>storageNumber(value)?bytes(value):'Unavailable';
  const color=group=>storagePalette[(group||0)%storagePalette.length];
  const selectedLabel=chosen?esc(chosen.name):'Choose a dataset in either chart';
  wrap.innerHTML=`<div class="storageToolbar"><div class="storageSegment" role="group" aria-label="Size measure">
      ${[['source','Source GDB'],['export','App files'],['zip','GDB Explorer File payload']].map(([key,label])=>`<button type="button" data-measure="${key}" aria-pressed="${state.measure===key}">${label}</button>`).join('')}
    </div><div class="storageSegment" role="group" aria-label="Storage scope">
      <button type="button" data-scope="all" aria-pressed="${state.scope==='all'}">Whole GDB</button><button type="button" data-scope="group" aria-pressed="${state.scope==='group'}" ${chosen?'':'disabled'}>Selected group</button></div></div>
    <div class="storageToolbar storageToolbarSecondary"><div class="storageSegment" role="group" aria-label="Shape sizing order"><button type="button" data-reverse-size="true" aria-pressed="${state.reverseSize}">${state.reverseSize?'Normal size tree':'Reverse size tree'}</button></div><span class="storageQuiet">${state.reverseSize?'Small shapes represent larger content sizes.':'Largest content sizes are shown first.'}</span></div>
    <div class="storageStats">
      <div><span>GDB on disk${data.disk?.partial?' · partial':''}</span><strong>${fmt(data.disk?.bytes)}</strong></div>
      <div><span>${totalLabel}</span><strong>${known.length?bytes(total):'Unavailable'}</strong></div>
      <div><span>Attachment payload${attachmentLayers.length<scope.length?' · partial':''}</span><strong>${attachmentLayers.length?bytes(attachmentBytes):'Unavailable'}</strong><small>${attachmentCount.toLocaleString()} files</small></div>
    </div>
    <div class="storageChartGrid">
      <section class="storageCard storageMosaicCard"><header><h3>Space mosaic</h3><span>${esc(measureLabel)}</span></header><div class="storageMosaic" role="group" aria-label="Dataset sizes; tile area represents bytes"></div><div class="storageLegend"></div></section>
      <section class="storageCard storageRankingCard"><header><h3>Largest first</h3><span>Linear size scale</span></header><input id="storageSearch" class="storageSearch" type="search" placeholder="Find a dataset…" aria-label="Find a dataset by name"><div class="storageRanking"></div><div class="storagePaging"></div></section>
    </div>
    <section class="storageCard storageSelection"><header><h3>${selectedLabel}</h3><span>${chosen?'Selected dataset':''}</span></header><div class="storageSelectionBody"></div></section>
    <p class="storageFootnote">${state.measure==='source'?'ArcGIS-reported dataset sizes; unavailable values stay unknown. Attachment payload is shown separately, not added.':'Export sizes reflect row, geometry and attachment limits. GDB Explorer File payload excludes archive headers and shared app files.'} <button type="button" class="storageMethod">About sizes</button></p>
    <div class="storageAbout" hidden>Disk size counts local database files, excluding locks. ArcGIS dataset sizes may use a different storage basis and are not a disk-space reconciliation. Tables and some providers may not expose sizes. Attachment payload counts original file bytes, including attachments omitted by the export size limit. Whole GDB charts cover the feature classes and tables included in this catalogue; other database content remains part of disk size only. No estimates or row-count substitutes are used.</div>`;
  const mosaic=wrap.querySelector('.storageMosaic'),ranking=wrap.querySelector('.storageRanking'),pager=wrap.querySelector('.storagePaging');
const sorted=known.map(layer=>({...layer,value:storageMeasure(layer,state.measure)})).sort((a,b)=>(state.reverseSize?a.value-b.value:b.value-a.value)||a.name.localeCompare(b.name));
const positive=sorted.filter(layer=>layer.value>0),maxValue=Math.max(...positive.map(layer=>layer.value),0),minValue=Math.min(...positive.map(layer=>layer.value),0),tiles=positive.slice(0,35).map(layer=>({...layer,weight:state.reverseSize?maxValue-layer.value+minValue:layer.value}));
if(positive.length>35){const remainder=positive.slice(35);tiles.push({name:`${positive.length-35} more datasets`,value:remainder.reduce((n,layer)=>n+layer.value,0),weight:remainder.reduce((n,layer)=>n+(state.reverseSize?maxValue-layer.value+minValue:layer.value),0),group:-1,id:null});}
  function drawMosaic(){
    if(signal.aborted)return;
    if(!tiles.length){mosaic.innerHTML=`<div class="storageEmpty">${known.length?'No stored bytes reported.':'Source sizes unavailable. Try App files.'}</div>`;return}
    const width=mosaic.clientWidth||700,height=mosaic.clientHeight||300;
    mosaic.innerHTML=storageMosaic(tiles,0,0,width,height).map(tile=>{
      const title=`${tile.name} · ${bytes(tile.value)} · ${(tile.value/total*100).toFixed(1)}%`;
      const label=tile.width>=95&&tile.height>=45;
      return `<button type="button" class="storageTile ${tile.id===selectedId?'selected':''}" ${tile.id?`data-layer="${esc(tile.id)}"`:'data-more="true"'} title="${esc(title)}" aria-label="${esc(title)}" ${tile.id===selectedId?'aria-pressed="true"':'aria-pressed="false"'} style="left:${tile.x/width*100}%;top:${tile.y/height*100}%;width:${tile.width/width*100}%;height:${tile.height/height*100}%;--tile:${tile.group<0?'#697788':color(tile.group)}">${label?`<span>${esc(tile.name)}</span><strong>${bytes(tile.value)}</strong>`:''}</button>`;
    }).join('');
  }
  const legend=storageGroups(sorted).slice(0,5);
  wrap.querySelector('.storageLegend').innerHTML=legend.map(entry=>`<span title="${esc(data.groups[entry.group])}"><i style="background:${color(entry.group)}"></i>${esc(data.groups[entry.group])}</span>`).join('')+(storageGroups(sorted).length>5?'<span>More groups in tooltips</span>':'');
  function drawRanking(){
    const query=state.query.trim().toLowerCase();
    const candidates=scope.filter(layer=>!query||layer.name.toLowerCase().includes(query));
    candidates.sort((a,b)=>{const av=storageMeasure(a,state.measure)??-1,bv=storageMeasure(b,state.measure)??-1;return (state.reverseSize?av-bv:bv-av)||a.name.localeCompare(b.name)});
    const pages=Math.max(1,Math.ceil(candidates.length/12));state.page=Math.max(0,Math.min(state.page,pages-1));
    const page=candidates.slice(state.page*12,state.page*12+12),max=sorted.reduce((value,layer)=>Math.max(value,storageMeasure(layer,state.measure)||0),0)||1;
    ranking.innerHTML=page.map(layer=>{
      const value=storageMeasure(layer,state.measure),hasSize=storageNumber(value),percent=hasSize&&total>0?(value/total*100).toFixed(1)+'%':'—';
      const visual=hasSize?(state.reverseSize?(max-value)/Math.max(1,max)*100:value/max*100):0;
      return `<button type="button" class="storageRank ${layer.id===selectedId?'selected':''}" data-layer="${esc(layer.id)}" aria-pressed="${layer.id===selectedId}" title="${esc(layer.name)} · ${fmt(value)}"><span class="storageRankName">${esc(layer.name)}</span><strong>${hasSize?bytes(value):'Unknown'}</strong><span class="storageRankTrack"><i style="width:${visual}%;background:${color(layer.group)}"></i></span><small>${percent}</small></button>`;
    }).join('')||'<div class="storageEmpty">No matching datasets.</div>';
    pager.innerHTML=`<button class="btn" type="button" data-step="-1" ${state.page===0?'disabled':''} aria-label="Previous size rankings">←</button><span>${candidates.length?state.page*12+1:0}–${Math.min(candidates.length,state.page*12+12)} / ${candidates.length}</span><button class="btn" type="button" data-step="1" ${state.page>=pages-1?'disabled':''} aria-label="Next size rankings">→</button>`;
  }
  const selection=wrap.querySelector('.storageSelectionBody');
  if(chosen){
    const attachment=chosen.attachments||{},types=Object.entries(attachment.types||{}).sort((a,b)=>b[1]-a[1]);
    const components=Object.entries(chosen.components||{}).filter(([,size])=>size>0),componentTotal=chosen.exportBytes||1;
    selection.innerHTML=`<div class="storageSelectedStats"><div><span>Source</span><strong>${fmt(chosen.sourceBytes)}</strong></div><div><span>App files</span><strong>${fmt(chosen.exportBytes)}</strong></div><div><span>GDB Explorer File payload</span><strong>${fmt(chosen.zipBytes)}</strong></div><div><span>Attachments</span><strong>${attachment.known?bytes(attachment.bytes):'Unavailable'}</strong></div></div>
      <div class="storageDetailGrid"><div><h4>Export footprint</h4><div class="storageRibbon" role="img" aria-label="${esc(components.map(([name,size])=>`${name}: ${bytes(size)}`).join(', '))}">${components.map(([name,size],i)=>`<span style="width:${size/componentTotal*100}%;background:${storagePalette[i]}" title="${name} · ${bytes(size)}"></span>`).join('')}</div><div class="storageMiniLegend">${components.map(([name,size],i)=>`<span><i style="background:${storagePalette[i]}"></i>${name}<b>${bytes(size)}</b></span>`).join('')}</div></div>
      <div><h4>Attachment mix</h4>${types.length?types.map(([name,size],i)=>`<div class="storageType"><span>${name}</span><div><i style="width:${attachment.bytes?size/attachment.bytes*100:0}%;background:${storagePalette[i]}"></i></div><strong>${bytes(size)}</strong></div>`).join(''):`<div class="storageQuiet">${attachment.known?'No attachments':'Attachment sizes unavailable'}</div>`}</div>
      <div><h4>Largest attachments</h4>${(attachment.largest||[]).slice(0,5).map(file=>`<div class="storageFile"><span title="${esc(file.name)}">${esc(file.name)}</span><strong>${bytes(file.bytes)}</strong></div>`).join('')||'<div class="storageQuiet">—</div>'}</div></div>`;
  }else selection.innerHTML='<div class="storageQuiet">Select a mosaic tile or a ranked dataset.</div>';
  const search=wrap.querySelector('#storageSearch');search.value=state.query;
  let debounce,observer,frame;
  search.addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(()=>{state.query=search.value;state.page=0;drawRanking()},120)},{signal});
  wrap.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.dataset.layer){selectLayer(button.dataset.layer);return}
    if(button.dataset.measure){state.measure=button.dataset.measure;state.page=0;renderActiveTab();return}
    if(button.dataset.scope){state.scope=button.dataset.scope;state.page=0;renderActiveTab();return}
    if(button.dataset.reverseSize){state.reverseSize=!state.reverseSize;state.page=0;renderActiveTab();return}
    if(button.dataset.step){state.page+=Number(button.dataset.step);drawRanking();return}
    if(button.dataset.more){state.page=2;state.query='';search.value='';drawRanking();search.focus();return}
    if(button.classList.contains('storageMethod')){const about=wrap.querySelector('.storageAbout');about.hidden=!about.hidden;button.setAttribute('aria-expanded',String(!about.hidden))}
  },{signal});
  drawMosaic();drawRanking();
  if(typeof ResizeObserver!=='undefined'){observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(drawMosaic)});observer.observe(mosaic)}
  disposeView=()=>{clearTimeout(debounce);cancelAnimationFrame(frame);observer?.disconnect()};
}
