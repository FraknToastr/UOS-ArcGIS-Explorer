const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const sandbox={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../launcher/satellites.js'),'utf8'),sandbox);
const api=sandbox.window.UOSSatellites;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const options={active:true,speed:.5};
const c=api.createFormationController();
assert.equal(c.snapshot().current,'equatorial');
c.advance(7,options);
const before=c.snapshot();assert(c.next());
assert.equal(c.snapshot().clock,20);assert.equal(c.snapshot().manual,true);
assert.deepEqual(c.snapshot().points,before.points,'manual advance skips only the hold');
assert(!c.next(),'no queued or restarted transitions');
c.advance(10,options);assert.equal(c.snapshot().current,'coverage');
assert.equal(c.snapshot().manual,false);assert.equal(c.snapshot().transitioning,false);
const paused=JSON.stringify(c.snapshot());c.advance(5,{...options,active:false});assert.equal(JSON.stringify(c.snapshot()),paused);
c.advance(19,options);assert.equal(c.snapshot().transitioning,false);
c.advance(1,options);assert.equal(c.snapshot().transitioning,true);
c.advance(10,options);assert.equal(c.snapshot().current,'equatorial');assert.equal(c.snapshot().clock,60);
c.reset();assert.equal(c.snapshot().clock,0);
for(const [time,current,next,transitioning]of [[0,'equatorial','coverage',false],[20,'equatorial','coverage',true],[30,'coverage','equatorial',false],[50,'coverage','equatorial',true],[60,'equatorial','coverage',false]]){
 const state=api.formationAt(time);assert.equal(state.current,current);assert.equal(state.next,next);assert.equal(state.transitioning,transitioning);
}
assert(api.formationOrbits(10).every(o=>o.inclination===0));
assert.equal(new Set(api.formationOrbits(35).map(o=>o.node)).size,3,'coverage retains its three orbital planes');
for(const [time,phase]of [[10,0],[10,1.5],[35,.8]]){
 const points=api.formationPositions(time,phase);
 if(time===10)for(const point of points)assert(Math.abs(point.y)<1e-12,'ring remains on the equator');
}

let maxStep=0,minSeparation=Infinity;
for(const speed of [0,.1,.5,.6]){
 const controller=api.createFormationController();let previous=controller.snapshot().points;
 for(let step=0;step<120*60;step++){
  const s=controller.advance(1/60,{active:true,speed}),points=s.points;
  assert.equal(points.length,12);
  assert(['equatorial','coverage'].includes(s.current)&&['equatorial','coverage'].includes(s.next));
  assert(!Object.hasOwn(s,'polarNode'),'no camera-following state remains');
  for(let i=0;i<12;i++){
   assert(Math.abs(Math.hypot(points[i].x,points[i].y,points[i].z)-1.18)<1e-10,'constant altitude');
   maxStep=Math.max(maxStep,distance(previous[i],points[i]));
   for(let j=0;j<i;j++)minSeparation=Math.min(minSeparation,distance(points[i],points[j]));
  }
  if(s.clock>65&&s.clock<79)assert(points.every(p=>Math.abs(p.y)<.002),'return to an equatorial ring');
  previous=points;
 }
}
assert(minSeparation>=.208,`separation ${minSeparation}`);
assert(maxStep<.07,`continuous flight: max frame displacement ${maxStep}`);
console.log('PASS two UFO formations:',{minSeparation,maxStep,cycles:8,manualAdvance:true,periodSeconds:60});
