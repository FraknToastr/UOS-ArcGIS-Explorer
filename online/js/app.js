
(() => {
'use strict';
const ARCGIS_OAUTH_CLIENT_ID = '2i8ErWnjyQES93El';
const ARCGIS_OAUTH_REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';
const $ = s => document.querySelector(s); const $$ = s => [...document.querySelectorAll(s)];
const state = { token:'', tokenKind:'', tokenPortalOrigin:'', identity:null, pkce:null, nodes:new Map(), edges:new Map(), selected:null, isolated:null,isolationMode:'branch', transform:{x:0,y:0,k:1}, dragging:null, panning:null };
let authEpoch=0,searchEpoch=0;
const KIND_COLORS = {experience:'var(--graph-experience)',webmap:'var(--graph-webmap)',webscene:'var(--graph-webscene)',service:'var(--graph-service)',layer:'var(--graph-layer)',table:'var(--graph-table)',other:'var(--graph-other)'};
const ROLE_COLORS = {system:'var(--graph-system)',metadata:'var(--graph-metadata)'};
const esc = s => String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function log(msg){ const el=$('#log'); const t=new Date().toLocaleTimeString(); el.textContent += `\n[${t}] ${msg}`; el.scrollTop=el.scrollHeight; }
function setAuthStatus(msg,kind=''){ const e=$('#authStatus'); e.textContent=msg;e.className='status'+(kind?' '+kind:''); }
function setScanStatus(msg,kind=''){ const e=$('#scanStatus');e.textContent=msg;e.className='status'+(kind?' '+kind:''); }
function portal(){ const u=new URL($('#portalInput').value.trim()||'https://www.arcgis.com');if(u.protocol!=='https:')throw new Error('Use an HTTPS portal URL.');return u.href.replace(/\/+$/,''); }
function sharing(){ return `${portal()}/sharing/rest`; }
function base64Url(bytes){let b='';for(const x of bytes)b+=String.fromCharCode(x);return btoa(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');}
function randomPkceString(n=64){const a=new Uint8Array(n);crypto.getRandomValues(a);return base64Url(a)}
async function pkceChallenge(v){ if(crypto?.subtle?.digest){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return {value:base64Url(new Uint8Array(d)),method:'S256'}} return {value:v,method:'plain'}; }
async function beginSignin(){
 try{
  const run=++authEpoch,portalURL=portal(),verifier=randomPkceString(64), ch=await pkceChallenge(verifier), st=randomPkceString(24);if(!currentAuth(run,portalURL))return;state.pkce={verifier,state:st,createdAt:Date.now(),portal:portalURL};
  const p=new URLSearchParams({client_id:ARCGIS_OAUTH_CLIENT_ID,response_type:'code',redirect_uri:ARCGIS_OAUTH_REDIRECT_URI,code_challenge:ch.value,code_challenge_method:ch.method,state:st,expiration:'120'});
  const w=window.open(`${sharing()}/oauth2/authorize?${p}`,'arcgis-dependency-signin','popup=yes,width=760,height=760,resizable=yes,scrollbars=yes');
  if(!w) throw new Error('Sign-in popup was blocked'); setAuthStatus('ArcGIS sign-in opened. Choose Allow, copy the returned authorization code, paste it above, then Exchange code.','warn');
 }catch(e){setAuthStatus(e.message,'bad')}
}
async function exchangeCode(){
 const code=$('#tokenInput').value.trim(); if(!code)return setAuthStatus('Paste the returned authorization code first.','warn');
 if(!state.pkce?.verifier)return setAuthStatus('Open ArcGIS sign-in first so the matching PKCE verifier exists.','warn');
 if(Date.now()-state.pkce.createdAt>15*60*1000){state.pkce=null;return setAuthStatus('Pending sign-in is stale. Open sign-in again.','warn')}
 const pending=state.pkce,run=++authEpoch;let portalURL;
 try{
  portalURL=portal();if(pending.portal&&pending.portal!==portalURL)throw new Error('The portal changed. Open sign-in again.');
  setAuthStatus('Exchanging authorization code…');
  const p=new URLSearchParams({f:'json',client_id:ARCGIS_OAUTH_CLIENT_ID,grant_type:'authorization_code',code,redirect_uri:ARCGIS_OAUTH_REDIRECT_URI,code_verifier:state.pkce.verifier});
  const r=await fetch(`${sharing()}/oauth2/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:p,cache:'no-store'}); const j=await r.json();
  if(!currentAuth(run,portalURL)||state.pkce!==pending)return;
  if(j.error)throw new Error(j.error_description||j.error?.message||String(j.error)); if(!j.access_token)throw new Error('ArcGIS returned no access token');
  state.token=j.access_token;state.tokenKind='access_token';state.pkce=null;$('#tokenInput').value=j.access_token; await verifyToken();
 }catch(e){if(run===authEpoch)setAuthStatus(`Token exchange failed: ${e.message}`,'bad')}
}
function currentAuth(run,portalURL){try{return run===authEpoch&&portal()===portalURL}catch{return false}}
async function verifyToken(){
 const val=$('#tokenInput').value.trim();if(!val)return setAuthStatus('Paste an access token or complete sign-in.','warn');const run=++authEpoch;let portalURL;
 state.identity=null;invalidatePortalSearch();
 try{portalURL=portal();state.token=val;state.tokenPortalOrigin=new URL(portalURL).origin;const j=await restJSON(`${portalURL}/sharing/rest/community/self`,{token:val},{allowError:false});if(!currentAuth(run,portalURL))return false;if(typeof j.username!=='string'||!j.username)throw Error('The portal did not return a signed-in username');state.identity={username:j.username,orgId:typeof j.orgId==='string'?j.orgId:'',portal:portalURL};$('#authDot').className='status-dot ok';$('#authLabel').textContent=j.username;setAuthStatus(`Signed in as ${j.fullName||j.username}. Token is held only in this tab.`,'ok');log(`Signed in as ${j.username}`);updateConnectControls();return true;}catch(e){if(run!==authEpoch)return false;state.token='';state.tokenPortalOrigin='';state.identity=null;$('#authDot').className='status-dot';$('#authLabel').textContent='Not signed in';setAuthStatus(`Token verification failed: ${e.message}`,'bad');updateConnectControls();return false;}
}
function clearToken(){++authEpoch;state.token='';state.tokenKind='';state.tokenPortalOrigin='';state.identity=null;state.pkce=null;$('#tokenInput').value='';$('#authDot').className='status-dot';$('#authLabel').textContent='Not signed in';setAuthStatus('Token cleared.');invalidatePortalSearch();updateConnectControls();}
function safeURL(value){try{const u=new URL(value);return u.protocol==='https:'||u.protocol==='http:'?u.href:''}catch{return ''}}
function authorizedHost(url){try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return false;const origin=state.tokenPortalOrigin||new URL(portal()).origin;return u.origin===origin||(!u.port&&/(^|\.)arcgis\.com$|(^|\.)arcgisonline\.com$/i.test(u.hostname))}catch{return false}}
async function restJSON(url,params={},opt={}){
 if(!safeURL(url))throw new Error('Invalid service URL');
 const p=new URLSearchParams({f:'json',...params});
 if(!authorizedHost(url))p.delete('token');
 if(state.token&&authorizedHost(url)&&!p.has('token'))p.set('token',state.token);
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),45000);
 const abort=()=>ctl.abort();if(opt.signal?.aborted)ctl.abort();opt.signal?.addEventListener('abort',abort,{once:true});
 try{const long=p.toString().length>1800;const r=await fetch(long?url:url+(url.includes('?')?'&':'?')+p,{method:long?'POST':'GET',...(long?{body:p}:{}),signal:ctl.signal,cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const j=await r.json();if(j?.error&&opt.allowError!==true)throw new Error(j.error.message||`ArcGIS error ${j.error.code||''}`);return j}finally{clearTimeout(timer);opt.signal?.removeEventListener('abort',abort)}
}
function extractItemId(v){ const s=String(v||'').trim(); const m=s.match(/(?:experience|items|item(?:id)?[=\/])\/?([0-9a-f]{32})/i)||s.match(/^([0-9a-f]{32})$/i)||s.match(/([0-9a-f]{32})/i);return m?m[1]:''; }
function classifyItem(item){const t=(item?.type||'').toLowerCase();if(t==='web experience')return'experience';if(t==='web map')return'webmap';if(t==='web scene')return'webscene';if(/feature service|map service|scene service|vector tile service|image service/.test(t))return'service';return'other';}
function nodeId(prefix,key){return `${prefix}:${key}`;}
function normalizeResourceRoles(roles){return Array.isArray(roles)?[...new Set(roles.map(role=>String(role||'').trim().toLowerCase()).filter(role=>['operational','basemap','system','metadata'].includes(role)))]:[]}
function explicitResourceRoles(node){
 const meta=node?.meta||{},normalise=value=>String(value).trim().toLowerCase(),types=[node?.type,meta.type].filter(value=>typeof value==='string').map(normalise),keywords=(Array.isArray(meta.typeKeywords)?meta.typeKeywords:[]).filter(value=>typeof value==='string').map(normalise),roles=[];
 if(meta.isSystem===true||meta.isSystemLayer===true||meta.isSystemTable===true||[...types,...keywords].some(type=>['system','system layer','system table','topology','utility network','trace network'].includes(type)))roles.push('system');
 // ArcGIS uses the plain "Metadata" keyword for items that HAVE metadata,
 // including ordinary services. It does not make the item a metadata resource.
 if(meta.isMetadata===true||types.some(type=>['metadata','metadata document','iso metadata','fgdc metadata'].includes(type))||keywords.some(type=>['metadata document','iso metadata','fgdc metadata'].includes(type)))roles.push('metadata');
 return roles;
}
function resourceVisible(node,{surface='content'}={}){if(!node)return false;const roles=normalizeResourceRoles(node.roles),visibility=ui.visibility[surface]||{system:false,metadata:false};if(roles.includes('operational'))return true;if(roles.includes('metadata')&&!visibility.metadata)return false;if((roles.includes('system')||roles.includes('basemap'))&&!visibility.system)return false;return true}
function tagResourceRole(id,role,seen=new Set()){if(!role||seen.has(id))return;seen.add(id);const node=state.nodes.get(id);if(!node)return;node.roles=normalizeResourceRoles([...(node.roles||[]),role]);for(const edge of state.edges.values())if(edge.source===id&&edge.relation==='contains')tagResourceRole(edge.target,role,seen)}
function addNode(n){if(state.nodes.size>=1200&&!state.nodes.has(n.id))throw new Error('Scan safety limit: 1,200 resources. Narrow the input.');if(!n.portal)n.portal=portal();const prev=state.nodes.get(n.id),roles=normalizeResourceRoles([...(prev?.roles||[]),...normalizeResourceRoles(n.roles),...explicitResourceRoles(n)]);if(!prev)state.nodes.set(n.id,{kind:'other',title:n.id,...n,roles,x:0,y:0});else Object.assign(prev,n,{roles,meta:{...prev.meta,...n.meta}});return state.nodes.get(n.id);}
function addEdge(a,b,relation='uses'){if(!a||!b||a===b)return;const k=`${a}>${b}:${relation}`;if(!state.edges.has(k))state.edges.set(k,{id:k,source:a,target:b,relation});}
function candidateItemIds(obj){const ids=new Set();const seen=new WeakSet();function walk(v,key=''){if(!v||typeof v!=='object'){if(typeof v==='string'&&/item|webmap|webscene|source/i.test(key)){const m=v.match(/\b[0-9a-f]{32}\b/ig);m?.forEach(x=>ids.add(x))}return}if(seen.has(v))return;seen.add(v);for(const [k,x] of Object.entries(v)){if(typeof x==='string'){if(/item.?id|webmap|webscene|portalitem|source/i.test(k)){const m=x.match(/\b[0-9a-f]{32}\b/ig);m?.forEach(y=>ids.add(y))}}else walk(x,k)}}walk(obj);return [...ids];}
function candidateUrls(obj){const urls=new Set();const seen=new WeakSet();function walk(v){if(!v||typeof v!=='object')return;if(seen.has(v))return;seen.add(v);for(const x of Object.values(v)){if(typeof x==='string'&&/^https?:\/\//i.test(x)&&/(FeatureServer|MapServer|SceneServer|ImageServer|VectorTileServer)(?:\/\d+)?(?:\?.*)?$/i.test(x))urls.add(x.replace(/\?.*$/,''));else if(x&&typeof x==='object')walk(x)}}walk(obj);return [...urls];}
async function fetchItem(id){return restJSON(`${sharing()}/content/items/${id}`)}
async function fetchItemData(id){return restJSON(`${sharing()}/content/items/${id}/data`)}
function serviceRoot(url){const m=String(url).match(/^(.*\/(?:FeatureServer|MapServer|SceneServer|ImageServer|VectorTileServer))(?:\/\d+)?\/?$/i);return m?m[1]:String(url).replace(/\/+$/,'');}
function layerNumber(url){const m=String(url).match(/\/(?:FeatureServer|MapServer|SceneServer|ImageServer|VectorTileServer)\/(\d+)\/?$/i);return m?Number(m[1]):null;}
async function scanService(url,parentId,labelHint='Service',role=null){
 const root=serviceRoot(url); const sid=nodeId('service',root); let meta={},serviceError='';
 try{meta=await restJSON(root)}catch(e){serviceError=e.message;log(`Service metadata failed: ${root} — ${e.message}`)}
 const title=meta.name||meta.mapName||(labelHint!=='Service'?labelHint:'')||root.split('/').slice(-2,-1)[0]||'Service';
 const serviceModified=meta?.editingInfo?.lastEditDate??meta?.lastEditDate??meta?.modified??null;
 addNode({id:sid,kind:'service',title,type:meta.type||root.split('/').pop(),url:root,modified:serviceModified,meta,error:serviceError,roles:role?[role]:[]}); addEdge(parentId,sid,'references');
 const all=[...(meta.layers||[]).map(x=>({...x,_kind:'layer'})),...(meta.tables||[]).map(x=>({...x,_kind:'table'}))];
 if(!all.length){const n=layerNumber(url);if(n!==null){try{const lm=await restJSON(`${root}/${n}`);all.push({id:n,name:lm.name||`Layer ${n}`,_kind:'layer',_meta:lm})}catch{}}}
 for(const l of all){
  const layerUrl=`${root}/${l.id}`, lid=nodeId(l._kind,layerUrl);
  let layerMeta=l._meta||null,layerError='';
  if(!layerMeta){
   try{layerMeta=await restJSON(layerUrl)}catch(e){layerError=e.message;log(`Layer metadata failed: ${layerUrl} — ${e.message}`)}
  }
  const finalMeta=layerMeta||l;
  const modified=finalMeta?.editingInfo?.lastEditDate??finalMeta?.lastEditDate??finalMeta?.modified??null;
  addNode({id:lid,kind:l._kind,title:finalMeta?.name||l.name||`${l._kind} ${l.id}`,type:l._kind==='table'?'Table':'Layer',url:layerUrl,layerId:l.id,modified,meta:finalMeta,error:layerError,roles:role?[role]:[]});
  addEdge(sid,lid,'contains');
 }
 return sid;
}
async function webLayerWalk(layer,parentNode,webNode,role=null){
 if(!layer)return; const label=layer.title||layer.name||layer.id||'Layer';
 if(layer.url&&/(FeatureServer|MapServer|SceneServer|ImageServer|VectorTileServer)/i.test(layer.url)){return scanServiceOnce(layer.url,parentNode||webNode,label,role)}
 if(layer.itemId){return scanItem(layer.itemId,parentNode||webNode,role)}
 if(Array.isArray(layer.layers)){ const gid=nodeId('layer',`${webNode}|group|${layer.id||label}`);addNode({id:gid,kind:'layer',title:label,type:'Group layer',meta:layer,roles:role?[role]:[]});addEdge(parentNode||webNode,gid,'contains');for(const ch of layer.layers)await webLayerWalk(ch,gid,webNode,role);return; }
 const lid=nodeId('layer',`${webNode}|embedded|${layer.id||label}`);addNode({id:lid,kind:'layer',title:label,type:layer.layerType||'Embedded layer',meta:layer,roles:role?[role]:[]});addEdge(parentNode||webNode,lid,'contains');
}
const scannedItems=new Set(), scanningItems=new Map(), scannedServices=new Set(), itemNodeIds=new Map();
async function scanItem(id,parentId=null,role=null){
 id=extractItemId(id)||id;if(!id)return null;if(scanningItems.has(id)){const nid=itemNodeIds.get(id);if(parentId&&nid)addEdge(parentId,nid,'references');tagResourceRole(nid,role);return nid||null}
 const promise=(async()=>{
   let item;try{item=await fetchItem(id)}catch(e){const nid=nodeId('item',id);addNode({id:nid,kind:'other',title:`Unavailable item ${id.slice(0,8)}…`,itemId:id,error:e.message});if(parentId)addEdge(parentId,nid);log(`Item ${id} failed: ${e.message}`);return nid}
   const kind=classifyItem(item),nid=kind==='service'&&item.url?nodeId('service',serviceRoot(item.url)):nodeId(kind,id);const usageChanged=role&&!state.nodes.get(nid)?.roles?.includes(role);itemNodeIds.set(id,nid);addNode({id:nid,kind,title:item.title||id,itemId:id,type:item.type,owner:item.owner,url:item.url||'',modified:item.modified,meta:item,roles:role?[role]:[]});if(parentId)addEdge(parentId,nid,'references');
   if(scannedItems.has(id)&&!usageChanged)return nid;scannedItems.add(id);log(`Read ${item.type}: ${item.title}`);
   let data={};try{data=await fetchItemData(id)}catch(e){log(`Item data unavailable for ${item.title}: ${e.message}`)}
   if(kind==='webmap'||kind==='webscene'){
      for(const l of data.operationalLayers||[])await webLayerWalk(l,nid,nid,role==='basemap'?'basemap':'operational');
      for(const l of data.baseMap?.baseMapLayers||[])await webLayerWalk(l,nid,nid,'basemap');
      for(const t of data.tables||[])await webLayerWalk({...t,layerType:'Table'},nid,nid,role==='basemap'?'basemap':'operational');
      // Catch item-backed map layers missed by direct layer traversal.
      const ids=candidateItemIds(data);for(const cid of ids)if(cid!==id)await scanItem(cid,nid);
      const urls=candidateUrls(data);for(const u of urls)await scanServiceOnce(u,nid);
   }else if(kind==='service'&&item.url){await scanServiceOnce(item.url,nid,item.title,role)}
   else{
      const ids=candidateItemIds(data);for(const cid of ids)if(cid!==id)await scanItem(cid,nid);
      const urls=candidateUrls(data);for(const u of urls)await scanServiceOnce(u,nid);
   }
   return nid;
 })();scanningItems.set(id,promise);try{return await promise}finally{scanningItems.delete(id)}
}
async function scanServiceOnce(url,parentId,label,role=null){const root=serviceRoot(url);const key=root.toLowerCase();if(scannedServices.has(key)){const sid=nodeId('service',root);addEdge(parentId,sid,'references');tagResourceRole(sid,role);return sid}scannedServices.add(key);return scanService(url,parentId,label,role)}
function captureWorkspace(){return {nodes:new Map([...state.nodes].map(([id,node])=>[id,{...node,meta:{...node.meta},roles:normalizeResourceRoles(node.roles)}])),edges:new Map([...state.edges].map(([id,edge])=>[id,{...edge}])),selected:state.selected,isolated:state.isolated,isolationMode:state.isolationMode,transform:{...state.transform},demo:ui.demo,levelLimit:ui.levelLimit,manualExpand:new Map(ui.manualExpand),filterReveal:ui.filterReveal,geo:ui.geo,featureNode:ui.featureNode,featureIds:ui.featureIds,featureOffset:ui.featureOffset,featureTotal:ui.featureTotal,selectedFeature:ui.selectedFeature,scannedItems:new Set(scannedItems),scannedServices:new Set(scannedServices),itemNodeIds:new Map(itemNodeIds)}}
function restoreWorkspace(saved){state.nodes.clear();for(const [id,node] of saved.nodes)state.nodes.set(id,node);state.edges.clear();for(const [id,edge] of saved.edges)state.edges.set(id,edge);for(const key of ['selected','isolated','isolationMode','transform'])state[key]=saved[key];for(const key of ['demo','levelLimit','manualExpand','filterReveal','geo','featureNode','featureIds','featureOffset','featureTotal','selectedFeature'])ui[key]=saved[key];scannedItems.clear();saved.scannedItems.forEach(id=>scannedItems.add(id));scannedServices.clear();saved.scannedServices.forEach(id=>scannedServices.add(id));itemNodeIds.clear();saved.itemNodeIds.forEach((id,key)=>itemNodeIds.set(key,id));scanningItems.clear();if(ui.mapReady)ui.map.getSource('features')?.setData(ui.geo);render();renderDetails();refreshIntegrated()}
async function buildGraph(){
 if(ui.busy)return false;let input=$('#itemInput').value.trim();const id=extractItemId(input),isService=/^https?:\/\/.*\/(FeatureServer|MapServer|SceneServer|ImageServer|VectorTileServer)(\/\d+)?\/?(\?.*)?$/i.test(input);
 if(!id&&!isService){setScanStatus('Enter a valid ArcGIS item ID, item URL or service/layer URL.','warn');return false}
 let portalURL;try{portalURL=portal()}catch(error){setScanStatus(error.message,'bad');return false}
 const saved=captureWorkspace(),authentication=authEpoch;
 if(!$('#appendScan').checked||ui.demo)resetGraph();setBusy(true);setScanStatus('Reading ArcGIS dependencies…');
 try{
  let selected;
  if(isService){const clean=new URL(input);clean.search='';input=clean.href.replace(/\/$/,'');selected=await scanServiceOnce(input,null);const ln=layerNumber(input);if(ln!==null){const layer=nodeId('layer',input),table=nodeId('table',input);selected=state.nodes.has(layer)?layer:state.nodes.has(table)?table:selected}}
  else selected=await scanItem(id);
  if(authentication!==authEpoch||portal()!==portalURL)throw Error('The portal or account changed while loading. Search again with the current connection.');
  const resource=state.nodes.get(selected);if(!resource||resource.error)throw Error(resource?.error||'The selected resource is unavailable.');
  layoutGraph();render();fitGraph();ui.demo=false;refreshIntegrated();selectNode(selected);switchView('content');
  setScanStatus(`Loaded ${resource.title}: ${state.nodes.size} resources and ${state.edges.size} relationships. Unavailable dependencies remain labelled.`,'ok');status('Content loaded. Choose any explorer.');return true;
 }catch(error){restoreWorkspace(saved);setScanStatus(`Could not load this resource: ${error.message} Your existing workspace has been kept.`,'bad');status('Load failed. Existing workspace preserved.');return false}
 finally{setBusy(false)}
}

function resetGraph(){state.nodes.clear();state.edges.clear();state.selected=null;graphAppearance.clicked=null;state.isolated=null;state.isolationMode='branch';scannedItems.clear();scanningItems.clear();scannedServices.clear();itemNodeIds.clear();clearSpatial();ui.levelLimit=1;ui.manualExpand.clear();ui.filterReveal=true;ui.demo=false;render();renderDetails();refreshIntegrated();}
function visibleKind(kind){const cb=$(`input[data-kind="${kind}"]`);return cb?cb.checked:true}
const createGraphPreferences=()=>({layouts:{all:'dependency',branch:'dependency',first:'balanced'},autoFit:true,density:'balanced',spacing:135});
const graphVersionPreferences={v1:createGraphPreferences(),v2:createGraphPreferences()};
let graphLayoutVersion='v1',graphPreferences=graphVersionPreferences.v1,graphLayouts=graphPreferences.layouts;
const graphAppearance={cards:false,clickOnly:true,clicked:null};
const graphDensity={roomy:{spacing:220,scale:1.24},balanced:{spacing:135,scale:1},compact:{spacing:72,scale:.72}};
function graphEngine(){return graphLayoutVersion==='v1'?window.UOSGraphLayoutV1:window.UOSGraphLayout}
function graphNodeColor(node){const roles=normalizeResourceRoles([...(node?.roles||[]),...explicitResourceRoles(node)]);if(roles.includes('system')||roles.includes('basemap'))return ROLE_COLORS.system;if(roles.includes('metadata'))return ROLE_COLORS.metadata;return KIND_COLORS[node?.kind]||KIND_COLORS.other}
function graphAppearanceControls(){
 const svg=$('#graph');svg.classList.toggle('graph-cards-off',!graphAppearance.cards);svg.classList.toggle('graph-click-highlights',graphAppearance.clickOnly);
 $('#graphCardsBtn').setAttribute('aria-pressed',String(graphAppearance.cards));$('#graphClickHighlightsBtn').setAttribute('aria-pressed',String(graphAppearance.clickOnly));
 for(const entry of graphEdgeDOM){entry.element.classList.toggle('graph-edge-clicked',!!graphAppearance.clicked&&(entry.edge.source===graphAppearance.clicked||entry.edge.target===graphAppearance.clicked));if(graphAppearance.clickOnly)entry.element.classList.remove('graph-edge-hover')}
}
let graphGeometry=null,graphLayoutKey='',graphSize={width:900,height:600},graphCurrent=new Map(),graphAnimation=null,graphFrame=0,graphResizeFrame=0;
const graphNodeDOM=new Map(),graphEdgeDOM=[];
const graphReduced=matchMedia('(prefers-reduced-motion: reduce)');
const graphMeasureCanvas=document.createElement('canvas'),graphMeasureContext=graphMeasureCanvas.getContext('2d');
function graphMeasure(value,size=14,weight=500){if(!graphMeasureContext)return String(value).length*size*.52;graphMeasureContext.font=`${weight} ${size}px "Segoe UI",Arial,sans-serif`;return graphMeasureContext.measureText(String(value)).width}
function graphView(){return state.isolated?(state.isolationMode==='first'?'first':'branch'):'all'}
function depthMap(){return UOSGraphLayout.depth([...state.nodes.values()],[...state.edges.values()])}
function descendants(root){const out=new Set([root]),next=new Map();for(const e of state.edges.values()){if(!next.has(e.source))next.set(e.source,[]);next.get(e.source).push(e.target)}const queue=[root];for(let i=0;i<queue.length;i++)for(const id of next.get(queue[i])||[])if(!out.has(id)){out.add(id);queue.push(id)}return out}
function firstDegreeNodes(root){const ids=new Set();if(!state.nodes.has(root))return ids;ids.add(root);for(const edge of state.edges.values()){if(edge.source===root)ids.add(edge.target);if(edge.target===root)ids.add(edge.source)}return ids}
function connectionClass(edge,root=state.selected,neighbours=null){if(!root)return '';if(edge.source===root||edge.target===root)return 'connection-first';const near=neighbours||firstDegreeNodes(root);return near.has(edge.source)||near.has(edge.target)?'connection-second':'connection-distant'}
function filteredSets(){let allowed=new Set([...state.nodes.values()].filter(n=>visibleKind(n.kind)&&(typeof resourceVisible!=='function'||resourceVisible(n,{surface:'graph'}))).map(n=>n.id));if(state.isolated){const subset=state.isolationMode==='first'?firstDegreeNodes(state.isolated):descendants(state.isolated);allowed=new Set([...allowed].filter(id=>subset.has(id)))}return allowed}
function visibleGraphEdges(allowed=filteredSets()){return [...state.edges.values()].filter(e=>allowed.has(e.source)&&allowed.has(e.target)&&(!(state.isolated&&state.isolationMode==='first')||e.source===state.isolated||e.target===state.isolated))}
function graphViewport(){const r=$('#graph').getBoundingClientRect();return {width:r.width,height:r.height}}
function layoutGraph(){graphLayoutKey='';graphCalculate()}
function graphCalculate(){
 const box=graphViewport();if(box.width>1&&box.height>1)graphSize=box;
 const allowed=filteredSets(),nodes=[...state.nodes.values()].filter(n=>allowed.has(n.id)),edges=visibleGraphEdges(allowed),view=graphView(),layout=graphLayouts[view];
 const density=graphDensity[graphPreferences.density]||graphDensity.balanced;
 const key=[graphLayoutVersion,view,layout,state.isolated,state.selected,Math.round(graphSize.width),Math.round(graphSize.height),density.spacing,graphPreferences.spacing,...nodes.map(n=>n.id+'|'+n.title+'|'+n.type),...edges.map(e=>e.id||e.source+'>'+e.target)].join('\n');
 if(graphGeometry&&key===graphLayoutKey)return false;
 graphLayoutKey=key;
 const sliderSpacing=graphPreferences.spacing;
 graphGeometry=graphEngine().compute(nodes,edges,{...graphSize,layout,ego:view==='first',root:state.isolated,selected:state.selected,measure:graphMeasure,spacing:density.spacing*sliderSpacing/135,density:graphPreferences.density,densityScale:density.scale});
 for(const [id,p] of graphGeometry.positions){const n=state.nodes.get(id);n.x=p.x;n.y=p.y}
 return true;
}
function graphCancel(freeze=false){if(graphFrame)cancelAnimationFrame(graphFrame);graphFrame=0;graphAnimation=null;if(freeze)for(const [id,p] of graphCurrent){const node=state.nodes.get(id);if(node){node.x=p.x;node.y=p.y}}}
let graphRouter=null,graphRouterKey='',graphRouterMetrics=null;
function graphPath(edge){return graphLayoutVersion==='v1'?graphEngine().path(edge,graphCurrent,graphGeometry?.metrics||new Map()):graphRouter?.path(edge)||''}
function graphPaint(){
  for(const [id,p] of graphCurrent)graphNodeDOM.get(id)?.setAttribute('transform','translate('+p.x+','+p.y+')');
  const key=[...graphCurrent].map(([id,p])=>id+':'+p.x.toFixed(2)+','+p.y.toFixed(2)).join('|');
  if(graphLayoutVersion==='v2'&&(key!==graphRouterKey||graphRouterMetrics!==graphGeometry?.metrics)){
    graphRouter=window.UOSGraphRouting.createRouter(graphCurrent,graphGeometry?.metrics||new Map());
    graphRouterKey=key;graphRouterMetrics=graphGeometry?.metrics;
  }
  for(const entry of graphEdgeDOM)entry.element.setAttribute('d',graphPath(entry.edge));
  applyTransform();
}
function graphAnimate(to,camera=null){
 graphCancel();const from=new Map([...to].map(([id,p])=>[id,graphCurrent.get(id)||p]));
 if(graphReduced.matches||!graphCurrent.size||to.size>160){graphCurrent=new Map(to);if(camera)state.transform=camera;graphPaint();return}
 graphCurrent=new Map([...from].map(([id,p])=>[id,{...p}]));
 graphAnimation={from,to:new Map(to),cameraFrom:{...state.transform},cameraTo:camera||{...state.transform},start:performance.now()};
 const tick=now=>{graphFrame=0;if(!graphAnimation)return;const animation=graphAnimation,t=Math.min(1,(now-animation.start)/200),ease=1-(1-t)**3;for(const [id,p] of animation.to){const old=animation.from.get(id)||p,current=graphCurrent.get(id);current.x=old.x+(p.x-old.x)*ease;current.y=old.y+(p.y-old.y)*ease}for(const key of ['x','y','k'])state.transform[key]=animation.cameraFrom[key]+(animation.cameraTo[key]-animation.cameraFrom[key])*ease;graphPaint();if(t<1)graphFrame=requestAnimationFrame(tick);else graphAnimation=null};
 graphFrame=requestAnimationFrame(tick);
}
function graphCamera(next){graphAnimate(graphGeometry?.positions||new Map(),next)}
function graphControls(){
 const view=graphView(),layout=graphLayouts[view];$('#graph').dataset.layoutVersion=graphLayoutVersion;
 $$('[data-graph-version]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.graphVersion===graphLayoutVersion)));
 $$('[data-graph-view]').forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.graphView===view));button.disabled=button.dataset.graphView!=='all'&&!state.selected});
 $$('[data-graph-layout]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.graphLayout===layout)));
 $$('[data-graph-density]').forEach(button=>{
   button.setAttribute('aria-pressed',String(button.dataset.graphDensity===graphPreferences.density));
   if(button.dataset.graphDensity==='balanced'){button.textContent=graphLayoutVersion==='v1'?'Balanced':'Normal';button.dataset.tooltip=graphLayoutVersion==='v1'?'Use balanced spacing':'Use normal spacing'}
 });
 const spacing=$('#spacingInput');if(spacing)spacing.value=graphPreferences.spacing;
 const fit=$('#graphAutoFitBtn');if(fit)fit.setAttribute('aria-pressed',String(graphPreferences.autoFit));
}
function setGraphLayoutVersion(version){
 if(!Object.hasOwn(graphVersionPreferences,version)||version===graphLayoutVersion)return;
 graphCancel(true);state.dragging=null;state.panning=null;
 graphLayoutVersion=version;graphPreferences=graphVersionPreferences[version];graphLayouts=graphPreferences.layouts;
 graphLayoutKey='';graphRouter=null;graphRouterKey='';graphRouterMetrics=null;graphCurrent=new Map();
 render();maybeFitGraph();
}
function setGraphDensity(value){
 if(!Object.hasOwn(graphDensity,value))return;
 graphPreferences.density=value;layoutGraph();render();maybeFitGraph();
}
function setGraphSpacing(value){
 const spacing=Number(value);if(!Number.isFinite(spacing))return;
 graphPreferences.spacing=Math.max(80,Math.min(220,spacing));layoutGraph();render();maybeFitGraph();
}
function setGraphAutoFit(enabled){
 graphPreferences.autoFit=!!enabled;graphControls();if(graphPreferences.autoFit)fitGraph();
}
function ensureGraphPreferencesUI(){
 const toolbar=$('.graph-toolbar');if(!toolbar||$('#graphDensityControl'))return;
 const labelGroup=(group,text)=>{group.classList.add('graph-labelled-group');const label=document.createElement('span');label.className='graph-control-label';label.textContent=text;label.setAttribute('aria-hidden','true');group.prepend(label)};
 const layout=$('[data-graph-layout]')?.parentElement;if(layout)labelGroup(layout,'Layout');
 const group=document.createElement('div');group.id='graphDensityControl';group.className='graph-segmented';group.setAttribute('role','group');group.setAttribute('aria-label','Graph density');
 for(const [key,label,tip] of [['roomy','Roomy','Give nodes more breathing room'],['balanced','Normal','Use normal spacing'],['compact','Compact','Fit more nodes into the viewport']]){const button=document.createElement('button');button.type='button';button.dataset.graphDensity=key;button.dataset.tooltip=tip;button.textContent=label;button.setAttribute('aria-pressed',String(graphPreferences.density===key));group.appendChild(button)}
 labelGroup(group,'Density');
 const auto=document.createElement('button');auto.id='graphAutoFitBtn';auto.type='button';auto.dataset.tooltip='Fit automatically after graph changes';auto.textContent='Auto-fit';auto.setAttribute('aria-pressed',String(graphPreferences.autoFit));toolbar.insertBefore(group,$('#graphFitBtn'));toolbar.insertBefore(auto,$('#graphFitBtn'));
}
function graphSelectionNotice(allowed){
 let notice=$('#graphHiddenSelection');if(!notice){notice=document.createElement('p');notice.id='graphHiddenSelection';notice.className='graph-hidden-selection';notice.setAttribute('role','status');$('#details').before(notice)}
 const hidden=state.selected&&!allowed.has(state.selected);notice.hidden=!hidden;notice.textContent=hidden?'The selected resource is hidden by graph filters. Its details remain available.':'';
 let focus=$('#graphFocusLabel');if(!focus){focus=document.createElement('div');focus.id='graphFocusLabel';focus.className='graph-focus-label';$('#graph').parentElement.appendChild(focus)}
 const selected=state.nodes.get(state.selected);focus.hidden=graphLayouts[graphView()]==='radial'||!selected||!allowed.has(selected.id)||state.transform.k>=13/14;focus.textContent=selected?selected.title+' · '+(selected.type||selected.kind):'';
}
function render(){
 const changed=!state.dragging&&graphCalculate(),allowed=filteredSets(),ns=$('#nodes'),es=$('#edges');
 graphCancel();graphNodeDOM.clear();graphEdgeDOM.length=0;ns.replaceChildren();es.replaceChildren();
 if(!graphGeometry)return;
 const svgNS='http://www.w3.org/2000/svg';
 if(!$('#graph-arrows')){const defs=document.createElementNS(svgNS,'defs');defs.id='graph-arrows';defs.innerHTML='<marker id="graph-arrow" markerWidth="8" markerHeight="8" viewBox="0 -4 8 8" refX="7" refY="0" orient="auto" markerUnits="userSpaceOnUse"><path d="M0,-3L7,0L0,3Z" fill="context-stroke"/></marker>';$('#graph').prepend(defs)}
 const near=firstDegreeNodes(state.selected),priority={'connection-first':0,'connection-second':1,'connection-distant':2,'':2};
 const edges=visibleGraphEdges(allowed).sort((a,b)=>priority[connectionClass(b,state.selected,near)]-priority[connectionClass(a,state.selected,near)]);
 for(const edge of edges){const path=document.createElementNS(svgNS,'path');path.classList.add('edge');if(state.selected)path.classList.add(connectionClass(edge,state.selected,near));path.dataset.id=edge.id;path.setAttribute('marker-end','url(#graph-arrow)');path.setAttribute('fill','none');es.appendChild(path);graphEdgeDOM.push({edge,element:path})}
 for(const n of state.nodes.values()){
  if(!allowed.has(n.id))continue;const m=graphGeometry.metrics.get(n.id);if(!m)continue;
  const g=document.createElementNS(svgNS,'g');g.classList.add('node');if(n.id===state.selected)g.classList.add('selected');g.dataset.id=n.id;g.dataset.tooltip=n.title+' · '+(n.type||n.kind);g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label',g.dataset.tooltip);g.setAttribute('aria-pressed',String(n.id===state.selected));
  const hit=document.createElementNS(svgNS,'rect');hit.classList.add('graph-node-hit');hit.setAttribute('x',-m.w/2);hit.setAttribute('y',-m.h/2);hit.setAttribute('width',m.w);hit.setAttribute('height',m.h);hit.setAttribute('rx','6');g.appendChild(hit);
  const circle=document.createElementNS(svgNS,'circle');circle.setAttribute('cx',m.iconX);circle.setAttribute('r',m.r);circle.setAttribute('fill',graphNodeColor(n));g.appendChild(circle);
  const text=document.createElementNS(svgNS,'text');text.classList.add('graph-node-label');text.setAttribute('x',m.textX);text.setAttribute('y',-m.h/2+16);m.lines.forEach((line,i)=>{const span=document.createElementNS(svgNS,'tspan');span.setAttribute('x',m.textX);span.setAttribute('dy',i?'17':'0');span.textContent=line;text.appendChild(span)});g.appendChild(text);
  const sub=document.createElementNS(svgNS,'text');sub.classList.add('sub');sub.setAttribute('x',m.textX);sub.setAttribute('y',-m.h/2+16+m.lines.length*17);sub.textContent=m.subtitle;g.appendChild(sub);ns.appendChild(g);graphNodeDOM.set(n.id,g);
 }
 const target=graphGeometry.positions;if(changed)graphAnimate(target);else{graphCurrent=new Map([...target].map(([id,p])=>[id,{x:state.nodes.get(id).x,y:state.nodes.get(id).y}]));graphPaint()}
 graphControls();graphAppearanceControls();applySearch();$('#countLabel').textContent=`${allowed.size} nodes · ${edges.length} links`;$('#emptyState').style.display=allowed.size?'none':'grid';graphSelectionNotice(allowed);
}
function applyTransform(){
 $('#viewport').setAttribute('transform',`translate(${state.transform.x},${state.transform.y}) scale(${state.transform.k})`);
 const overview=state.transform.k<13/14;$('#graph').classList.toggle('graph-overview',overview);$('#graph').setAttribute('data-overview',String(overview));
 const radial=graphLayouts[graphView()]==='radial';
 const focus=$('#graphFocusLabel');if(focus)focus.hidden=radial||!overview||!state.selected||!graphGeometry?.positions.has(state.selected);
 let badge=$('#graphOverviewNote');if(!badge){badge=document.createElement('span');badge.id='graphOverviewNote';badge.className='graph-overview-note';badge.setAttribute('role','status');badge.textContent='Overview · all visible resources retained. Select a node, then Focus, Branch or First-degree for readable detail.';$('#graph').parentElement.appendChild(badge)}badge.hidden=radial||!overview||!state.nodes.size;
}
function applySearch(){const q=$('#searchInput').value.trim().toLowerCase();if(!q){$$('.node,.edge').forEach(x=>x.classList.remove('dim'));return}const hit=new Set([...state.nodes.values()].filter(n=>[n.title,n.type,n.itemId,n.url].some(v=>String(v||'').toLowerCase().includes(q))).map(n=>n.id));$$('.node').forEach(x=>x.classList.toggle('dim',!hit.has(x.dataset.id)));$$('.edge').forEach(x=>{const e=state.edges.get(x.dataset.id);x.classList.toggle('dim',!(hit.has(e.source)||hit.has(e.target)))})}
function fitGraph({force=true}={}){
 const r=graphViewport();if(r.width<=1||r.height<=1)return;
 if(Math.abs(r.width-graphSize.width)>1||Math.abs(r.height-graphSize.height)>1){graphLayoutKey='';render()}
 if(!graphGeometry?.positions.size)return;
 const camera=graphLayoutVersion==='v1'
   ?graphEngine().fit(graphGeometry,r.width,r.height,{ego:graphView()==='first',root:state.isolated})
   :graphEngine().fit(graphGeometry,r.width,r.height);
 graphCamera(camera);
}
function maybeFitGraph(){if(graphPreferences.autoFit)fitGraph({force:false})}
function focusSelection(){const n=state.nodes.get(state.selected),r=graphViewport();if(!n||!filteredSets().has(n.id)||r.width<=1||r.height<=1)return;const k=Math.max(1,state.transform.k);graphCamera({k,x:r.width/2-n.x*k,y:r.height/2-n.y*k})}
function zoomAt(factor,cx,cy){graphCancel(true);const t=state.transform,nk=Math.max(.00001,Math.min(5,t.k*factor));state.transform={k:nk,x:cx-(cx-t.x)*(nk/t.k),y:cy-(cy-t.y)*(nk/t.k)};applyTransform()}
function setGraphView(view){if(view!=='all'&&!state.selected)return;state.isolated=view==='all'?null:state.selected;state.isolationMode=view==='first'?'first':'branch';layoutGraph();render();fitGraph({force:true})}
function isolateFirstDegree(){setGraphView('first')}
function selectNode(id,{activateGraph=false}={}){if(!state.nodes.has(id))return;if(activateGraph)graphAppearance.clicked=id;else if(id!==state.selected)graphAppearance.clicked=null;const follow=graphView()==='first';state.selected=id;if(follow)state.isolated=id;render();renderDetails();syncSelection();renderContent();renderSchema();renderMetadata();if(follow)maybeFitGraph()}
function initGraphControls(){
 ensureGraphPreferencesUI();
 $$('[data-graph-version]').forEach(button=>button.onclick=()=>setGraphLayoutVersion(button.dataset.graphVersion));
 $('#graphCardsBtn').onclick=()=>{graphAppearance.cards=!graphAppearance.cards;graphAppearanceControls()};
 $('#graphClickHighlightsBtn').onclick=()=>{graphAppearance.clickOnly=!graphAppearance.clickOnly;graphAppearanceControls()};
 $('#graphAutoFitBtn')?.addEventListener('click',()=>setGraphAutoFit(!graphPreferences.autoFit));
 $$('[data-graph-density]').forEach(button=>button.addEventListener('click',()=>setGraphDensity(button.dataset.graphDensity)));
 const highlight=id=>{for(const entry of graphEdgeDOM)entry.element.classList.toggle('graph-edge-hover',!graphAppearance.clickOnly&&!!id&&(entry.edge.source===id||entry.edge.target===id))};
 $('#nodes').addEventListener('pointerover',event=>highlight(event.target.closest?.('.node')?.dataset.id));
 $('#nodes').addEventListener('pointerout',event=>{if(!event.relatedTarget?.closest?.('.node'))highlight(null)});
 $('#nodes').addEventListener('focusin',event=>highlight(event.target.closest?.('.node')?.dataset.id));
 $('#nodes').addEventListener('focusout',()=>highlight(null));
 $$('[data-graph-view]').forEach(button=>button.onclick=()=>setGraphView(button.dataset.graphView));
 $$('[data-graph-layout]').forEach(button=>button.onclick=()=>{graphLayouts[graphView()]=button.dataset.graphLayout;layoutGraph();render();maybeFitGraph()});
 $('#graphFitBtn')?.addEventListener('click',()=>fitGraph({force:true}));
 const viewport=$('#graph'),toolbar=$('.graph-toolbar'),workspace=viewport.parentElement;
 const queueResize=()=>{if(graphResizeFrame)return;graphResizeFrame=requestAnimationFrame(()=>{graphResizeFrame=0;const box=graphViewport();if(box.width<=1||box.height<=1)return;graphLayoutKey='';render();maybeFitGraph()})};
 const observer=new ResizeObserver(entries=>{for(const entry of entries)if(entry.target===toolbar){workspace.style.setProperty('--graph-toolbar-height',Math.ceil(toolbar.getBoundingClientRect().height)+'px')}queueResize()});observer.observe(viewport);observer.observe(toolbar);
 viewport.addEventListener('keydown',event=>{const target=event.target.closest?.('.node');if(target&&(event.key==='Enter'||event.key===' ')){event.preventDefault();selectNode(target.dataset.id,{activateGraph:true});graphNodeDOM.get(target.dataset.id)?.focus({preventScroll:true})}});
 window.addEventListener('pagehide',()=>{graphCancel();if(graphResizeFrame)cancelAnimationFrame(graphResizeFrame);observer.disconnect()});
 window.addEventListener('pageshow',event=>{if(event.persisted){observer.observe(viewport);observer.observe(toolbar);queueResize()}});
 window.UOSGraph={stats:()=>({layoutVersion:graphLayoutVersion,view:graphView(),layout:graphLayouts[graphView()],preferences:{...graphLayouts,autoFit:graphPreferences.autoFit,density:graphPreferences.density,spacing:graphPreferences.spacing},appearance:{...graphAppearance},nodes:graphNodeDOM.size,edges:graphEdgeDOM.length,transform:{...state.transform},viewport:graphViewport(),overview:state.transform.k<13/14,animating:!!graphAnimation}),fit:()=>fitGraph({force:true}),view:setGraphView};
 graphControls();
}

function nodeModifiedValue(n){
 const candidates=[
  n?.modified,
  n?.meta?.modified,
  n?.meta?.editingInfo?.lastEditDate,
  n?.meta?.lastEditDate,
  n?.meta?.editFieldsInfo?.lastEditDate
 ];
 for(const v of candidates){
  if(v===0)return 0;
  if(v!==undefined&&v!==null&&v!==''){
   const num=Number(v);
   if(Number.isFinite(num))return num;
   const parsed=Date.parse(String(v));
   if(Number.isFinite(parsed))return parsed;
  }
 }
 return null;
}
function formatModifiedDate(n){
 const value=nodeModifiedValue(n);
 if(value===null)return '—';
 try{
  return new Intl.DateTimeFormat(undefined,{
   day:'2-digit',month:'short',year:'numeric',
   hour:'2-digit',minute:'2-digit'
  }).format(new Date(value));
 }catch{return new Date(value).toLocaleString()}
}
function renderDetails(){const d=$('#details'),c=$('#connections'),n=state.nodes.get(state.selected);if(!n){d.innerHTML='<div class="meta">Select a node to inspect its ArcGIS item/service metadata and relationships.</div>';c.innerHTML='<div class="meta">None selected.</div>';return}const itemLink=n.itemId?`${n.portal||portal()}/home/item.html?id=${n.itemId}`:'';d.innerHTML=`<div class="card-title">${esc(n.title)}</div><div class="meta">${esc(n.type||n.kind)}</div><div><span class="tag">${esc(n.kind)}</span>${n.owner?`<span class="tag">${esc(n.owner)}</span>`:''}</div><div class="kv"><b>Item ID</b><span>${esc(n.itemId||'—')}</span><b>Layer ID</b><span>${esc(n.layerId??'—')}</span><b>Last modified</b><span>${esc(formatModifiedDate(n))}</span><b>URL</b><span>${safeURL(n.url)?`<a class="link" href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.url)}</a>`:'—'}</span><b>ArcGIS item</b><span>${itemLink?`<a class="link" href="${esc(itemLink)}" target="_blank" rel="noopener">Open item page</a>`:'—'}</span>${n.error?`<b>Error</b><span>${esc(n.error)}</span>`:''}</div><div class="row"><button class="btn small" onclick="window.__depFocus()">Focus</button><button class="btn small" onclick="window.__depBranch()">Isolate branch</button><button class="btn small" onclick="window.__depFirst()">Isolate first-degree</button></div>`;
 const related=[];for(const e of state.edges.values()){if(e.source===n.id)related.push({id:e.target,rel:`${e.relation} →`});else if(e.target===n.id)related.push({id:e.source,rel:`← ${e.relation}`})}c.innerHTML=related.length?related.map(x=>{const q=state.nodes.get(x.id);return `<button data-jump="${esc(x.id)}"><b>${esc(x.rel)}</b> ${esc(q?.title||x.id)}</button>`}).join(''):'<div class="meta">No connected nodes.</div>';$$('[data-jump]').forEach(b=>b.onclick=()=>selectNode(b.dataset.jump));}
window.__depFirst=isolateFirstDegree;window.__depFocus=focusSelection;window.__depBranch=()=>setGraphView('branch');
function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
function exportJSON(){download('arcgis-dependency-graph.json',JSON.stringify({portal:portal(),nodes:[...state.nodes.values()].map(({x,y,...n})=>n),edges:[...state.edges.values()]},null,2),'application/json')}
function exportCSV(){const cols=['id','kind','title','type','itemId','layerId','modified','url','owner'];const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';download('arcgis-dependency-nodes.csv',[cols.join(','),...[...state.nodes.values()].map(n=>cols.map(k=>q(n[k])).join(','))].join('\n'),'text/csv')}
const ui={view:'connect',searchScope:'accessible',searchTypes:new Set(),searchHistory:[1],searchSignature:'',searchController:null,visibility:{graph:{system:false,metadata:false},content:{system:false,metadata:false}},levelLimit:1,manualExpand:new Map(),filterReveal:true,fullscreen:false,selectedFeature:null,busy:false,demo:false,searchStart:1,searchNext:-1,scanPortal:'',xmlRun:0,xml:null,map:null,mapReady:false,mapInit:null,basemap:'aerial',metroKey:'',metroLayer:'Australia_latest',geo:{type:'FeatureCollection',features:[]},featureNode:null,featureIds:null,featureOffset:0,featureTotal:0,featureRun:0,popup:null};
function status(message){const el=$('#globalStatus');el.textContent=message;el.hidden=false;clearTimeout(ui.statusTimer);ui.statusTimer=setTimeout(()=>{el.hidden=true},6500)}
function setBusy(busy){ui.busy=busy;for(const id of ['scanBtn','demoBtn','welcomeDemo','clearBtn','importBtn','portalSearchBtn'])$('#'+id).disabled=busy;$('#scanBtn').textContent=busy?'Scanning…':'Load / Scan dependencies';updateConnectControls()}
function textOnly(v){const d=document.createElement('template');d.innerHTML=String(v??'');return (d.content.textContent||'').trim()}
function display(v){if(v===null||v===undefined||v==='')return '—';return typeof v==='object'?JSON.stringify(v):String(v)}
function yesNo(v){return typeof v==='boolean'?(v?'Yes':'No'):'—'}
function miniDate(v){if(!v)return '—';const date=new Date(v);return isNaN(date)?'—':date.toLocaleDateString('en-AU',{day:'2-digit',month:'short',year:'numeric'})}
function oidField(n){return n?.meta?.objectIdField||n?.meta?.objectIdFieldName||n?.meta?.fields?.find(f=>f.type==='esriFieldTypeOID')?.name||''}
function labelKind(n){return ({experience:'Experience',webmap:'Web map',webscene:'Web scene',service:'Service',layer:'Layer',table:'Table',field:'Field'})[n.kind]||n.type||'Other'}
function adjacency(){const map=new Map();for(const e of state.edges.values()){if(!state.nodes.has(e.source)||!state.nodes.has(e.target))continue;if(!map.has(e.source))map.set(e.source,[]);if(!map.get(e.source).includes(e.target))map.get(e.source).push(e.target)}return map}
function syncSelection(){const id=state.selected||'',options='<option value="">Select a resource</option>'+[...state.nodes.values()].sort((a,b)=>a.title.localeCompare(b.title)).map(n=>`<option value="${esc(n.id)}">${esc(labelKind(n)+' · '+n.title+(n.layerId!==undefined?' / '+n.layerId:''))}</option>`).join('');for(const select of $$('[data-selection]')){select.innerHTML=options;select.value=id}$('#workspaceMode').textContent=ui.demo?'Demo data':'Live workspace'}
function refreshIntegrated(){syncSelection();renderContent();renderSchema();renderMetadata();const kinds=['experience','webmap','service','layer','table'];$('#statsBar').innerHTML=kinds.map(k=>`<span class="stat"><i class="stat-dot" aria-hidden="true" style="background:${KIND_COLORS[k]}"></i><b>${[...state.nodes.values()].filter(n=>n.kind===k).length}</b><span>${({experience:'Experiences',webmap:'Web maps',service:'Services',layer:'Layers',table:'Tables'})[k]}</span>`).join('')+`<span class="stat"><i class="stat-dot" aria-hidden="true" style="background:var(--graph-webscene)"></i><b>${[...state.nodes.values()].reduce((s,n)=>s+(n.meta?.fields?.length||0),0)}</b><span>Fields</span></span>`}
function switchView(view){if(!['connect','content','dependencies','schema','metadata','spatial'].includes(view))return;if(ui.fullscreen&&!['dependencies','spatial'].includes(view))setPanelFullscreen(false);ui.view=view;$$('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});$$('.view').forEach(v=>v.classList.toggle('active',v.id==='view-'+view));if(view==='dependencies')requestAnimationFrame(fitGraph);if(view==='spatial')initMap().then(()=>{ui.map?.resize()}).catch(e=>{$('#mapNotice').textContent=e.message});if(view==='schema')renderSchema();if(view==='metadata')renderMetadata()}
function compareNodes(a,b){if($('#contentSort').value==='modified')return (b.modified||0)-(a.modified||0)||a.title.localeCompare(b.title);return a.title.localeCompare(b.title)}
function renderContent(){renderExpansionControl();const body=$('#contentBody'),q=$('#contentSearch').value.trim().toLowerCase(),kind=$('#contentType').value,allowed=new Set([...state.nodes.values()].filter(n=>resourceVisible(n,{surface:'content'})).map(n=>n.id)),children=new Map([...adjacency()].filter(([id])=>allowed.has(id)).map(([id,ids])=>[id,ids.filter(child=>allowed.has(child))])),incoming=new Set([...state.edges.values()].filter(e=>allowed.has(e.source)&&allowed.has(e.target)).map(e=>e.target));const emitted=new Set(),covered=new Set(),rows=[];let visible=0;function cover(id){if(covered.has(id))return;covered.add(id);for(const child of children.get(id)||[])cover(child)}
 const matches=n=>(!kind||n.kind===kind)&&(!q||[n.title,n.owner,n.itemId,n.url,...(n.meta?.fields||[]).flatMap(f=>[f.name,f.alias])].some(x=>String(x||'').toLowerCase().includes(q)));
 function subtreeMatch(id,seen=new Set()){if(seen.has(id))return false;seen.add(id);const n=state.nodes.get(id);return !!n&&allowed.has(id)&&(matches(n)||(children.get(id)||[]).some(child=>subtreeMatch(child,seen)))}
 function visit(id,depth,path,ancestors){if(ancestors.has(id))return;const n=state.nodes.get(id);if(!n||!allowed.has(id)||((q||kind)&&!subtreeMatch(id)))return;emitted.add(id);const descendants=(children.get(id)||[]).map(x=>state.nodes.get(x)).filter(Boolean).sort(compareNodes),fields=n.meta?.fields||[],has=descendants.length||fields.length,open=(ui.manualExpand.has(path)?ui.manualExpand.get(path):depth+1<ui.levelLimit)||(ui.filterReveal&&(!!q||!!kind)),level=Math.min(depth,4),next=new Set([...ancestors,id]);visible++;
 rows.push(`<tr class="level-${level} ${state.selected===id?'selected':''}" data-node="${esc(id)}"><td><div class="resource-cell"><span class="indent" style="width:${Math.min(depth,8)*18}px"></span>${has?`<button class="expander" data-expand="${esc(id)}" data-expand-path="${esc(path)}" aria-expanded="${!!open}" aria-label="${open?'Collapse':'Expand'} ${esc(n.title)}">${open?'−':'+'}</button>`:'<span class="leaf">·</span>'}<div><span class="resource-name">${esc(n.title)}</span><span class="resource-sub">${esc(n.error?'Unavailable: '+n.error:n.meta?.geometryType?.replace('esriGeometry','')||n.itemId||n.url?.split('/').slice(-2).join('/')||n.type||'')}</span></div></div></td><td><span class="badge kind-${n.kind}">${esc(labelKind(n))}</span></td><td>${esc(n.owner||'—')}</td><td>${esc(miniDate(n.modified))}</td><td>${esc(n.meta?.access||'—')}</td><td>${descendants.length}${fields.length?` + ${fields.length} fields`:''}</td><td><div class="row-actions"><button data-explore="metadata" data-id="${esc(id)}">Metadata</button>${fields.length?`<button data-explore="schema" data-id="${esc(id)}">Schema</button>`:''}${n.meta?.geometryType?`<button data-explore="spatial" data-id="${esc(id)}">Map</button>`:''}</div></td></tr>`);
 if(open){descendants.forEach(c=>visit(c.id,depth+1,path+'/'+c.id,next));for(const f of fields){if(q&&![f.name,f.alias,n.title].some(x=>String(x||'').toLowerCase().includes(q)))continue;rows.push(`<tr class="field-row" data-field-owner="${esc(id)}"><td><div class="resource-cell"><span class="indent" style="width:${Math.min(depth+1,8)*18}px"></span><span class="leaf">↳</span><div><span class="resource-name">${esc(f.name)}</span><span class="resource-sub">${esc(f.alias||'')}</span></div></div></td><td>${fieldTypePill(f.type)}</td><td colspan="4" class="muted">Nullable: ${yesNo(f.nullable)} · Domain: ${esc(f.domain?.name||'—')}</td><td><button data-explore="schema" data-id="${esc(id)}">Schema</button></td></tr>`)}}
 }
 const roots=[...state.nodes.values()].filter(n=>allowed.has(n.id)&&!incoming.has(n.id)).sort(compareNodes);roots.forEach(n=>{visit(n.id,0,n.id,new Set());cover(n.id)});
 // Cyclic components without a root still appear once as an entry tree.
 for(const n of [...state.nodes.values()].filter(n=>allowed.has(n.id)).sort(compareNodes))if(!covered.has(n.id)){visit(n.id,0,n.id,new Set());cover(n.id)};
 body.innerHTML=rows.join('');$('#welcome').hidden=state.nodes.size>0;if(state.nodes.size&&!rows.length)body.innerHTML='<tr><td colspan="7" class="msg-row">No resources match your filters.</td></tr>';$('#contentCount').textContent=`${allowed.size} of ${state.nodes.size} resources`;
 $('#contentFooter').textContent=`${visible} resource rows · ${state.edges.size} relationships · ${ui.demo?'Demo workspace':$('#portalInput').value}`;
}
function fieldTypePill(type){const label=String(type||'Unknown').replace(/^esriFieldType/,''),kind=/^(OID|GlobalID|GUID)$/.test(label)?'identifier':/^(SmallInteger|Integer|BigInteger|Single|Double)$/.test(label)?'numeric':/Date|Time/.test(label)?'date':/^(Geometry)$/.test(label)?'geometry':/^(String|XML)$/.test(label)?'text':'other';return `<span class="datatype-pill type-${kind}">${esc(label)}</span>`}
function schemaNodes(){const n=state.nodes.get(state.selected);if(!n)return [];if(n.meta?.fields)return [n];const ids=descendants(n.id);return [...state.nodes.values()].filter(x=>ids.has(x.id)&&x.meta?.fields?.length)}
function schemaFields(){return schemaNodes().flatMap(n=>(n.meta?.fields||[]).map(f=>({...f,_resource:n.title,_node:n})))}
function renderSchema(){const nodes=schemaNodes(),q=$('#fieldSearch').value.trim().toLowerCase(),all=schemaFields(),fields=all.filter(f=>[f.name,f.alias,f.type,f._resource].some(x=>String(x||'').toLowerCase().includes(q)));$('#schemaSummary').textContent=`${all.length} fields · ${nodes.length} layers / tables`;$('#schemaInfo').textContent=nodes.length===1?`${nodes[0].title} · ${nodes[0].meta.geometryType||'Non-spatial table'} · Object ID: ${oidField(nodes[0])||'—'} · WKID: ${nodes[0].meta.extent?.spatialReference?.latestWkid||nodes[0].meta.extent?.spatialReference?.wkid||'—'}`:nodes.length?'Fields from the selected resource and its descendants.':'Choose a layer, table or parent resource to inspect its schema.';
 $('#schemaBody').innerHTML=fields.map(f=>{const indexes=(f._node.meta.indexes||[]).filter(i=>(i.fields||'').split(',').map(x=>x.trim().toLowerCase()).includes(f.name.toLowerCase()));return `<tr><td><b>${esc(f.name)}</b>${nodes.length>1?`<span class="resource-sub">${esc(f._resource)}</span>`:''}</td><td>${esc(f.alias||'—')}</td><td>${fieldTypePill(f.type)}</td><td>${esc(f.length??'—')}</td><td>${yesNo(f.nullable)}</td><td>${yesNo(f.editable)}</td><td>${esc(display(f.defaultValue))}</td><td>${domainHTML(f.domain)}</td><td>${esc(indexes.map(i=>i.name+(i.isUnique?' (unique)':'')).join(', ')||'—')}</td></tr>`}).join('')||'<tr><td colspan="9" class="msg-row">No fields available for this selection.</td></tr>';
 $('#schemaExtra').innerHTML=nodes.map(n=>{const m=n.meta;return `<details><summary>${esc(n.title)} · Subtypes, relationships & capabilities</summary><pre class="raw-json">${esc(JSON.stringify({typeIdField:m.typeIdField,subtypes:m.types,relationships:m.relationships,capabilities:m.capabilities,advancedQueryCapabilities:m.advancedQueryCapabilities},null,2))}</pre></details>`}).join('');$('#schemaFooter').textContent=fields.length+' fields displayed · Schema is read-only.';
}
function domainHTML(d){if(!d)return '—';return `<details><summary>${esc(d.name||d.type||'Domain')}</summary>${d.codedValues?.map(v=>`<div>${esc(display(v.code))} · ${esc(v.name)}</div>`).join('')||esc(d.range?d.range.join(' – '):JSON.stringify(d))}</details>`}
function kvHTML(entries){return '<div class="kv">'+entries.filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>`<b>${esc(k)}</b><span>${esc(display(v))}</span>`).join('')+'</div>'}
function renderMetadata(){const n=state.nodes.get(state.selected);$('#metadataTitle').textContent=n?labelKind(n)+' / '+n.title:'Select any resource';$('#xmlBtn').disabled=!n||ui.demo||!(n.itemId||n.url);$('#metaJsonBtn').disabled=!n;if(!n){$('#metadataBody').innerHTML='<p class="note">Select an ArcGIS item, service, layer or table to view its metadata.</p>';resetXML();return}const m=n.meta||{};
 $('#metadataBody').innerHTML=kvHTML([['Title',n.title],['Resource type',n.type||labelKind(n)],['Item ID',n.itemId],['Layer ID',n.layerId],['Owner',n.owner||m.owner],['Created',m.created?new Date(m.created).toLocaleString('en-AU'):null],['Modified',formatModifiedDate(n)],['Access',m.access],['Summary',textOnly(m.snippet)],['Description',textOnly(m.description||m.serviceDescription)],['Credits',textOnly(m.accessInformation||m.copyrightText)],['Use constraints',textOnly(m.licenseInfo)],['Tags',m.tags?.join(', ')],['Categories',m.categories?.join(', ')],['Size (bytes)',m.size],['Geometry',m.geometryType],['Spatial reference',m.extent?.spatialReference||m.spatialReference],['Extent',m.extent||m.fullExtent],['Capabilities',m.capabilities],['URL',n.url],['Error',n.error]])+`<details><summary>All published resource properties</summary><pre class="raw-json">${esc(JSON.stringify(m,null,2))}</pre></details>`;
 if(ui.xml?.node!==n.id)resetXML();
}
function resetXML(){ui.xmlRun++;ui.xml=null;$('#xmlStatus').textContent='Load the published XML metadata for the selected resource.';$('#xmlBody').innerHTML=''}
function metadataURLs(n){if(n.itemId)return [`${n.portal||portal()}/sharing/rest/content/items/${n.itemId}/info/metadata/metadata.xml`];if(!safeURL(n.url))return [];const base=n.url.replace(/\/$/,'');return /\/(FeatureServer|MapServer)\/\d+$/i.test(base)?[base+'/metadata',base+'/info/metadata']:[base+'/info/metadata']}
async function loadXML(){const n=state.nodes.get(state.selected);if(!n||ui.demo)return;const run=++ui.xmlRun;$('#xmlStatus').textContent='Loading published metadata…';$('#xmlBody').innerHTML='';if(n.meta?.hasMetadata===false&&!n.itemId){$('#xmlStatus').textContent='This resource reports that formal metadata has not been published.';return}const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),30000);let lastError='No metadata endpoint is available';
 try{let xml,raw;for(const url of metadataURLs(n)){try{const p=new URLSearchParams();if(state.token&&authorizedHost(url))p.set('token',state.token);const r=await fetch(url+(p.toString()?'?'+p:''),{cache:'no-store',signal:ctl.signal});if(!r.ok)throw new Error('HTTP '+r.status);raw=await r.text();xml=new DOMParser().parseFromString(raw,'application/xml');if(xml.querySelector('parsererror')||!['metadata','MD_Metadata','MI_Metadata'].includes(xml.documentElement.localName))throw new Error('No supported XML metadata document was returned');break}catch(e){xml=null;lastError=e.message;if(ctl.signal.aborted)break}}if(!xml)throw new Error(lastError);if(run!==ui.xmlRun||state.selected!==n.id)return;ui.xml={node:n.id,raw};const leaf=[...xml.querySelectorAll('*')].filter(e=>!e.children.length&&e.textContent.trim());$('#xmlStatus').textContent=`Published metadata · ${leaf.length} populated values`;$('#xmlBody').innerHTML=leaf.map(e=>{const path=[];let cur=e;while(cur&&cur!==xml.documentElement&&path.length<5){path.unshift(cur.localName);cur=cur.parentElement}return `<div class="xml-row"><b>${esc(path.join(' / '))}</b><span>${esc(e.textContent.trim())}</span></div>`}).join('')+`<details><summary>Raw XML</summary><pre class="raw-json">${esc(raw)}</pre></details>`}catch(e){if(run===ui.xmlRun)$('#xmlStatus').textContent='Published metadata unavailable: '+e.message+'. It may be unpublished, restricted, or blocked by CORS.'}finally{clearTimeout(timer)}
}
const PORTAL_ITEM_TYPES={experience:['Web Experience'],webmap:['Web Map'],webscene:['Web Scene'],dashboard:['Dashboard'],feature:['Feature Service'],image:['Image Service'],scene:['Scene Service']};
const searchQuote=value=>'"'+String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
function currentIdentity(){try{return state.identity?.portal===portal()?state.identity:null}catch{return null}}
function updateConnectControls(){
 const identity=currentIdentity();
 if((ui.searchScope==='my'&&!identity?.username)||(ui.searchScope==='org'&&!identity?.orgId))ui.searchScope='accessible';
 for(const button of $$('[data-search-scope]')){const scope=button.dataset.searchScope;button.disabled=ui.busy||(scope==='my'&&!identity?.username)||(scope==='org'&&!identity?.orgId);button.setAttribute('aria-pressed',String(scope===ui.searchScope));button.dataset.tooltip=scope==='my'&&!identity?.username?'Verify a token to search items owned by your account':scope==='org'&&!identity?.orgId?'A verified organisation account is required':''}
 for(const button of $$('[data-search-type]')){button.disabled=ui.busy;button.setAttribute('aria-pressed',String(button.dataset.searchType==='all'?ui.searchTypes.size===0:ui.searchTypes.has(button.dataset.searchType)))}
 $('#searchIdentity').textContent=identity?`${identity.username}${identity.orgId?' · organisation '+identity.orgId:''} · ${ui.searchScope==='my'?'items you own':ui.searchScope==='org'?'items in your organisation':'all content accessible to this account'}`:'Public search · sign in to search your content or organisation.';
}
function invalidatePortalSearch(clear=true){
 ++searchEpoch;ui.searchController?.abort();ui.searchController=null;ui.searchHistory=[1];ui.searchStart=1;ui.searchNext=-1;ui.searchSignature='';
 $('#searchPrev').disabled=true;$('#searchNext').disabled=true;$('#portalResults').setAttribute('aria-busy','false');$('#searchLimitNotice').hidden=true;
 if(clear){$('#portalResults').innerHTML='<p class="connect-empty">Search the selected portal to find content.</p>';$('#searchPage').textContent='Choose a scope and item types, then search.'}
}
function portalSearchContext(){
 const endpoint=sharing(),identity=currentIdentity(),scope=ui.searchScope,terms=[];
 if(scope==='my'){if(!identity?.username)throw Error('Verify a token before searching My content');terms.push('owner:'+searchQuote(identity.username))}
 else if(scope==='org'){if(!identity?.orgId)throw Error('The verified account has no organisation identity');terms.push('orgid:'+searchQuote(identity.orgId))}
 const query=$('#portalSearch').value.trim();if(query)terms.push('('+query+')');
 const typeTerms=[];
 for(const type of ui.searchTypes){
   if(type==='other'){const known=Object.values(PORTAL_ITEM_TYPES).flat().map(value=>'type:'+searchQuote(value));typeTerms.push('(NOT ('+known.join(' OR ')+'))')}
   else for(const value of PORTAL_ITEM_TYPES[type]||[])typeTerms.push('type:'+searchQuote(value));
 }
 if(typeTerms.length)terms.push('('+typeTerms.join(' OR ')+')');
 return {endpoint,q:terms.join(' AND ')||'*',auth:authEpoch,signature:JSON.stringify([endpoint,query,scope,[...ui.searchTypes].sort(),authEpoch,identity?.username||'',identity?.orgId||''])};
}
async function portalSearch(start=1,direction='reset'){
 if(ui.busy)return;
 let context;try{context=portalSearchContext()}catch(error){$('#searchPage').textContent=error.message;return}
 if(!Number.isInteger(start)||start<1||start>10000)return;
 if(direction==='reset'||context.signature!==ui.searchSignature){start=1;ui.searchHistory=[1]}
 const run=++searchEpoch;ui.searchController?.abort();const controller=ui.searchController=new AbortController();
 const current=()=>{try{return run===searchEpoch&&portalSearchContext().signature===context.signature}catch{return false}};
 $('#portalResults').setAttribute('aria-busy','true');$('#searchPage').textContent='Searching portal…';$('#searchPrev').disabled=true;$('#searchNext').disabled=true;
 try{
  const j=await restJSON(`${context.endpoint}/search`,{q:context.q,start,num:Math.min(30,10001-start),sortField:'modified',sortOrder:'desc'},{signal:controller.signal});
  if(!current())return;
  const items=Array.isArray(j.results)?j.results.slice(0,Math.min(30,10001-start)):[],total=Number(j.total)||0,next=Number(j.nextStart);
  if(direction==='next'&&ui.searchHistory.at(-1)!==start)ui.searchHistory.push(start);
  if(direction==='prev'&&ui.searchHistory.length>1)ui.searchHistory.pop();
  ui.searchSignature=context.signature;ui.searchStart=start;ui.searchNext=Number.isInteger(next)&&next>start&&next<=10000?next:-1;
  $('#searchPrev').disabled=ui.searchHistory.length<2;$('#searchNext').disabled=ui.searchNext<0;
  $('#searchPage').textContent=`${total.toLocaleString()} matches · ${items.length?start:0}–${items.length?start+items.length-1:0}${total>10000?' · first 10,000 searchable':''}`;
  $('#searchLimitNotice').hidden=!(total>10000||next>10000);
  $('#portalResults').innerHTML=items.map(item=>`<div role="listitem"><button type="button" class="connect-result" data-search-item="${esc(item.id)}" aria-label="Load ${esc(item.title||'Untitled item')}"><span class="connect-result-name">${esc(item.title||'Untitled item')}</span><span class="connect-result-meta"><span>${esc(item.type||'Item')}</span><span>${esc(item.owner||'Unknown owner')}</span><span>${esc(miniDate(item.modified))}</span><span>${esc(item.access||'')}</span></span>${item.snippet?`<span class="connect-result-description">${esc(textOnly(item.snippet).slice(0,260))}</span>`:''}</button></div>`).join('')||'<p class="connect-empty">No matching items. Try another scope, type or search term.</p>';
 }catch(error){if(current()&&error.name!=='AbortError'){$('#portalResults').innerHTML='<p class="connect-empty">Search unavailable. Check the portal, account access and network connection.</p>';$('#searchPage').textContent='Search failed: '+error.message;$('#searchPrev').disabled=ui.searchHistory.length<2}}
 finally{if(run===searchEpoch){ui.searchController=null;$('#portalResults').setAttribute('aria-busy','false')}}
}
function portalPrevious(){if(ui.searchHistory.length>1)return portalSearch(ui.searchHistory.at(-2),'prev')}
function portalNext(){if(ui.searchNext>0)return portalSearch(ui.searchNext,'next')}
async function loadPortalResult(id){if(ui.busy||!/^[a-f0-9]{32}$/i.test(id))return;$('#itemInput').value=id;return buildGraph()}

function exportWorkspace(){const scrub=(value)=>{if(typeof value==='string')return value.replace(/([?&#](?:token|access_?token|refresh_?token|api_?key|key|client_?secret)=)[^&#\s]+/gi,'$1[removed]');if(Array.isArray(value))return value.map(scrub);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!/^(token|access_?token|refresh_?token|api_?key|client_?secret|password|authorization|credential)$/i.test(k)).map(([k,v])=>[k,scrub(v)]));return value};download('ArcGIS_Explorer_Workspace.json',JSON.stringify(scrub({format:'arcgis-explorer',version:2,portal:portal(),demo:ui.demo,nodes:[...state.nodes.values()],edges:[...state.edges.values()]}),null,2),'application/json')}
async function importWorkspace(file){if(!file)return;try{if(file.size>25*1024*1024)throw new Error('Workspace must be under 25 MB');const j=JSON.parse(await file.text());if(!Array.isArray(j.nodes)||!Array.isArray(j.edges)||j.nodes.length>1200||j.edges.length>15000)throw new Error('Invalid or oversized workspace');const nodes=j.nodes.map(n=>{if(!n||typeof n.id!=='string'||typeof n.title!=='string')throw new Error('Invalid node');if(n.meta?.fields!==undefined&&(!Array.isArray(n.meta.fields)||n.meta.fields.some(f=>!f||typeof f.name!=='string')))throw new Error('Invalid field schema');if(n.meta?.indexes!==undefined&&!Array.isArray(n.meta.indexes))throw new Error('Invalid index schema');if(n.portal){const u=new URL(n.portal);if(u.protocol!=='https:')throw new Error('Resource portal must use HTTPS');}return {...n,kind:['experience','webmap','webscene','service','layer','table','other'].includes(n.kind)?n.kind:'other',url:n.url?safeURL(n.url):'',meta:n.meta&&typeof n.meta==='object'?n.meta:{}}});const ids=new Set(nodes.map(n=>n.id));if(ids.size!==nodes.length)throw new Error('Duplicate resource IDs');const edges=j.edges.filter(e=>e&&ids.has(e.source)&&ids.has(e.target)).map(e=>({source:e.source,target:e.target,relation:String(e.relation||'uses')}));let importedPortal='https://www.arcgis.com';if(j.portal){const u=new URL(j.portal);if(u.protocol!=='https:')throw new Error('Workspace portal must use HTTPS');importedPortal=u.href.replace(/\/$/,'')}resetGraph();clearToken();$('#portalInput').value=importedPortal;nodes.forEach(addNode);edges.forEach(e=>addEdge(e.source,e.target,e.relation));ui.demo=!!j.demo;layoutGraph();render();refreshIntegrated();status('Imported '+nodes.length+' resources. Sign in again if private content is needed.');switchView('content')}catch(e){status('Import failed: '+e.message)}finally{$('#importFile').value=''}}
function initIntegrated(){
 $$('[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));$('#connectBtn').onclick=$('#welcomeLoad').onclick=()=>switchView('connect');$$('[data-close]').forEach(b=>b.onclick=()=>$('#'+b.dataset.close).close());$('#themeBtn').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark'};
 $$('[data-selection]').forEach(select=>select.onchange=e=>{if(e.target.value)selectNode(e.target.value);else{state.selected=null;graphAppearance.clicked=null;syncSelection();render();renderDetails();renderContent();renderSchema();renderMetadata()}});
 $('#contentSearch').oninput=$('#contentType').onchange=()=>{ui.filterReveal=true;renderContent()};$('#contentSort').onchange=renderContent;$('#levelSlider').onclick=e=>{const pill=e.target.closest('[data-level]');if(pill)applyExpansionLevel(Number(pill.dataset.level))};$('#levelSlider').onkeydown=e=>{const values={ArrowRight:ui.levelLimit+1,ArrowUp:ui.levelLimit+1,ArrowLeft:ui.levelLimit-1,ArrowDown:ui.levelLimit-1,Home:1,End:hierarchyMaxLevel()};if(e.key in values){e.preventDefault();applyExpansionLevel(values[e.key])}};$('#contentBody').onclick=e=>{const expand=e.target.closest('[data-expand]');if(expand){const path=expand.dataset.expandPath;ui.manualExpand.set(path,expand.getAttribute('aria-expanded')!=='true');ui.filterReveal=false;renderContent();return}const explore=e.target.closest('[data-explore]');if(explore){selectNode(explore.dataset.id);switchView(explore.dataset.explore);return}const tr=e.target.closest('[data-node],[data-field-owner]');if(tr)selectNode(tr.dataset.node||tr.dataset.fieldOwner)};
 $('#fieldSearch').oninput=renderSchema;$('#xmlBtn').onclick=loadXML;$('#metaJsonBtn').onclick=()=>{const n=state.nodes.get(state.selected);if(n)download('ArcGIS_Resource.json',JSON.stringify(n.meta||{},null,2),'application/json')};$('#schemaCsvBtn').onclick=()=>{const cols=['_resource','name','alias','type','length','nullable','editable','defaultValue','domain'];const q=v=>'"'+display(v).replace(/"/g,'""')+'"';download('ArcGIS_Fields.csv',[cols.map(q).join(','),...schemaFields().map(f=>cols.map(k=>q(f[k])).join(','))].join('\r\n'),'text/csv')};
 $('#portalSearchBtn').onclick=null;$('#portalSearchForm').onsubmit=e=>{e.preventDefault();portalSearch()};$('#portalSearch').oninput=()=>invalidatePortalSearch();$('#searchPrev').onclick=portalPrevious;$('#searchNext').onclick=portalNext;$('#portalResults').onclick=e=>{const b=e.target.closest('[data-search-item]');if(b)loadPortalResult(b.dataset.searchItem)};
 $$('[data-search-scope]').forEach(button=>button.onclick=()=>{if(button.disabled)return;ui.searchScope=button.dataset.searchScope;invalidatePortalSearch();updateConnectControls();portalSearch()});
 $$('[data-search-type]').forEach(button=>button.onclick=()=>{if(button.disabled)return;const type=button.dataset.searchType;if(type==='all')ui.searchTypes.clear();else if(ui.searchTypes.has(type))ui.searchTypes.delete(type);else ui.searchTypes.add(type);invalidatePortalSearch();updateConnectControls();portalSearch()});
$$('[data-resource-visibility]').forEach(control=>{control.checked=ui.visibility[control.dataset.surface][control.dataset.role];control.onchange=()=>{ui.visibility[control.dataset.surface][control.dataset.role]=control.checked;if(control.dataset.surface==='graph'){render();maybeFitGraph()}else renderContent()}});
 $('#jsonBtn').onclick=exportWorkspace;$('#importBtn').onclick=()=>$('#importFile').click();$('#importFile').onchange=e=>importWorkspace(e.target.files[0]);$('#demoBtn').onclick=$('#welcomeDemo').onclick=loadDemo;
 $('#clearBtn').onclick=()=>{resetGraph();status('Workspace cleared. Imported/exported files are unchanged.')};$('#loadFeaturesBtn').onclick=()=>loadFeatures(true);$('#prevPage').onclick=()=>featurePage(-1);$('#nextPage').onclick=()=>featurePage(1);$('#pageSize').onchange=()=>{if(ui.featureNode){ui.featureOffset=0;loadFeatures(false)}};$('#fitFeaturesBtn').onclick=fitFeatures;$('#zoomSelectedBtn').onclick=zoomSelectedFeature;$('#featureInspector').onclick=handleFeatureInspectorClick;$('#geoJsonBtn').onclick=()=>{if(ui.geo.features.length)download('ArcGIS_Feature_Page.geojson',JSON.stringify(ui.geo,null,2),'application/geo+json')};$('#toggleAttributesBtn').onclick=()=>{const panel=$('#featureInspector');panel.hidden=!panel.hidden;$('#toggleAttributesBtn').setAttribute('aria-expanded',String(!panel.hidden))};$$('[data-basemap]').forEach(b=>b.onclick=()=>{if(b.dataset.basemap==='metro')openMetro();else setBasemap(b.dataset.basemap)});$('#metroApply').onclick=applyMetro;$('#metroRemove').onclick=removeMetro;
$('#graphLegend').innerHTML=Object.entries(KIND_COLORS).map(([k,color])=>`<span class="legend-item"><span class="legend-symbol" style="background:${color}"></span>${esc(({experience:'Experience',webmap:'Web map',webscene:'Web scene',service:'Service',layer:'Layer',table:'Table',other:'Other'})[k])}</span>`).join('')+Object.entries(ROLE_COLORS).map(([k,color])=>`<span class="legend-item"><span class="legend-symbol" style="background:${color}"></span>${esc(k[0].toUpperCase()+k.slice(1))}</span>`).join('');
 initDataMenu();initPanelFullscreen();initPalette();
 $('#portalInput').onchange=()=>{clearToken();status('Portal changed. Existing resources remain; sign in to the new portal if needed.')};updateConnectControls();refreshIntegrated();
}

function initDataMenu(){const menu=$('#dataMenu');const close=()=>{menu.open=false};for(const id of ['connectBtn','demoBtn','jsonBtn','importBtn','themeBtn']){const button=$('#'+id),handler=button.onclick;button.onclick=e=>{close();handler?.(e)}}document.addEventListener('pointerdown',e=>{if(menu.open&&!menu.contains(e.target))close()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.open){close();menu.querySelector('summary')?.focus()}})}

function hierarchyMaxLevel(){const children=adjacency(),incoming=new Set([...state.edges.values()].map(e=>e.target)),covered=new Set();let maximum=1;function visit(id,level,path){if(path.has(id))return;const n=state.nodes.get(id);if(!n)return;covered.add(id);maximum=Math.max(maximum,level+(n.meta?.fields?.length?1:0));const next=new Set([...path,id]);for(const child of children.get(id)||[])visit(child,level+1,next)}for(const n of state.nodes.values())if(!incoming.has(n.id))visit(n.id,1,new Set());for(const n of state.nodes.values())if(!covered.has(n.id))visit(n.id,1,new Set());return maximum}
function renderExpansionControl(){const maximum=hierarchyMaxLevel();ui.levelLimit=Math.min(maximum,Math.max(1,ui.levelLimit));const mixed=ui.manualExpand.size>0||(ui.filterReveal&&($('#contentSearch').value.trim()||$('#contentType').value));$('#levelSlider').innerHTML=Array.from({length:maximum},(_,i)=>`<button type="button" data-level="${i+1}" class="level-pill ${!mixed&&ui.levelLimit===i+1?'active':''}" aria-pressed="${!!(!mixed&&ui.levelLimit===i+1)}" title="${i===0?'Show top-level resources only':'Expand every branch to level '+(i+1)}">${i+1}</button>`).join('');$('#levelSlider').title=mixed?'Branches are manually expanded or search results are revealed. Choose a level to reset all branches.':'Show hierarchy through level '+ui.levelLimit}
function applyExpansionLevel(level){ui.levelLimit=Math.min(hierarchyMaxLevel(),Math.max(1,level));ui.manualExpand.clear();ui.filterReveal=false;renderContent();const active=$('#levelSlider').querySelector('[data-level="'+ui.levelLimit+'"]');active?.focus({preventScroll:true})}
function setPanelFullscreen(enabled){ui.fullscreen=!!enabled;$('#appShell').classList.toggle('panel-fullscreen',ui.fullscreen);for(const button of $$('[data-panel-fullscreen]')){button.setAttribute('aria-pressed',String(ui.fullscreen));button.textContent=ui.fullscreen?'↙ Exit full screen':'⛶ Full screen';button.title=ui.fullscreen?'Restore main header (Esc)':'Hide main header and expand panel'}requestAnimationFrame(()=>{if(ui.mapReady)ui.map.resize();if(ui.view==='dependencies')maybeFitGraph()})}
function initPanelFullscreen(){$$('[data-panel-fullscreen]').forEach(button=>button.onclick=()=>setPanelFullscreen(!ui.fullscreen));document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ui.fullscreen)setPanelFullscreen(false)})}

function emptyGeo(){return {type:'FeatureCollection',features:[]}}
function clearSpatial(){clearFeatureSelection();ui.featureRun++;$('#loadFeaturesBtn').disabled=false;ui.geo=emptyGeo();ui.featureNode=null;ui.featureIds=null;ui.featureOffset=0;ui.featureTotal=0;ui.popup?.remove();if(ui.mapReady&&ui.map.getSource('features'))ui.map.getSource('features').setData(ui.geo);$('#spatialStatus').textContent='Select a queryable layer, then Load selected layer.';$('#pageLabel').textContent='No features loaded';$('#prevPage').disabled=$('#nextPage').disabled=true;$('#featureInspector').innerHTML='<h2>Feature attributes</h2><p class="note">Load a layer and click a feature on the map.</p>'}
async function initMap(){if(ui.mapReady)return ui.map;if(ui.mapInit)return ui.mapInit;ui.mapInit=new Promise((resolve,reject)=>{try{if(!window.maplibregl)throw new Error('MapLibre could not load. Reopen the complete HTML file.');const map=ui.map=new maplibregl.Map({container:'map',style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#dee5e0'}}]},center:[138.6007,-34.9285],zoom:13,attributionControl:true});map.addControl(new maplibregl.NavigationControl(),'bottom-left');map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');map.on('load',()=>{ui.mapReady=true;map.addSource('features',{type:'geojson',data:ui.geo});map.addLayer({id:'feature-fill',type:'fill',source:'features',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#16b7a4','fill-opacity':.28}});map.addLayer({id:'feature-line',type:'line',source:'features',filter:['in',['geometry-type'],['literal',['Polygon','LineString']]],paint:{'line-color':'#087e87','line-width':3}});map.addLayer({id:'feature-point',type:'circle',source:'features',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':'#ffd164','circle-radius':6,'circle-stroke-color':'#174d5b','circle-stroke-width':2}});installFeatureSelectionLayers(map);installBasemap(ui.basemap,false);$('#mapNotice').textContent='Esri World Aerial · Load a layer to view spatial features.';resolve(map)});
 map.on('click',e=>{if(!ui.mapReady)return;const hits=map.queryRenderedFeatures(e.point,{layers:['feature-fill','feature-line','feature-point']});if(!hits.length)return;const f=hits[0];showFeature(f);ui.popup?.remove();const div=document.createElement('div');div.className='feature-popup';const label=document.createElement('strong');label.textContent=String(ui.selectedFeature?.properties?.[ui.featureNode?.meta?.displayField]||'Selected feature');div.appendChild(label);const zoom=document.createElement('button');zoom.textContent='Zoom to selected feature';zoom.onclick=zoomSelectedFeature;div.appendChild(zoom);ui.popup=new maplibregl.Popup().setLngLat(e.lngLat).setDOMContent(div).addTo(map)});
 map.on('error',e=>{if(!ui.mapReady){$('#mapNotice').textContent='Map initialization failed. Check browser WebGL support.';reject(new Error('Map initialization failed.'));return}if(e.sourceId?.startsWith('base-')||/metromap|World_Imagery|World_Topo_Map/.test(e.error?.message||'')){ui.baseErrors=(ui.baseErrors||0)+1;if(ui.baseErrors>=2&&!ui.baseFallbackUsed){ui.baseFallbackUsed=true;const failed=ui.basemap,fallback=failed==='metro'?$('#fallbackBasemap').value:failed==='aerial'?'topo':'aerial';installBasemap(fallback,true);$('#mapNotice').textContent=(failed==='metro'?'MetroMap':'Esri basemap')+' unavailable. Switched to '+(fallback==='aerial'?'Esri World Aerial':'Esri Topography')+'.'}else if(ui.baseErrors>=3){$('#mapNotice').textContent='Basemap requests are failing. Check network access, coverage, CORS or API permissions.'}}});
 }catch(e){reject(e)}});try{return await ui.mapInit}catch(e){ui.mapInit=null;throw e}}
function basemapDefinition(kind){if(kind==='metro'){if(!ui.metroKey)throw new Error('Enter a MetroMap key first.');return {tiles:[`https://api.metromap.com.au/ogc/key/${encodeURIComponent(ui.metroKey)}/service?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${encodeURIComponent(ui.metroLayer)}&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`],attribution:'© MetroMap / Aerometrex',maxzoom:22}}const aerial=kind==='aerial';return {tiles:[`https://services.arcgisonline.com/ArcGIS/rest/services/${aerial?'World_Imagery':'World_Topo_Map'}/MapServer/tile/{z}/{y}/{x}`],attribution:aerial?'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community':'Tiles © Esri — Source: Esri, HERE, Garmin, Intermap, USGS, METI/NASA, NGA, EPA, NPS, and the GIS User Community',maxzoom:aerial?19:19}}
function installBasemap(kind,preserveFallback=false){const def=basemapDefinition(kind);ui.basemap=kind;ui.baseErrors=0;if(!preserveFallback)ui.baseFallbackUsed=false;const map=ui.map;for(const base of ['metro','aerial','topo']){if(map.getLayer('base-'+base))map.removeLayer('base-'+base);if(map.getSource('base-'+base))map.removeSource('base-'+base)}map.addSource('base-'+kind,{type:'raster',tileSize:256,...def});map.addLayer({id:'base-'+kind,type:'raster',source:'base-'+kind,paint:{'raster-fade-duration':100}},'feature-fill');$$('[data-basemap]').forEach(b=>b.classList.toggle('active',b.dataset.basemap===kind));$('#mapNotice').textContent=({metro:'MetroMap aerial imagery',aerial:'Esri World Aerial',topo:'Esri Topography'})[kind]+' · '+ui.geo.features.length+' features on this page'}
async function setBasemap(kind){try{await initMap();installBasemap(kind)}catch(e){$('#mapNotice').textContent=e.message}}
function openMetro(){let saved=null;try{saved=JSON.parse(localStorage.getItem('arcgis-explorer-metromap')||'null')}catch{}$('#metroKey').value=ui.metroKey||saved?.key||'';$('#metroLayer').value=ui.metroLayer||saved?.layer||'Australia_latest';if(!ui.metroKey&&saved?.layer)$('#metroLayer').value=saved.layer;$('#metroRemember').checked=!!saved?.key;$('#metroStatus').textContent=saved?.key?'A key is saved in this browser.':'Key will be used for this tab unless you choose Save.';$('#metroDialog').showModal()}
async function applyMetro(){const key=$('#metroKey').value.trim(),layer=$('#metroLayer').value.trim();if(!key||!layer){$('#metroStatus').textContent='Enter both an API key and imagery layer.';return}ui.metroKey=key;ui.metroLayer=layer;try{if($('#metroRemember').checked)localStorage.setItem('arcgis-explorer-metromap',JSON.stringify({key,layer}));else localStorage.removeItem('arcgis-explorer-metromap')}catch{$('#metroStatus').textContent='Browser storage is unavailable. The key is active in this tab only.';status('MetroMap key is active for this tab; browser storage was unavailable.')}$('#metroDialog').close();await setBasemap('metro')}
function removeMetro(){try{localStorage.removeItem('arcgis-explorer-metromap')}catch{status('Could not access browser storage.')}ui.metroKey='';$('#metroKey').value='';$('#metroRemember').checked=false;$('#metroStatus').textContent='Key removed from this tab and browser storage.';if(ui.mapReady&&ui.basemap==='metro')installBasemap($('#fallbackBasemap').value)}
function ringArea(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=r[j][0]*r[i][1]-r[i][0]*r[j][1];return a/2}
function insideRing(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
function ringsGeometry(rings){const entries=rings.filter(r=>r.length>=4).map(r=>({ring:r,area:Math.abs(ringArea(r)),parent:null,depth:0,polygon:null})).sort((a,b)=>b.area-a.area);for(let i=0;i<entries.length;i++){const r=entries[i];for(let j=i-1;j>=0;j--)if(insideRing(r.ring[0],entries[j].ring)){r.parent=entries[j];r.depth=r.parent.depth+1;break}}
 const polygons=[];for(const r of entries)if(r.depth%2===0){r.polygon=[r.ring];polygons.push(r.polygon)}else{let p=r.parent;while(p&&p.depth%2!==0)p=p.parent;p?.polygon?.push(r.ring)}return polygons.length===1?{type:'Polygon',coordinates:polygons[0]}:{type:'MultiPolygon',coordinates:polygons}}
function esriGeometry(g){if(!g)return null;if(g.x!==undefined&&g.y!==undefined)return {type:'Point',coordinates:[g.x,g.y]};if(g.points)return {type:'MultiPoint',coordinates:g.points};if(g.paths)return g.paths.length===1?{type:'LineString',coordinates:g.paths[0]}:{type:'MultiLineString',coordinates:g.paths};if(g.rings)return ringsGeometry(g.rings);if(g.xmin!==undefined)return {type:'Polygon',coordinates:[[[g.xmin,g.ymin],[g.xmax,g.ymin],[g.xmax,g.ymax],[g.xmin,g.ymax],[g.xmin,g.ymin]]]};return null}
function featureCollection(j){if(j.type==='FeatureCollection')return j;const wkid=j.spatialReference?.latestWkid||j.spatialReference?.wkid;if(wkid&&wkid!==4326)throw new Error('Service did not return requested WGS84 coordinates.');return {type:'FeatureCollection',features:(j.features||[]).map(f=>({type:'Feature',properties:f.attributes||{},geometry:esriGeometry(f.geometry)}))}}
async function queryBatch(n,ids,run){if(run!==ui.featureRun)return [];const j=await restJSON(n.url+'/query',{objectIds:ids.join(','),outFields:'*',returnGeometry:true,outSR:4326});if(j.exceededTransferLimit&&ids.length>1){const mid=Math.ceil(ids.length/2);return [...await queryBatch(n,ids.slice(0,mid),run),...await queryBatch(n,ids.slice(mid),run)]}if(j.exceededTransferLimit)throw new Error('Service transfer limit prevents retrieving this feature.');return featureCollection(j).features}
async function loadFeatures(reset=true){let n=reset?state.nodes.get(state.selected):ui.featureNode;if(!n)return $('#spatialStatus').textContent='Select a layer first.';if(!n.meta?.geometryType)return $('#spatialStatus').textContent='Choose a spatial feature layer. Services, group layers and non-spatial tables cannot be mapped directly.';if(!ui.demo&&(!n.url||!(/\/(FeatureServer|MapServer)\/\d+\/?$/i.test(n.url))))return $('#spatialStatus').textContent='This resource does not expose a queryable feature-layer URL.';
 if(reset){ui.featureIds=null;ui.featureOffset=0;ui.featureTotal=0;ui.featureNode=n}const run=++ui.featureRun;clearFeatureSelection();$('#loadFeaturesBtn').disabled=true;$('#prevPage').disabled=$('#nextPage').disabled=true;$('#spatialStatus').textContent='Loading features for '+n.title+'…';ui.geo=emptyGeo();if(ui.mapReady)ui.map.getSource('features')?.setData(ui.geo);ui.popup?.remove();$('#featureInspector').innerHTML='<h2>Feature attributes</h2><p class="note">Loading selected layer…</p>';
 try{await initMap();if(run!==ui.featureRun)return;const size=Number($('#pageSize').value);let features;
 if(ui.demo){features=structuredClone(n.id==='demo:zones'?DEMO_ZONES:DEMO_FEATURES);ui.featureTotal=features.length;ui.featureIds=features.map((_,i)=>i);features=features.slice(ui.featureOffset,ui.featureOffset+size)}else{if(!ui.featureIds){const result=await restJSON(n.url+'/query',{where:'1=1',returnIdsOnly:true});if(!Array.isArray(result.objectIds)){if(result.objectIds===null)result.objectIds=[];else throw new Error('Service does not support Object ID enumeration for reliable paging.')}ui.featureIds=result.objectIds;ui.featureTotal=ui.featureIds.length}if(run!==ui.featureRun)return;const pageIds=ui.featureIds.slice(ui.featureOffset,ui.featureOffset+size);features=[];const batch=Math.max(1,Math.min(Number(n.meta.maxRecordCount)||100,100));for(let i=0;i<pageIds.length;i+=batch){features.push(...await queryBatch(n,pageIds.slice(i,i+batch),run));if(run!==ui.featureRun)return}}
 if(run!==ui.featureRun)return;ui.geo={type:'FeatureCollection',features:features.map((f,i)=>({...f,id:i}))};ui.map.getSource('features').setData(ui.geo);fitFeatures();const end=Math.min(ui.featureOffset+size,ui.featureTotal);$('#pageLabel').textContent=ui.featureTotal?`${ui.featureOffset+1}–${end} of ${ui.featureTotal.toLocaleString()}`:'0 features';$('#spatialStatus').textContent=`${n.title} · ${features.length} features returned on this page · ${ui.featureTotal.toLocaleString()} IDs${ui.demo?' · Demo data':''}`;$('#prevPage').disabled=ui.featureOffset===0;$('#nextPage').disabled=end>=ui.featureTotal;renderFeaturePageList();$('#mapNotice').textContent=({metro:'MetroMap',aerial:'Esri World Aerial',topo:'Esri Topography'})[ui.basemap]+' · Map displays current page only.';
 }catch(e){if(run===ui.featureRun){$('#spatialStatus').textContent='Feature query failed: '+e.message+'. Check service access and CORS.';$('#pageLabel').textContent='Page not loaded';$('#prevPage').disabled=ui.featureOffset===0;$('#nextPage').disabled=true;$('#featureInspector').innerHTML='<h2>Feature attributes</h2><p class="note">No feature page is loaded.</p>'}}finally{if(run===ui.featureRun)$('#loadFeaturesBtn').disabled=false}
}
function featurePage(direction){if(!ui.featureNode)return;const size=Number($('#pageSize').value);ui.featureOffset=Math.max(0,ui.featureOffset+direction*size);loadFeatures(false)}

function installFeatureSelectionLayers(map){map.addSource('selected-feature',{type:'geojson',data:emptyGeo()});const polygon=['==',['geometry-type'],'Polygon'],line=['in',['geometry-type'],['literal',['Polygon','LineString']]],point=['==',['geometry-type'],'Point'];for(const layer of [
 {id:'selected-fill',type:'fill',filter:polygon,paint:{'fill-color':'#ed007f','fill-opacity':.42}},
 {id:'selected-line-halo',type:'line',filter:line,paint:{'line-color':'#ffffff','line-width':9,'line-opacity':.96}},
 {id:'selected-line',type:'line',filter:line,paint:{'line-color':'#ed007f','line-width':5}},
 {id:'selected-point-halo',type:'circle',filter:point,paint:{'circle-radius':14,'circle-color':'#ffffff','circle-stroke-color':'#260b24','circle-stroke-width':2}},
 {id:'selected-point',type:'circle',filter:point,paint:{'circle-radius':10,'circle-color':'#ed007f','circle-stroke-color':'#ffffff','circle-stroke-width':2}}
 ])map.addLayer({...layer,source:'selected-feature'})}
function clearFeatureSelection(){ui.selectedFeature=null;$('#zoomSelectedBtn').disabled=true;$('#featureInspector').classList.remove('has-selection');if(ui.mapReady)ui.map.getSource('selected-feature')?.setData(emptyGeo());ui.popup?.remove()}
function selectedFeatureFromHit(f){if(!f)return null;if(f.id!==undefined){const complete=ui.geo.features.find(x=>x.id===f.id);if(complete)return complete}const oid=oidField(ui.featureNode);if(oid&&f.properties?.[oid]!==undefined){const complete=ui.geo.features.find(x=>x.properties?.[oid]===f.properties[oid]);if(complete)return complete}return {type:'Feature',properties:f.properties||{},geometry:f.geometry||null}}
function featureBounds(features){const bounds=new maplibregl.LngLatBounds();function visit(a){if(!Array.isArray(a))return;if(typeof a[0]==='number'&&typeof a[1]==='number'){if(Math.abs(a[0])<=180&&Math.abs(a[1])<=90)bounds.extend(a.slice(0,2))}else a.forEach(visit)}function geometry(g){if(!g)return;if(g.type==='GeometryCollection')g.geometries?.forEach(geometry);else visit(g.coordinates)}for(const f of features)geometry(f.geometry);return bounds}
function fitFeatures(){if(!ui.mapReady||!ui.geo.features.length)return;const bounds=featureBounds(ui.geo.features);if(!bounds.isEmpty())ui.map.fitBounds(bounds,{padding:55,maxZoom:18,duration:500})}
function zoomSelectedFeature(){if(!ui.mapReady||!ui.selectedFeature)return false;const bounds=featureBounds([ui.selectedFeature]);if(bounds.isEmpty()){status('The selected feature has no valid spatial geometry.');return false}const width=$('#map').getBoundingClientRect().width,right=$('#featureInspector').hidden?55:Math.min(350,Math.max(55,width*.3));ui.map.fitBounds(bounds,{padding:{top:55,bottom:55,left:55,right},maxZoom:18,duration:550});return true}
function showFeature(feature){const f=selectedFeatureFromHit(feature);if(!f)return;ui.popup?.remove();ui.selectedFeature=f;if(ui.mapReady)ui.map.getSource('selected-feature')?.setData({type:'FeatureCollection',features:f.geometry?[f]:[]});$('#zoomSelectedBtn').disabled=!f.geometry;const aliases=new Map((ui.featureNode?.meta.fields||[]).map(x=>[x.name,x.alias||x.name]));$('#featureInspector').innerHTML='<div class="feature-selection-heading"><span class="feature-selected-dot"></span><h2>Selected feature</h2></div>'+kvHTML(Object.entries(f.properties||{}).map(([k,v])=>[aliases.get(k)||k,v]))+'<div class="feature-selection-actions"><button data-feature-action="zoom" class="zoom-selected" '+(!f.geometry?'disabled':'')+'>Zoom to selected feature</button><button data-feature-action="back">Back to page list</button><button data-feature-action="clear">Clear selection</button></div>';$('#featureInspector').classList.add('has-selection');$('#featureInspector').hidden=false;$('#toggleAttributesBtn').setAttribute('aria-expanded','true')}
function renderFeaturePageList(){const features=ui.geo.features,n=ui.featureNode;$('#featureInspector').innerHTML='<h2>'+esc(n?.title||'Feature page')+'</h2><p class="note">Click a map feature, or choose one from this page.</p><div class="node-list">'+features.slice(0,50).map((f,i)=>`<button data-feature-index="${i}" class="${ui.selectedFeature===f?'feature-list-selected':''}">${esc(display(f.properties[n?.meta?.displayField]||f.properties[oidField(n)]||'Feature '+(i+1)))}</button>`).join('')+'</div>'+(features.length>50?'<p class="note">First 50 listed. All page features can be selected on the map.</p>':'')}
function handleFeatureInspectorClick(e){const item=e.target.closest('[data-feature-index]');if(item){showFeature(ui.geo.features[Number(item.dataset.featureIndex)]);return}const button=e.target.closest('[data-feature-action]');if(!button)return;if(button.dataset.featureAction==='zoom')zoomSelectedFeature();if(button.dataset.featureAction==='back')renderFeaturePageList();if(button.dataset.featureAction==='clear'){clearFeatureSelection();renderFeaturePageList()}}

const DEMO_FEATURES=Array.from({length:620},(_,i)=>({type:'Feature',properties:{OBJECTID:i+1,ASSET_ID:'TREE-'+String(i+1).padStart(4,'0'),SPECIES:['Eucalyptus leucoxylon','Jacaranda mimosifolia','Platanus acerifolia'][i%3],CONDITION:['Good','Fair','Excellent'][i%3]},geometry:{type:'Point',coordinates:[138.588+(i%31)*.00082,-34.918-Math.floor(i/31)*.00086]}}));
const DEMO_ZONES=Array.from({length:3},(_,i)=>({type:'Feature',properties:{OBJECTID:i+1,ZONE_CODE:['CIVIC','PARK','MIXED'][i],ZONE_NAME:['Civic precinct','Park lands','Mixed use'][i]},geometry:{type:'Polygon',coordinates:[[[138.588+i*.008,-34.924],[138.594+i*.008,-34.924],[138.594+i*.008,-34.933],[138.588+i*.008,-34.933],[138.588+i*.008,-34.924]]]}}));
function loadDemo(){if(ui.busy)return;resetGraph();ui.demo=true;const modified=Date.UTC(2026,9,15);const nodes=[{id:'demo:experience',kind:'experience',title:'City Planning Dashboard',type:'Web Experience',owner:'sample-user',meta:{snippet:'Demonstration workspace. All content and geometries are synthetic.',description:'A local sample of the five explorers. Connect to ArcGIS to load your own content.',access:'org',tags:['Demo','Synthetic data']}},{id:'demo:map',kind:'webmap',title:'Urban environment',type:'Web Map',owner:'sample-user',meta:{access:'org',description:'Example operational layers and a shared service.'}},{id:'demo:map2',kind:'webmap',title:'Asset overview',type:'Web Map',owner:'sample-user',meta:{access:'org'}},{id:'demo:service',kind:'service',title:'City spatial assets',type:'Feature Service',owner:'sample-user',meta:{capabilities:'Query',description:'Synthetic sample service shared by two web maps.',maxRecordCount:250}},{id:'demo:trees',kind:'layer',title:'Street trees',type:'Feature Layer',layerId:0,meta:{geometryType:'esriGeometryPoint',objectIdField:'OBJECTID',displayField:'ASSET_ID',capabilities:'Query',extent:{xmin:138.58,ymin:-34.95,xmax:138.62,ymax:-34.91,spatialReference:{wkid:4326}},fields:[{name:'OBJECTID',alias:'Object ID',type:'esriFieldTypeOID',nullable:false,editable:false},{name:'ASSET_ID',alias:'Asset identifier',type:'esriFieldTypeString',length:24,nullable:false,editable:true},{name:'SPECIES',alias:'Tree species',type:'esriFieldTypeString',length:100,nullable:true,editable:true},{name:'CONDITION',alias:'Condition',type:'esriFieldTypeString',length:20,nullable:true,editable:true,defaultValue:'Good',domain:{name:'Tree condition',type:'codedValue',codedValues:[{code:'Good',name:'Good condition'},{code:'Fair',name:'Fair condition'},{code:'Excellent',name:'Excellent condition'}]}}],indexes:[{name:'PK_OBJECTID',fields:'OBJECTID',isUnique:true}]}},{id:'demo:zones',kind:'layer',title:'Planning precincts',type:'Feature Layer',layerId:1,meta:{geometryType:'esriGeometryPolygon',objectIdField:'OBJECTID',displayField:'ZONE_NAME',fields:[{name:'OBJECTID',alias:'Object ID',type:'esriFieldTypeOID',nullable:false,editable:false},{name:'ZONE_CODE',alias:'Zone code',type:'esriFieldTypeString',length:12,nullable:false,editable:true},{name:'ZONE_NAME',alias:'Zone name',type:'esriFieldTypeString',length:80,nullable:true,editable:true}],description:'Three synthetic planning precincts near central Adelaide.'}},{id:'demo:table',kind:'table',title:'Inspection register',type:'Table',layerId:2,meta:{fields:[{name:'OBJECTID',type:'esriFieldTypeOID',nullable:false},{name:'ASSET_ID',type:'esriFieldTypeString',length:24,nullable:false},{name:'INSPECTED',type:'esriFieldTypeDate',nullable:true}],relationships:[{id:0,name:'Tree inspections',relatedTableId:0,role:'esriRelRoleDestination'}]}}];nodes.forEach(n=>addNode({...n,modified}));[['demo:experience','demo:map'],['demo:experience','demo:map2'],['demo:map','demo:service'],['demo:map2','demo:service'],['demo:service','demo:trees'],['demo:service','demo:zones'],['demo:service','demo:table']].forEach(([a,b])=>addEdge(a,b,'contains'));ui.levelLimit=4;ui.manualExpand.clear();layoutGraph();render();refreshIntegrated();selectNode('demo:trees');switchView('content');status('DEMO · Synthetic data only. Street trees has 620 features for testing paging.');}

const PALETTE_NAMES={'original':'Original','morning-sun':'Morning Sun','evening':'Evening','corporate':'Corporate','arcgis-online':'ArcGIS Online','windows-11':'Windows 11'};
function applyPalette(value,persist=true){const key=Object.hasOwn(PALETTE_NAMES,value)?value:'original';document.documentElement.dataset.palette=key;$('#paletteSelect').value=key;if(persist){try{localStorage.setItem('arcgis-explorer-palette',key)}catch{}}}
function initPalette(){let key='original';try{key=localStorage.getItem('arcgis-explorer-palette')||key}catch{}applyPalette(key,false);$('#paletteSelect').onchange=e=>applyPalette(e.target.value)}

// Interaction
$('#signinBtn').onclick=beginSignin;$('#exchangeBtn').onclick=exchangeCode;$('#verifyBtn').onclick=verifyToken;$('#logoutBtn').onclick=clearToken;$('#scanBtn').onclick=buildGraph;$('#clearBtn').onclick=resetGraph;$('#layoutBtn').onclick=()=>{layoutGraph();render();maybeFitGraph()};$('#fitBtn').onclick=()=>fitGraph({force:true});$('#jsonBtn').onclick=exportJSON;$('#csvBtn').onclick=exportCSV;$('#focusBtn').onclick=focusSelection;$('#descBtn').onclick=()=>setGraphView('branch');$('#firstDegreeBtn').onclick=isolateFirstDegree;$('#showAllBtn').onclick=()=>setGraphView('all');$('#searchInput').oninput=applySearch;$('#spacingInput').oninput=event=>setGraphSpacing(event.target.value);$$('input[data-kind]').forEach(x=>x.onchange=()=>{render();maybeFitGraph()});$('#zoomInBtn').onclick=()=>{const r=$('#graph').getBoundingClientRect();zoomAt(1.2,r.width/2,r.height/2)};$('#zoomOutBtn').onclick=()=>{const r=$('#graph').getBoundingClientRect();zoomAt(1/1.2,r.width/2,r.height/2)};
$('#demoPasteBtn').onclick=async()=>{try{$('#itemInput').value=await navigator.clipboard.readText()}catch{setScanStatus('Clipboard access was unavailable. Paste into the field manually.','warn')}};

const svg=$('#graph');svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect();zoomAt(e.deltaY<0?1.12:1/1.12,e.clientX-r.left,e.clientY-r.top)},{passive:false});
svg.addEventListener('pointerdown',e=>{const g=e.target.closest?.('.node');if(g){const n=state.nodes.get(g.dataset.id);graphCancel(true);state.dragging={id:n.id,px:e.clientX,py:e.clientY,ox:n.x,oy:n.y};selectNode(n.id,{activateGraph:true});svg.setPointerCapture(e.pointerId);e.preventDefault();return}graphAppearance.clicked=null;graphAppearanceControls();state.panning={px:e.clientX,py:e.clientY,ox:state.transform.x,oy:state.transform.y};svg.setPointerCapture(e.pointerId)});
svg.addEventListener('pointermove',e=>{if(state.dragging){const d=state.dragging,n=state.nodes.get(d.id);n.x=d.ox+(e.clientX-d.px)/state.transform.k;n.y=d.oy+(e.clientY-d.py)/state.transform.k;graphCurrent.set(n.id,{x:n.x,y:n.y});graphGeometry.positions.set(n.id,{x:n.x,y:n.y});graphGeometry.bounds=UOSGraphLayout.bounds(graphGeometry.positions,graphGeometry.metrics);graphPaint();return}if(state.panning){state.transform.x=state.panning.ox+(e.clientX-state.panning.px);state.transform.y=state.panning.oy+(e.clientY-state.panning.py);applyTransform()}});svg.addEventListener('pointerup',()=>{state.dragging=null;state.panning=null});svg.addEventListener('pointercancel',()=>{state.dragging=null;state.panning=null});
initGraphControls();
initIntegrated();
render();
})();
