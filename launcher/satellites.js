/* Shared craft meshes, Earth occlusion, and coordinated UFO formations.
   Satellite mode retains its illustrative Walker-Delta 12/3/2 constellation. */
window.UOSSatellites=(()=>{
'use strict';
const orbits=Array.from({length:12},(_,index)=>{const plane=Math.floor(index/4);return {inclination:Math.PI/3,node:plane*Math.PI*2/3,phase:index%4*Math.PI/2+plane*Math.PI/3,radius:1.18}});
const names=['equatorial','coverage'];
function formationAt(time){
 const stage=Math.floor(time/30)%names.length,local=time%30,t=Math.max(0,(local-20)/10),blend=t*t*t*(t*(t*6-15)+10);
 return {current:names[stage],next:names[(stage+1)%names.length],progress:blend,transitioning:local>=20,clock:time};
}
function formationOrbits(time){
 const state=formationAt(time),stage=names.indexOf(state.current),next=(stage+1)%names.length;
 const target=(index,mode)=>mode===1?orbits[index]:{inclination:0,node:0,phase:index*Math.PI*2/12,radius:1.18};
 return orbits.map((_,i)=>{const a=target(i,stage),b=target(i,next),p=state.progress;return {inclination:a.inclination+(b.inclination-a.inclination)*p,node:a.node+(b.node-a.node)*p,phase:a.phase+(b.phase-a.phase)*p,radius:1.18}});
}
function formationPositions(time,phase){
 return separate(formationOrbits(time).map(o=>orbitPoint(o,phase)));
}
function separate(points){
 // Relax neighbouring craft tangentially, keeping all centres on the orbital sphere.
 for(let pass=0;pass<48;pass++){
  const push=points.map(()=>[0,0,0]);
  for(let i=0;i<12;i++)for(let j=0;j<i;j++){
   const a=points[i],b=points[j],d=[a.x-b.x,a.y-b.y,a.z-b.z],length=Math.hypot(...d),limit=.23;
   if(length<limit){const force=(limit-length)*.28/Math.max(length,1e-8);for(let k=0;k<3;k++){push[i][k]+=d[k]*force;push[j][k]-=d[k]*force}}
  }
  points.forEach((p,i)=>{const q=[p.x+push[i][0],p.y+push[i][1],p.z+push[i][2]],r=1.18/Math.hypot(...q);p.x=q[0]*r;p.y=q[1]*r;p.z=q[2]*r});
 }
 return points;
}
function createFormationController(){
 let time=0,phase=0,manual=false;
 let points=formationPositions(time,phase);
 const snapshot=()=>({...formationAt(time),manual,phase,points});
 return {
  snapshot,
  reset(){time=0;phase=0;manual=false;points=formationPositions(time,phase)},
  next(){if(formationAt(time).transitioning)return false;time=Math.floor(time/30)*30+20;manual=true;return true},
  advance(dt,{active=true,speed=.5}={}){
   if(!active||dt<=0)return snapshot();
   const steps=Math.max(1,Math.ceil(dt*60)),step=dt/steps,end=time+dt;
   for(let frame=0;frame<steps;frame++){
    const stage=Math.floor(time/30);time=frame===steps-1?end:time+step;phase=(phase+speed*step)%(Math.PI*2);
    if(Math.floor(time/30)!==stage)manual=false;
    const targets=formationOrbits(time).map(o=>orbitPoint(o,phase)),blend=1-Math.exp(-12*step);
    // Follow targets continuously before resolving separation. Starting each solve
    // at the previous frame avoids the side-swapping of a stateless repulsion solve.
    points=separate(points.map((p,i)=>{const t=targets[i],x=p.x+(t.x-p.x)*blend,y=p.y+(t.y-p.y)*blend,z=p.z+(t.z-p.z)*blend,r=1.18/Math.hypot(x,y,z);return {x:x*r,y:y*r,z:z*r,radius:1.18}}));
   }
   return snapshot();
  }
 };
}
function orbitPoint(o,phase){const a=phase+o.phase,bx=Math.cos(a)*o.radius,y=Math.sin(a)*Math.sin(o.inclination)*o.radius,bz=-Math.sin(a)*Math.cos(o.inclination)*o.radius,c=Math.cos(o.node),s=Math.sin(o.node);return {x:c*bx+s*bz,y,z:-s*bx+c*bz,radius:o.radius}}
const vs=`attribute vec3 position;attribute vec4 color;varying vec3 cameraPoint;varying vec4 tint;uniform vec4 orbit;uniform vec3 centre;uniform vec2 view;uniform float scale,phase;
vec3 plane(vec3 p){float c=cos(orbit.y),s=sin(orbit.y);return vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);}
void main(){float a=phase+orbit.z,c=cos(orbit.x),s=sin(orbit.x);vec3 radial=normalize(centre);vec3 tangent=plane(vec3(-sin(a),cos(a)*s,-cos(a)*c));tangent-=radial*dot(radial,tangent);if(length(tangent)<.001)tangent=cross(radial,abs(radial.y)<.9?vec3(0.,1.,0.):vec3(1.,0.,0.));tangent=normalize(tangent);vec3 normal=cross(radial,tangent);vec3 p=radial*(orbit.w+position.z)+tangent*position.x+normal*position.y;
float cp=cos(view.x),sp=sin(view.x),t=cos(view.y),u=sin(view.y);cameraPoint=vec3(cp*p.x+sp*p.z,sp*u*p.x+t*p.y-cp*u*p.z,-sp*t*p.x+u*p.y+cp*t*p.z);tint=color;gl_Position=vec4(cameraPoint.xy*scale,-cameraPoint.z*.3,1.);}`;
const fs=`precision highp float;varying vec3 cameraPoint;varying vec4 tint;
void main(){float d=dot(cameraPoint.xy,cameraPoint.xy);if(d<.64&&cameraPoint.z<sqrt(.64-d))discard;gl_FragColor=vec4(tint.rgb*tint.a,tint.a);}`;
// Unscaled camera coordinates remain available to the fragment occlusion test.
const vertex=vs;
function create(canvas,onLoss){
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,premultipliedAlpha:true});if(!gl)throw Error('Satellite WebGL context unavailable');
  let program,buffer,active=true,frames=0,craftType='satellites',formation=formationAt(0),lastPoints=null,lastView=null;const shaders=[];
  const lost=e=>{e.preventDefault();if(active)onLoss?.()};canvas.addEventListener('webglcontextlost',lost);
  function destroy(){if(!active)return;active=false;canvas.removeEventListener('webglcontextlost',lost);gl.deleteBuffer(buffer);gl.deleteProgram(program);for(const shader of shaders)gl.deleteShader(shader);gl.getExtension('WEBGL_lose_context')?.loseContext()}
  try{
    function compile(type,source){const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader}
    program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    const mesh=[];
    const point=(p,color)=>mesh.push(...p,color[0],color[1],color[2],color[3]??1);
    const triangle=(a,b,c,ca,cb=ca,cc=ca)=>{point(a,ca);point(b,cb);point(c,cc)};
    const quad=(a,b,c,d,ca,cb=ca,cc=ca,cd=ca)=>{triangle(a,b,c,ca,cb,cc);triangle(a,c,d,ca,cc,cd)};
    // Blue photovoltaic wings, cyan rails, and a small warm metallic satellite bus.
    for(const sign of [-1,1]){
      const a=.013*sign,b=.045*sign;
      quad([a,-.012,0],[b,-.012,0],[b,.012,0],[a,.012,0],[.10,.34,.72]);
      for(const y of [-.012,0,.011])quad([a,y,.0006],[b,y,.0006],[b,y+.001,.0006],[a,y+.001,.0006],[.4,.85,1]);
      quad([b,-.012,.0005],[b+.001,-.012,.0005],[b+.001,.012,.0005],[b,.012,.0005],[.5,.8,1]);
    }
    const l=.011,h=.009;
    quad([-l,-l,h],[l,-l,h],[l,l,h],[-l,l,h],[1,.91,.62]);quad([-l,-l,-h],[-l,l,-h],[l,l,-h],[l,-l,-h],[.52,.6,.76]);
    quad([-l,-l,-h],[l,-l,-h],[l,-l,h],[-l,-l,h],[.64,.72,.86]);quad([-l,l,-h],[-l,l,h],[l,l,h],[l,l,-h],[.85,.89,1]);
    quad([-l,-l,-h],[-l,-l,h],[-l,l,h],[-l,l,-h],[.44,.55,.74]);quad([l,-l,-h],[l,l,-h],[l,l,h],[l,-l,h],[.8,.73,.51]);
    const satelliteRange={start:0,count:mesh.length/7};
    // A lathed three-dimensional hull and domed canopy, not a billboard.
    // Both complete meshes are uploaded once; selecting craft only changes ranges.
    const ufoStart=mesh.length/7,segments=20;
    const profile=[
      [0,-.009,[.13,.19,.29]],[.018,-.009,[.22,.32,.44]],
      [.036,-.003,[.39,.56,.70]],[.040,0,[.30,.92,1]],
      [.038,.002,[.42,.94,1]],[.024,.008,[.51,.68,.80]],
      [.018,.009,[.16,.42,.65]],[.016,.016,[.19,.60,.78]],
      [.010,.022,[.38,.84,.93]],[0,.025,[.70,.97,1]]
    ];
    // Hull +Z follows the radial/outward shader axis; its -Z underside always faces Earth.
    const ringPoint=(angle,radius,height)=>[Math.cos(angle)*radius,-Math.sin(angle)*radius,height];
    const lit=(color,angle)=>{const light=.66+.34*Math.max(0,Math.cos(angle-.8));return [color[0]*light,color[1]*light,color[2]*light,1]};
    for(let band=0;band<profile.length-1;band++)for(let i=0;i<segments;i++){
      const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments,lower=profile[band],upper=profile[band+1];
      quad(ringPoint(a,lower[0],lower[1]),ringPoint(b,lower[0],lower[1]),ringPoint(b,upper[0],upper[1]),ringPoint(a,upper[0],upper[1]),lit(lower[2],a),lit(lower[2],b),lit(upper[2],b),lit(upper[2],a));
    }
    const ufoBody={start:ufoStart,count:mesh.length/7-ufoStart},haloStart=mesh.length/7;
    for(let i=0;i<segments;i++){
      const a=i*Math.PI*2/segments,b=(i+1)*Math.PI*2/segments;
      quad(ringPoint(a,.040,.001),ringPoint(b,.040,.001),ringPoint(b,.052,.001),ringPoint(a,.052,.001),[.16,.92,1,.65],[.16,.92,1,.65],[.12,.7,1,0],[.12,.7,1,0]);
    }
    const ufoHalo={start:haloStart,count:mesh.length/7-haloStart};
    const data=new Float32Array(mesh);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
    const locations={};for(const name of ['orbit','view','scale','phase','centre'])locations[name]=gl.getUniformLocation(program,name);
    const position=gl.getAttribLocation(program,'position'),color=gl.getAttribLocation(program,'color');
    return {draw({phi,theta,scale,phase=0,formationClock=null,formationState=null}){
      if(craftType==='ufos'&&formationState)phase=formationState.phase;
      if(!active)return;gl.viewport(0,0,canvas.width,canvas.height);gl.depthMask(true);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,3,gl.FLOAT,false,28,0);gl.enableVertexAttribArray(color);gl.vertexAttribPointer(color,4,gl.FLOAT,false,28,12);gl.uniform1f(locations.scale,scale);gl.uniform1f(locations.phase,phase);gl.uniform2f(locations.view,phi,theta);
      formation=formationState||formationAt(formationClock===null?30:formationClock);
      const activeOrbits=craftType==='ufos'?formationOrbits(formation.clock):orbits;
      const centres=craftType==='ufos'?(formation.points||formationPositions(formation.clock,phase)):orbits.map(o=>orbitPoint(o,phase));
      lastPoints=centres;lastView={phi,theta};
      const body=craftType==='ufos'?ufoBody:satelliteRange;
      for(let index=0;index<activeOrbits.length;index++){const orbit=activeOrbits[index],p=centres[index];gl.uniform3f(locations.centre,p.x,p.y,p.z);gl.uniform4f(locations.orbit,orbit.inclination,orbit.node,orbit.phase,orbit.radius);gl.drawArrays(gl.TRIANGLES,body.start,body.count)}
      if(craftType==='ufos'){
        gl.depthMask(false);
        for(let index=0;index<activeOrbits.length;index++){const orbit=activeOrbits[index],p=centres[index];gl.uniform3f(locations.centre,p.x,p.y,p.z);gl.uniform4f(locations.orbit,orbit.inclination,orbit.node,orbit.phase,orbit.radius);gl.drawArrays(gl.TRIANGLES,ufoHalo.start,ufoHalo.count)}
        gl.depthMask(true);
      }frames++;
    },positionAt(index){return lastPoints&&lastView?project(lastPoints[index],lastView.phi,lastView.theta):null},setCraftType(type){craftType=type==='ufos'?'ufos':'satellites'},clear(){if(active){gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT)}},destroy,stats:()=>({frames,craftType,formation:{current:formation.current,next:formation.next,progress:formation.progress,transitioning:formation.transitioning,manual:!!formation.manual},vertices:craftType==='ufos'?ufoBody.count+ufoHalo.count:satelliteRange.count,bufferBytes:data.byteLength,meshUploads:1,gpuBuffers:1,orbits:orbits.length,synchronization:craftType==='ufos'?'coordinated formation cycle':'common Earth-spin period',constellation:'Walker Delta 12/3/2, 60 degrees',active}),lose:()=>gl.getExtension('WEBGL_lose_context')?.loseContext()};
  }catch(error){destroy();throw error}
}
function worldAt(index,phase,formationClock=null){if(formationClock!==null)return formationPositions(formationClock,phase)[index];const o=orbits[index],a=phase+o.phase,bx=Math.cos(a)*o.radius,y=Math.sin(a)*Math.sin(o.inclination)*o.radius,bz=-Math.sin(a)*Math.cos(o.inclination)*o.radius,c=Math.cos(o.node),s=Math.sin(o.node);return {x:c*bx+s*bz,y,z:-s*bx+c*bz,radius:o.radius}}
function project(p,phi,theta){const cp=Math.cos(phi),sp=Math.sin(phi),ct=Math.cos(theta),st=Math.sin(theta),vx=cp*p.x+sp*p.z,vy=sp*st*p.x+ct*p.y-cp*st*p.z,vz=-sp*ct*p.x+st*p.y+cp*ct*p.z;return {x:vx,y:vy,z:vz,radius:p.radius,occluded:vx*vx+vy*vy<.64&&vz<Math.sqrt(.64-vx*vx-vy*vy)}}
function positionAt(index,phase,phi,theta,formationClock=null){return project(worldAt(index,phase,formationClock),phi,theta)}
return {create,worldAt,positionAt,project,formationAt,formationOrbits,formationPositions,createFormationController,orbits:orbits.map(o=>({...o}))};
})();
