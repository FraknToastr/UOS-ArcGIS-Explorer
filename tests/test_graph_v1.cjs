const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const sandbox={window:{}};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../online/js/graph-layout-v1.js'),'utf8'),sandbox);
const engine=sandbox.window.UOSGraphLayoutV1;
const nodes=Array.from({length:18},(_,i)=>({id:'n'+i,title:['Urban Tree Map - Genus_V2','ASSETSTREE_ForestTreeAPP_020425','Light Gray Canvas Reference','Trees_Audit_2023_Full_Data','Basemap'][i%5],kind:['webmap','service','layer'][i%3],type:'Feature Layer'}));
const edges=nodes.slice(1).map((node,i)=>({source:'n'+Math.floor(i/4),target:node.id}));
const presets={roomy:{spacing:220,densityScale:1.24},balanced:{spacing:135,densityScale:1},compact:{spacing:72,densityScale:.72}};
// Reference values independently compared against 1a4127d's geometry with only
// the screenshot-era density-range and non-radial aspect-expansion adjustments.
const snapshots=[
 ['dependency','roomy',1230.688,902.444,260.722,0],
 ['dependency','balanced',1162.156,842,243.259,0],
 ['dependency','compact',1111.362,797.2,230.316,0],
 ['balanced','roomy',679.089,423.185,-236.794,-175.593],
 ['balanced','balanced',650.904,398,-222.702,-163],
 ['balanced','compact',630.014,379.333,-212.257,-153.667],
 ['radial','roomy',1760.16,1023.2,0,0],
 ['radial','balanced',1452,836,0,0],
 ['radial','compact',1084.47,617.6,0,0]
];
for(const [layout,density,...expected] of snapshots){
 const geometry=engine.compute(nodes,edges,{layout,density,...presets[density],width:1500,height:900,selected:'n0'});
 const root=geometry.positions.get('n0'),actual=[geometry.bounds.width,geometry.bounds.height,root.x,root.y].map(value=>+value.toFixed(3));
 assert.deepEqual(actual,expected,layout+'/'+density+' preserves the screenshot-era geometry');
 assert.equal(geometry.positions.size,18);assert.equal(geometry.metrics.get('n0').r,20,'original selected symbol radius');
 assert.equal(geometry.metrics.get('n1').r,14,'original service symbol radius');assert.equal(geometry.metrics.get('n2').r,11,'original layer symbol radius');
 const camera=engine.fit(geometry,1500,900);
 for(const [id,p] of geometry.positions){const m=geometry.metrics.get(id),x=(p.x-m.w/2)*camera.k+camera.x,y=(p.y-m.h/2)*camera.k+camera.y;assert(x>=13.99&&y>=13.99&&x+m.w*camera.k<=1486.01&&y+m.h*camera.k<=886.01,'labels fit inside the original padding');}
 for(const edge of edges){const curve=engine.path(edge,geometry.positions,geometry.metrics);assert(curve.includes(' C'),'original cubic connectors are preserved');assert(!curve.includes(' Q'));assert(!/NaN|Infinity/.test(curve));}
}
console.log('PASS V1 Dependency/Balanced/Radial geometry, presets, original metrics and curved connectors');

const single=engine.compute([{id:'solo',title:'Selected layer',kind:'layer'}],[],{selected:'solo',width:1500,height:900});
assert.equal(engine.fit(single,1500,900).k,2.4,'V1 retains enlargement up to 2.4x');
assert.equal(engine.path({source:'missing',target:'solo'},single.positions,single.metrics),'');
assert(engine.path({source:'solo',target:'solo'},single.positions,single.metrics).includes(' C'),'V1 self-loop remains curved');

for(const layout of ['balanced','radial']){
 const options={layout,ego:true,root:'n0',selected:'n0',width:1500,height:900,...presets.balanced};
 const geometry=engine.compute(nodes,edges,options),camera=engine.fit(geometry,1500,900,options),root=geometry.positions.get('n0');
 assert(Math.abs(root.x*camera.k+camera.x-750)<.00001&&Math.abs(root.y*camera.k+camera.y-450)<.00001,'first-degree selection remains centred');
}
console.log('PASS V1 fit restores 2.4x enlargement, self-loops, and centred first-degree fitting');

for(const layout of ['dependency','balanced','radial']){
 const low=engine.compute(nodes,edges,{layout,width:1500,height:900,selected:'n0',spacing:80,densityScale:1}),high=engine.compute(nodes,edges,{layout,width:1500,height:900,selected:'n0',spacing:220,densityScale:1});
 assert.notEqual(low.bounds.height,high.bounds.height,'spacing slider continues to modulate V1 '+layout);
}
console.log('PASS V1 spacing control changes all three layouts');
