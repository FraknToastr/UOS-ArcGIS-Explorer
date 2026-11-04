const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../online/js/graph-routing.js'),'utf8'),context);
const routing=context.window.UOSGraphRouting,metric={w:180,h:66,iconX:-74,textX:-58,r:12};
function intersection(a,b,r){if(a.x===b.x)return a.x>r.left&&a.x<r.right&&Math.max(a.y,b.y)>r.top&&Math.min(a.y,b.y)<r.bottom;return a.y>r.top&&a.y<r.bottom&&Math.max(a.x,b.x)>r.left&&Math.min(a.x,b.x)<r.right}
function verify(name,entries,edge={source:'a',target:'b'}){
 const positions=new Map(entries.map(([id,x,y])=>[id,{x,y}])),metrics=new Map(entries.map(([id])=>[id,{...metric}])),router=routing.createRouter(positions,metrics),points=router.points(edge);
 assert(points.length>=2,name+' has a route');
 for(let i=1;i<points.length;i++)assert(points[i].x===points[i-1].x||points[i].y===points[i-1].y,name+' is orthogonal');
 for(const [id,p] of positions){const endpoint=id===edge.source||id===edge.target,r={left:p.x+(endpoint?metric.textX:-metric.w/2),right:p.x+metric.w/2,top:p.y-metric.h/2,bottom:p.y+metric.h/2};for(let i=1;i<points.length;i++)assert(!intersection(points[i-1],points[i],r),name+' avoids '+id+' label/box')}
 assert(!/NaN|Infinity/.test(router.path(edge)));assert.equal(router.path(edge),router.path(edge),'cached paths are deterministic');assert.equal(routing.route(edge,positions,metrics),router.path(edge));console.log('PASS',name);
}
verify('rightward connector bypasses its own label',[['a',0,0],['b',440,0]]);
verify('leftward connector protects target label',[['a',440,0],['b',0,0]]);
verify('vertical connector',[['a',0,0],['b',0,300]]);
verify('diagonal radial connector',[['a',0,0],['b',350,-250]]);
verify('intervening unrelated label',[['a',0,0],['b',600,0],['c',300,0]]);
verify('several obstacles',[['a',0,0],['b',650,250],['c',250,50],['d',450,190],['e',150,250]]);
verify('self loop avoids own label',[['a',0,0]],{source:'a',target:'a'});
const positions=new Map(Array.from({length:1200},(_,i)=>['n'+i,{x:(i%40)*230,y:Math.floor(i/40)*100}])),metrics=new Map([...positions.keys()].map(id=>[id,{...metric}]));
const start=performance.now(),router=routing.createRouter(positions,metrics);for(let i=0;i<1199;i++){const p=router.path({source:'n'+i,target:'n'+(i+1)});assert(p&&!/NaN|Infinity/.test(p))}assert(performance.now()-start<2000,'dense graph routing is bounded');console.log('PASS 1,200-node bounded routing: 1,199 connectors in '+Math.round(performance.now()-start)+'ms');
