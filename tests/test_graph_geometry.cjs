const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const sandbox={window:{}};vm.createContext(sandbox);
for(const file of ['graph-layout.js','graph-routing.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../online/js',file),'utf8'),sandbox);
const layout=sandbox.window.UOSGraphLayout,routing=sandbox.window.UOSGraphRouting;
const titles=['Urban Tree Map - Genus_V2','ASSETSTREE_ForestTreeAPP_020425','City Plan Shape','Light Gray Canvas Reference','Trees_Audit_2023_Full_Data','Basemap'];
const nodes=Array.from({length:18},(_,i)=>({id:'n'+i,title:titles[i%titles.length],kind:i===0?'webmap':i<5?'service':'layer',type:i<5?'Feature Service':'Feature Layer'}));
const edges=nodes.slice(1).map((n,i)=>({source:'n'+Math.floor(i/4),target:n.id}));
function inspect(g,width,height){
  assert.equal(g.positions.size,nodes.length);
  const camera=layout.fit(g,width,height);assert(camera.k<=1,'Fit must not enlarge text or symbols');
  for(const [id,p] of g.positions){
    const m=g.metrics.get(id),left=(p.x-m.w/2)*camera.k+camera.x,top=(p.y-m.h/2)*camera.k+camera.y;
    assert(left>=23&&top>=23&&left+m.w*camera.k<=width-23&&top+m.h*camera.k<=height-23,'full labels stay inside canvas');
    for(const [other,q] of g.positions)if(id<other){const n=g.metrics.get(other);assert(Math.abs(p.x-q.x)>=(m.w+n.w)/2-.1||Math.abs(p.y-q.y)>=(m.h+n.h)/2-.1,'labels do not overlap');}
  }
  assert(g.bounds.width*camera.k/(width-48)>.98&&g.bounds.height*camera.k/(height-48)>.98,'node centres fill both available axes');
  return camera;
}
for(const [width,height] of [[1500,900],[820,550],[360,600]])for(const type of ['dependency','balanced','radial'])for(const density of ['roomy','balanced','compact']){
  const g=layout.compute(nodes,edges,{width,height,layout:type,density,selected:'n0'}),camera=inspect(g,width,height);
  if(width===1500)assert(camera.k>.95,'ordinary desktop graph retains native label readability in every layout');
  const router=routing.createRouter(g.positions,g.metrics);
  for(const edge of edges){
    assert(router.path(edge).length>0,'all connectors retained');
    const points=router.points(edge);
    for(let i=1;i<points.length;i++)for(const [id,p] of g.positions){
      const m=g.metrics.get(id),left=p.x+m.textX,right=p.x+m.w/2,top=p.y-m.h/2,bottom=p.y+m.h/2,a=points[i-1],b=points[i];
      const crosses=Math.abs(a.x-b.x)<.01?a.x>left&&a.x<right&&Math.max(a.y,b.y)>top&&Math.min(a.y,b.y)<bottom:
        Math.abs(a.y-b.y)<.01?a.y>top&&a.y<bottom&&Math.max(a.x,b.x)>left&&Math.min(a.x,b.x)<right:true;
      assert(!crosses,'connectors avoid every label in '+type+'/'+density+' '+width+'px: '+edge.source+' -> '+edge.target+' crosses '+id);
    }
  }
}
console.log('PASS three layouts and densities fill the canvas, retain labels, and avoid overlap at desktop/tablet/mobile sizes');

// Distinct branches remain angularly grouped around the chosen root.
const branches=[{id:'root',title:'Root',kind:'webmap'}],links=[];
for(let b=0;b<3;b++)for(let d=0;d<3;d++){const id='b'+b+'d'+d;branches.push({id,title:'Branch '+b+' resource '+d,kind:'layer'});links.push({source:d?'b'+b+'d'+(d-1):'root',target:id})}
links.push({source:'b0d2',target:'b0d0'});
const radial=layout.compute(branches,links,{layout:'radial',selected:'root',width:1500,height:900,density:'balanced'});
for(let b=0;b<3;b++){
  const a=radial.positions.get('b'+b+'d0'),z=radial.positions.get('b'+b+'d2');
  assert(a.x*z.x+a.y*z.y>0,'descendants stay in the same angular branch sector');
  assert(Math.hypot(z.x,z.y)>Math.hypot(a.x,a.y),'direct resources are nearer the selected root');
}
assert.equal(radial.positions.size,branches.length,'cycles retain each resource exactly once');
console.log('PASS radial hierarchy groups descendants into sectors and keeps direct neighbours close');

const egoNodes=[{id:'root',title:'City operations and planning Web Map',kind:'webmap',type:'Web Map'},...Array.from({length:30},(_,i)=>({id:'e'+i,title:'Planning precinct boundaries '+i,kind:'layer',type:'Feature Layer'}))];
const egoEdges=egoNodes.slice(1).map((node,i)=>i%5?{source:'root',target:node.id}:{source:node.id,target:'root'});
const ego=layout.compute(egoNodes,egoEdges,{layout:'balanced',ego:true,root:'root',selected:'root',width:830,height:555,density:'balanced'}),egoCamera=layout.fit(ego,830,555);
assert(egoCamera.k*14>=13,'medium first-degree graph keeps readable desktop labels');
assert(Math.abs(egoCamera.x-415)<20&&Math.abs(egoCamera.y-277.5)<20,'selected resource stays near the centre despite unequal incoming/outgoing counts');
assert.equal(ego.positions.size,31);
console.log('PASS first-degree columns balance height and preserve readable labels around the selected root');

const measure=s=>s.length*7;
assert.deepEqual(Array.from(layout.wrap('Urban_Tree_Map-Genus',80,3,measure)),['Urban_Tree_','Map-Genus']);
assert.deepEqual(Array.from(layout.wrap('LongName_123456789',75,2,measure)),['LongName_','123456789']);
assert(layout.wrap('Supercalifragilisticexpialidocious',70,2,measure).at(-1).endsWith('…'));
console.log('PASS labels prefer separator boundaries and only truncate at the final line');

const many=Array.from({length:1200},(_,i)=>({id:'r'+i,title:'Resource '+i,kind:'layer'})),chain=many.slice(1).map((n,i)=>({source:'r'+i,target:n.id}));
const overview=layout.compute(many,chain,{layout:'dependency',width:820,height:550,density:'compact'});
assert.equal(overview.positions.size,1200);assert(layout.fit(overview,820,550).k<1);
console.log('PASS dense overview retains all 1,200 resources');
