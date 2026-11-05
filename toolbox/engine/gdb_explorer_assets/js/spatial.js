function gdbMetroTileUrl(key){
  return `https://api.metromap.com.au/ogc/key/${encodeURIComponent(key)}/service?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=Australia_latest&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
}

// Track actual raster tiles, not the map's generic idle event (which also fires
// when requests fail). A new source ID isolates each basemap selection.
function createGDBBasemapFeedback(map,element,options={}){
  const schedule=options.setTimeout||setTimeout,cancel=options.clearTimeout||clearTimeout;
  let current=null,timeout=null,hide=null,disposed=false;
  const labels={metromap:'MetroMap imagery',imagery:'Esri World Aerial',topo:'Esri World Topography',none:'Offline geometry'};
  function clearTimers(){if(timeout!==null)cancel(timeout);if(hide!==null)cancel(hide);timeout=hide=null}
  function show(message,status){element.style.display='';element.className='mapStatus'+(status?' '+status:'');element.textContent=message}
  function fail(message){clearTimers();current.status='error';current.tile=null;show(message,'error')}
  function visible(tile){
    const id=tile.tileID?.canonical;if(!id||!map.getBounds)return true;
    const bounds=map.getBounds(),n=2**id.z,west=id.x/n*360-180,east=(id.x+1)/n*360-180;
    const latitude=y=>Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI;
    const south=latitude(id.y+1),north=latitude(id.y);
    return south<=bounds.getNorth()&&north>=bounds.getSouth()&&[-360,0,360].some(offset=>east+offset>=bounds.getWest()&&west+offset<=bounds.getEast());
  }
  function data(event){
    if(disposed||!current||event.sourceId!==current.sourceId||!event.tile)return;
    if(event.tile.state==='loaded'&&(!event.tile.hasData||event.tile.hasData())&&visible(event.tile))current.tile=event.tile;
  }
  function render(){
    if(disposed||!current?.tile||!visible(current.tile)||current.status==='ok')return;
    clearTimers();current.status='ok';show(labels[current.name]+' loaded','ok');
    const selection=current;hide=schedule(()=>{if(!disposed&&current===selection&&current.status==='ok')element.style.display='none'},2200);
  }
  function error(event){
    if(disposed||!current||event.sourceId!==current.sourceId)return;
    const code=Number(event.error?.status);
    fail(current.name==='metromap'
      ?([401,403].includes(code)?'MetroMap access was rejected. Check the API key and imagery subscription, or choose another basemap.':'MetroMap imagery could not load. Check network access, imagery coverage and service availability, or choose another basemap.')
      :labels[current.name]+' could not load. Check the network or choose another basemap.');
  }
  map.on('sourcedata',data);map.on('render',render);map.on('error',error);
  return {
    select(name,sourceId){
      clearTimers();current={name,sourceId,status:name==='none'?'ok':'loading',tile:null};
      show(name==='none'?'Map ready · Offline geometry':'Loading '+labels[name]+'…',name==='none'?'ok':'');
      if(name!=='none')timeout=schedule(()=>{if(!disposed)fail(labels[name]+' has not loaded after 15 seconds. Check network access and imagery coverage, retry, or choose another basemap.')},15000);
    },
    handles:event=>!!current&&event.sourceId===current.sourceId,
    dispose(){disposed=true;clearTimers();map.off('sourcedata',data);map.off('render',render);map.off('error',error)}
  };
}

async function loadSpatialFeatureRow(item,feature,signal){
  const columns=item.attributeColumns||[];
  const oidIndex=columns.findIndex(name=>String(name).toLowerCase()===String(item.oidFieldName||'').toLowerCase());
  const featureId=feature?.properties?.id;
  const key=value=>String(value??'').trim();
  const integer=value=>{
    if(typeof value!=='number'&&(typeof value!=='string'||!/^\d+$/.test(value)))return null;
    const number=Number(value);return Number.isSafeInteger(number)&&number>=0?number:null;
  };
  async function read(location){
    if(!location)return null;
    const page=integer(location.page),rowIndex=integer(location.row);
    if(page===null||rowIndex===null)return null;
    const ref=(location.kind==='popup'?item.spatialAttributePages:item.attributePages)?.[page];
    if(!ref)return null;
    const rows=await GDBChunks.load(ref,signal),row=rows?.[rowIndex];
    if(!Array.isArray(row))return null;
    // Verify identity before presenting values, including when a stale pointer exists.
    if(oidIndex>=0&&featureId!=null&&key(row[oidIndex])!==key(featureId))return null;
    return row;
  }
  const props=feature?.properties||{},popup=integer(props.__gdbPopupPage),table=integer(props.__gdbPage);
  const direct=popup!==null?{kind:'popup',page:popup,row:props.__gdbRow}:table!==null?{kind:'table',page:table,row:props.__gdbRow}:null;
  const row=await read(direct);
  if(row)return row;
  // A tiny OID index is a fallback when geometry properties omit the page pointer.
  if(item.spatialAttributeIndexFile&&featureId!=null){
    const index=await GDBChunks.load(item.spatialAttributeIndexFile,signal);
    return read(index?.[key(featureId)]);
  }
  return null;
}

function geoBounds(fc){
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const visit=c=>{
    if(!Array.isArray(c))return;
    if(c.length>=2&&typeof c[0]==="number"&&typeof c[1]==="number"){
      minX=Math.min(minX,c[0]);maxX=Math.max(maxX,c[0]);
      minY=Math.min(minY,c[1]);maxY=Math.max(maxY,c[1]);return;
    }
    c.forEach(visit);
  };
  (fc.features||[]).forEach(f=>visit(f.geometry?.coordinates));
  if(!Number.isFinite(minX))return null;
  return {minX,minY,maxX,maxY};
}
async function renderSpatial(version=renderVersion,signal=renderAbort.signal){
  const item=selected;
  let disposed=false;
  const SPATIAL_THUMBNAIL_STORAGE="gdbExplorerSpatialThumbnails";
  const TOPO_DEFAULT_STORAGE="gdbExplorerAlwaysTopo";
  let alwaysTopo=GDBChunks.storage.getItem(TOPO_DEFAULT_STORAGE)!=="false";
  let spatialThumbnails=GDBChunks.storage.getItem(SPATIAL_THUMBNAIL_STORAGE)==="true";
  let currentFeature=null,currentPayload=null;
  const fc=item.spatialGeoJSON;
  if(!fc){
    panel.innerHTML=`<div class="welcome"><div><strong>No spatial geometry</strong>This item has no spatial data.</div></div>`;
    return;
  }
  if(typeof window.maplibregl==="undefined"||
     typeof window.maplibregl.Map!=="function"){
    panel.innerHTML=`<div class="welcome"><div>
      <strong>Bundled MapLibre runtime failed to initialise</strong>
      The proven GeoGlyph MapLibre 5.3 vendor runtime did not expose window.maplibregl.Map.
      ${window.__GDB_LAST_RUNTIME_ERROR__?`<br><br>${esc(window.__GDB_LAST_RUNTIME_ERROR__)}`:""}
    </div></div>`;
    return;
  }

  if(window.__GDB_MAPLIBRE_WORKER_ERROR__){
    panel.innerHTML=`<div class="welcome"><div>
      <strong>MapLibre worker failed to initialise</strong>
      ${esc(window.__GDB_MAPLIBRE_WORKER_ERROR__)}
    </div></div>`;
    return;
  }
  function webglSupported(){
    try{
      const canvas=document.createElement("canvas");
      const gl=canvas.getContext("webgl2",{antialias:false})||
               canvas.getContext("webgl",{antialias:false});
      if(!gl)return false;
      const lose=gl.getExtension("WEBGL_lose_context");
      if(lose)lose.loseContext();
      return true;
    }catch{
      return false;
    }
  }

  if(!webglSupported()){
    panel.innerHTML=`<div class="welcome"><div>
      <strong>MapLibre cannot initialise</strong>
      WebGL is unavailable or disabled in this browser/session.
    </div></div>`;
    return;
  }

  panel.innerHTML=`<div class="spatialWrap">
    <div class="spatialTools">
      <div class="mapButtons">
        <button class="mapBtn ${alwaysTopo?'':'active'}" data-basemap="none" type="button">No basemap (offline)</button>
        <button class="mapBtn" data-basemap="imagery" type="button">Esri World Aerial</button>
        <button class="mapBtn ${alwaysTopo?'active':''}" data-basemap="topo" type="button">Esri World Topography</button>
        <button class="mapBtn" data-basemap="metromap" type="button">MetroMap</button>
      </div>
      <div class="spatialToolbarOptions">
        <label class="thumbnailToggle" title="Start every Spatial view with Esri Topography. Requires an internet connection."><input id="alwaysEsriTopo" type="checkbox" ${alwaysTopo?'checked':''}>Always use Esri Topography</label>
        <label class="thumbnailToggle"><input id="spatialThumbnails" type="checkbox" ${spatialThumbnails?"checked":""}>Popup thumbnails</label>
      </div>
      <div class="contextMeta spatialSummary">${Number(fc.features?.length||0).toLocaleString()} preview features${fc.truncated?" · limited by "+esc(fc.limitReason):""}</div>
    </div>
    <div class="mapViewport" id="mapViewport">
      <div id="mapCanvas"></div>
      <aside class="mapDock" id="mapDock" aria-label="Feature details">
        <div class="mapDockHead">
          <strong id="mapDockTitle">Feature details</strong>
          <button class="mapDockClose" id="mapDockClose" type="button">Close</button>
        </div>
        <div class="mapDockBody" id="mapDockBody"></div>
      </aside>
      <div class="mapStatus" id="mapStatus" role="status" aria-live="polite" aria-atomic="true">Initialising MapLibre…</div>
    </div>
  </div>`;

  // Match the proven GeoGlyph startup sequence: allow layout to settle
  // for two frames after the MapLibre container is inserted.
  await new Promise(resolve=>
    requestAnimationFrame(()=>requestAnimationFrame(resolve))
  );

  if(signal.aborted||version!==renderVersion)return;
  const mapContainer=document.getElementById("mapCanvas");
  if(!mapContainer){
    panel.innerHTML=`<div class="welcome"><div>
      <strong>Map container unavailable</strong>
      The Spatial workspace could not create its map surface.
    </div></div>`;
    return;
  }

  const containerRect=mapContainer.getBoundingClientRect();
  if(containerRect.width<2||containerRect.height<2){
    panel.innerHTML=`<div class="welcome"><div>
      <strong>Map container has no usable size</strong>
      Width ${Math.round(containerRect.width)}px · Height ${Math.round(containerRect.height)}px
    </div></div>`;
    return;
  }

    const ESRI_IMAGERY="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
  const ESRI_TOPO="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
  const METRO_KEY_STORAGE="gdbExplorerMetroMapKey";
  const metroDialog=document.getElementById("metroDialog");
  const keyInput=document.getElementById("metroKey");
  const keyStatus=document.getElementById("metroKeyStatus");
  let metroSessionKey=GDBChunks.storage.getItem(METRO_KEY_STORAGE)||"";
  function closeMetroDialog(){if(metroDialog.open)metroDialog.close();keyInput.value=""}
  // A tab/layer change also closes the modal and clears the input.
  signal.addEventListener("abort",closeMetroDialog,{once:true});

  function metroUrl(key){
    return gdbMetroTileUrl(key);
  }

  function styleFor(tileUrl){
    const style={
      version:8,
      sources:{
        base:{type:"raster",tiles:[tileUrl],tileSize:256,attribution:tileUrl===ESRI_TOPO||tileUrl===ESRI_IMAGERY?'Tiles © Esri': '© MetroMap / Aerometrex'},
        features:{type:"geojson",data:fc},
        selection:{type:"geojson",data:{type:"FeatureCollection",features:[]}}
      },
      layers:[
        {id:"base",type:"raster",source:"base"},
        {
          id:"polygons",type:"fill",source:"features",
          filter:["==",["geometry-type"],"Polygon"],
          paint:{"fill-color":"#1493ff","fill-opacity":0.28}
        },
        {
          id:"polygon-outline",type:"line",source:"features",
          filter:["==",["geometry-type"],"Polygon"],
          paint:{"line-color":"#0876c9","line-width":2}
        },
        {
          id:"lines",type:"line",source:"features",
          filter:["==",["geometry-type"],"LineString"],
          paint:{"line-color":"#ff3f7f","line-width":3}
        },
        {
          id:"points",type:"circle",source:"features",
          filter:["==",["geometry-type"],"Point"],
          paint:{
            "circle-radius":6,"circle-color":"#ffd43b",
            "circle-stroke-color":"#111827","circle-stroke-width":1.5
          }
        },
        {
          id:"selection-fill",type:"fill",source:"selection",
          filter:["==",["geometry-type"],"Polygon"],
          paint:{"fill-color":"#ff2d55","fill-opacity":0.42}
        },
        {
          id:"selection-outline",type:"line",source:"selection",
          filter:["==",["geometry-type"],"Polygon"],
          paint:{"line-color":"#ffffff","line-width":5}
        },
        {
          id:"selection-line",type:"line",source:"selection",
          filter:["==",["geometry-type"],"LineString"],
          paint:{"line-color":"#ffffff","line-width":7}
        },
        {
          id:"selection-point",type:"circle",source:"selection",
          filter:["==",["geometry-type"],"Point"],
          paint:{
            "circle-radius":11,
            "circle-color":"#ff2d55",
            "circle-stroke-color":"#ffffff",
            "circle-stroke-width":4
          }
        }
      ]
    };
    if(!tileUrl){delete style.sources.base;style.layers=style.layers.filter(layer=>layer.id!=="base")}
    style.layers.unshift({id:"background",type:"background",paint:{"background-color":"#e6edf3"}});
    return style;
  }

  let currentBasemap=alwaysTopo?"topo":"none";
  const mapStatus=document.getElementById("mapStatus");
  const mapViewport=document.getElementById("mapViewport");
  const mapDock=document.getElementById("mapDock");
  const mapDockTitle=document.getElementById("mapDockTitle");
  const mapDockBody=document.getElementById("mapDockBody");
  const mapDockClose=document.getElementById("mapDockClose");

  function clearSelection(){
    const source=map?.getSource("selection");
    if(source&&typeof source.setData==="function"){
      source.setData({type:"FeatureCollection",features:[]});
    }
  }

  function setSelection(feature){
    const source=map?.getSource("selection");
    if(source&&typeof source.setData==="function"){
      source.setData({type:"FeatureCollection",features:[feature]});
    }
  }

  function closeFeatureDock(){
    featureRequest++;
    currentFeature=null;currentPayload=null;
    clearSelection();
    mapDock.classList.remove("open");
    mapViewport.classList.remove("hasDock");
    mapDockBody.innerHTML="";
    requestAnimationFrame(()=>{if(!disposed)map?.resize()});
  }

  mapDockClose.addEventListener("click",closeFeatureDock);

  let map;
  try{
    map=new window.maplibregl.Map({
      container:mapContainer,
      style:styleFor(alwaysTopo?ESRI_TOPO:null),
      center:[138.6007,-34.9285],
      zoom:11,
      minZoom:1,
      maxZoom:20,
      attributionControl:true,
      pixelRatio:1,
      maxTileCacheSize:32,
      canvasContextAttributes:{antialias:false,powerPreference:"low-power"}
    });
  }catch(err){
    console.error("MapLibre initialisation failed",err);
    mapStatus.className="mapStatus error";
    mapStatus.textContent="MapLibre initialisation failed: "+(err?.message||String(err));
    return;
  }

  let baseSourceId=alwaysTopo?'base':null,baseSequence=0,basemapRun=0;
  const basemapFeedback=createGDBBasemapFeedback(map,mapStatus);
  basemapFeedback.select(currentBasemap,baseSourceId);
  disposeView=()=>{
    disposed=true;
    basemapFeedback.dispose();
    closeMetroDialog();
    currentFeature=null;currentPayload=null;metroSessionKey="";
    map.remove();
    item.spatialGeoJSON=null;
    window.maplibregl.clearPrewarmedResources?.();
  };
  map.on("load",()=>{
    map.resize();
    requestAnimationFrame(()=>{if(!disposed)map.resize()});
  });
  map.on("error",e=>{
    if(basemapFeedback.handles(e)||e.sourceId?.startsWith('gdb-base-'))return;
    const msg=e?.error?.message||e?.message||"Map rendering error";
    mapStatus.style.display="";
    mapStatus.className="mapStatus error";
    // Network errors can contain the full WMTS URL, including its API key.
    mapStatus.textContent=/https?:|metromap/i.test(msg)?'A map resource could not load. Check the network or choose another basemap.':String(msg).replaceAll(metroSessionKey||'\u0000','[redacted]').replaceAll(encodeURIComponent(metroSessionKey)||'\u0000','[redacted]');
  });

  map.addControl(new window.maplibregl.NavigationControl({
    visualizePitch:true,
    showZoom:true,
    showCompass:true
  }),"top-right");
  map.addControl(new window.maplibregl.FullscreenControl(),"top-right");
  map.addControl(new window.maplibregl.ScaleControl({maxWidth:110,unit:"metric"}),"bottom-right");

  class HomeControl{
    onAdd(mapInstance){
      this.map=mapInstance;
      this.el=document.createElement("div");
      this.el.className="maplibregl-ctrl maplibregl-ctrl-group";
      const btn=document.createElement("button");
      btn.type="button";btn.title="Home / fit layer";btn.setAttribute("aria-label","Home / fit layer");
      btn.innerHTML='<span style="font-size:20px;line-height:1">⌂</span>';
      btn.addEventListener("click",()=>fitLayer());
      this.el.appendChild(btn);
      return this.el;
    }
    onRemove(){this.el.remove();this.map=null}
  }
  map.addControl(new HomeControl(),"top-right");

  function featureBounds(){
    const b=new window.maplibregl.LngLatBounds();
    let found=false;
    const walk=c=>{
      if(!Array.isArray(c))return;
      if(c.length>=2&&typeof c[0]==="number"&&typeof c[1]==="number"){
        b.extend([c[0],c[1]]);found=true;return;
      }
      c.forEach(walk);
    };
    (fc.features||[]).forEach(f=>walk(f.geometry?.coordinates));
    return found?b:null;
  }

  function fitLayer(){
    const b=featureBounds();
    if(b)map.fitBounds(b,{padding:45,maxZoom:18,duration:500});
  }

  map.once("load",fitLayer);

  function setBasemap(name){
    let url=ESRI_IMAGERY;
    if(name==="topo")url=ESRI_TOPO;
    if(name==="metromap"){
      if(!metroSessionKey)return;
      url=metroUrl(metroSessionKey);
    }
    // A deliberately chosen alternative clears the persistent Topography option.
    if(name!=="topo"&&alwaysTopo){
      alwaysTopo=false;
      document.getElementById("alwaysEsriTopo").checked=false;
      GDBChunks.storage.setItem(TOPO_DEFAULT_STORAGE,"false");
    }
    currentBasemap=name;
    if(name==="none")url=null;
    const run=++basemapRun,sourceId=url?`gdb-base-${++baseSequence}`:null;
    basemapFeedback.select(name,sourceId);
    const install=()=>{
      if(disposed||run!==basemapRun)return;
      if(map.getLayer('base'))map.removeLayer('base');
      if(baseSourceId&&map.getSource(baseSourceId))map.removeSource(baseSourceId);
      baseSourceId=sourceId;
      if(url){map.addSource(sourceId,{type:'raster',tiles:[url],tileSize:256,attribution:name==='metromap'?'© MetroMap / Aerometrex':'Tiles © Esri'});map.addLayer({id:'base',type:'raster',source:sourceId},'polygons')}
    };
    // A user can choose a basemap before the initial style has finished loading.
    if(map.getLayer('polygons'))install();else map.once('styledata',install);
    document.querySelectorAll(".mapBtn[data-basemap]").forEach(b=>b.classList.toggle("active",b.dataset.basemap===name));
  }

  function openMetroDialog(){
    keyInput.value=metroSessionKey||GDBChunks.storage.getItem(METRO_KEY_STORAGE)||"";
    keyStatus.textContent=GDBChunks.storage.getItem(METRO_KEY_STORAGE)?"A saved key is available in this browser.":"No key is saved in this browser.";
    if(!metroDialog.open)metroDialog.showModal();
    keyInput.focus();
  }
  document.querySelectorAll(".mapBtn[data-basemap]").forEach(button=>{
    button.addEventListener("click",()=>{
      if(button.dataset.basemap==="metromap")openMetroDialog();
      else setBasemap(button.dataset.basemap);
    },{signal});
  });
  document.getElementById("closeMetroDialog").addEventListener("click",closeMetroDialog,{signal});
  metroDialog.addEventListener("close",()=>{keyInput.value=""},{signal});
  metroDialog.addEventListener("click",event=>{
    if(event.target!==metroDialog)return;
    const rect=metroDialog.getBoundingClientRect();
    if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeMetroDialog();
  },{signal});
  document.getElementById("useMetroKey").addEventListener("click",()=>{
    const key=keyInput.value.trim();
    if(!key){keyStatus.textContent="Enter an API key first.";keyInput.focus();return}
    metroSessionKey=key;
    setBasemap("metromap");
    closeMetroDialog();
  },{signal});
  keyInput.addEventListener("keydown",event=>{
    if(event.key==="Enter"){event.preventDefault();document.getElementById("useMetroKey").click()}
  },{signal});
  document.getElementById("saveMetroKey").addEventListener("click",()=>{
    const key=keyInput.value.trim();
    if(!key){keyStatus.textContent="Enter an API key before saving.";keyInput.focus();return}
    const saved=GDBChunks.storage.setItem(METRO_KEY_STORAGE,key);
    keyStatus.textContent=saved?"Key saved in this browser.":"Browser storage is unavailable. You can still use this key for this map session.";
  },{signal});
  document.getElementById("removeMetroKey").addEventListener("click",()=>{
    const removed=GDBChunks.storage.removeItem(METRO_KEY_STORAGE);
    if(!removed){keyStatus.textContent="The browser could not remove the saved key.";return}
    metroSessionKey="";keyInput.value="";
    keyStatus.textContent="Saved key removed.";
    if(currentBasemap==="metromap")setBasemap("none");
  },{signal});
  const spatialToggle=document.getElementById("spatialThumbnails");
  const topoToggle=document.getElementById("alwaysEsriTopo");
  topoToggle.checked=alwaysTopo;
  topoToggle.addEventListener("change",()=>{
    alwaysTopo=topoToggle.checked;
    GDBChunks.storage.setItem(TOPO_DEFAULT_STORAGE,String(alwaysTopo));
    if(alwaysTopo)setBasemap("topo");
    else if(currentBasemap==="topo")setBasemap("none");
  },{signal});
  spatialToggle.checked=spatialThumbnails;
  spatialToggle.addEventListener("change",()=>{
    spatialThumbnails=spatialToggle.checked;
    GDBChunks.storage.setItem(SPATIAL_THUMBNAIL_STORAGE,String(spatialThumbnails));
    if(currentFeature&&currentPayload)drawFeatureDock(currentFeature,currentPayload);
  },{signal});

  const cols=item.attributeColumns||[];
  const oidName=item.oidFieldName||"";
  const oidIndex=cols.findIndex(c=>String(c).toLowerCase()===String(oidName).toLowerCase());
  const globalIdIndex=cols.findIndex(c=>String(c).toLowerCase()==="globalid");


  function normKey(v){
    return String(v??"").trim().replace(/^\{/,"").replace(/\}$/,"").toUpperCase();
  }

  async function featurePayload(feature){
    const row=await loadSpatialFeatureRow(item,feature,signal);
    const keys=new Set([normKey(feature?.properties?.id)]);
    if(row&&oidIndex>=0)keys.add(normKey(row[oidIndex]));
    if(row&&globalIdIndex>=0)keys.add(normKey(row[globalIdIndex]));
    const index=item.attachmentParentIndexFile?await GDBChunks.load(item.attachmentParentIndexFile,signal):{};
    const attachments=[];let attachmentCount=0;
    for(const key of keys){
      const ref=index[key];
      if(ref){attachmentCount+=ref.count||0;attachments.push(...await GDBChunks.load(ref,signal))}
    }
    return {row,attachments,attachmentCount};
  }

  function featureDetailsHTML(feature,row,atts){

    const attrs=row
      ? cols.map((c,i)=>`<tr><th>${esc(c)}</th><td>${esc(row[i])}</td></tr>`).join("")
      : `<tr><th>${esc(oidName||"Object ID")}</th><td>${esc(feature?.properties?.id??"")}</td></tr>`;
    const unavailable=row?'':'<div class="notice" style="margin:9px 0">Attribute details are unavailable for this feature in this export. Create a new GDB Explorer File to include details for every mapped feature.</div>';

    const thumbs=atts.length
      ? `<div class="popupAttachments">${atts.slice(0,40).map((a,ai)=>{
          const media=attachmentPreviewHTML(a,spatialThumbnails);
          return `<div class="popupThumb">
            <div class="thumb">${media}</div>
            <div class="popupThumbMeta" title="${esc(a.name)}">${esc(a.name)}</div>
            <div class="actions popupThumbActions">${attachmentActionsHTML(a,ai,"mapAttachmentView")}</div>
          </div>`;
        }).join("")}</div>`
      : `<div class="notice" style="margin:9px 0">${!row&&item.attachmentParentIndexFile?"Attachment links could not be fully resolved without this feature’s attributes.":"No attachments for this feature."}</div>`;

    return `<table class="popupTable">${attrs}</table>${unavailable}${thumbs}`;
  }

  let featureRequest=0;
  async function openFeatureDock(feature){
    const request=++featureRequest;
    currentFeature=null;currentPayload=null;
    mapDockBody.textContent="Loading feature details…";
    mapDock.classList.add("open");mapViewport.classList.add("hasDock");
    let payload;
    try{payload=await featurePayload(feature)}catch(err){if(!disposed&&request===featureRequest)mapDockBody.textContent=err.message;return}
    if(disposed||signal.aborted||request!==featureRequest)return;
    currentFeature=feature;currentPayload=payload;
    drawFeatureDock(feature,payload);
    setSelection(feature);
    requestAnimationFrame(()=>{if(!disposed)map.resize()});
  }

  function drawFeatureDock(feature,{row,attachments,attachmentCount}){
    const scrollTop=mapDockBody.scrollTop;
    const oidValue=(row&&oidIndex>=0)?row[oidIndex]:feature?.properties?.id;
    mapDockTitle.textContent=oidValue!=null?`${item.name} · ${oidName||"ID"} ${oidValue}`:item.name;
    mapDockBody.innerHTML=featureDetailsHTML(feature,row,attachments);
    hydrateAttachmentPreviews(mapDockBody,signal);
    if(attachmentCount>40)mapDockBody.insertAdjacentHTML("beforeend",'<div class="notice">Showing the first 40 linked attachments. Use the Attachments tab for the full gallery.</div>');
    mapDock.classList.add("open");mapViewport.classList.add("hasDock");
    mapDockBody.querySelectorAll(".mapAttachmentView").forEach(button=>{
      button.addEventListener("click",()=>{
        const attachment=attachments[Number(button.dataset.index)];
        if(attachment)openAttachment(attachment);
      });
    });
    mapDockBody.scrollTop=scrollTop;
  }

  const interactiveLayers=["points","lines","polygons","polygon-outline"];
  interactiveLayers.forEach(layerId=>{
    map.on("mouseenter",layerId,()=>map.getCanvas().style.cursor="pointer");
    map.on("mouseleave",layerId,()=>map.getCanvas().style.cursor="");
    map.on("click",layerId,e=>{
      const f=e.features?.[0];
      if(!f)return;
      const geoFeature={type:"Feature",geometry:f.geometry,properties:f.properties||{}};
      openFeatureDock(geoFeature);
    });
  });

  map.on("click",e=>{
    const hit=map.queryRenderedFeatures(e.point,{layers:interactiveLayers});
    if(!hit.length)closeFeatureDock();
  });
}

