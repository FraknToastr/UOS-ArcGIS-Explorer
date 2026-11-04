/* Deterministic orthogonal connectors; labels remain obstacles with label cards off. */
(() => {
'use strict';
const CLEARANCE=10,CELL=160,EPS=.01;
const rect=(id,p,m,pad=CLEARANCE)=>({id,left:p.x-m.w/2-pad,right:p.x+m.w/2+pad,top:p.y-m.h/2-pad,bottom:p.y+m.h/2+pad});
const label=(id,p,m)=>({id,left:p.x+m.textX-5,right:p.x+m.w/2+5,top:p.y-m.h/2-5,bottom:p.y+m.h/2+5});
function intersects(a,b,r){
 if(Math.abs(a.x-b.x)<EPS)return a.x>r.left+EPS&&a.x<r.right-EPS&&Math.max(a.y,b.y)>r.top+EPS&&Math.min(a.y,b.y)<r.bottom-EPS;
 if(Math.abs(a.y-b.y)<EPS)return a.y>r.top+EPS&&a.y<r.bottom-EPS&&Math.max(a.x,b.x)>r.left+EPS&&Math.min(a.x,b.x)<r.right-EPS;
 return true;
}
function simplify(points){
 const out=[];for(const p of points){if(out.length&&Math.abs(p.x-out.at(-1).x)<EPS&&Math.abs(p.y-out.at(-1).y)<EPS)continue;out.push(p);while(out.length>2){const [a,b,c]=out.slice(-3);if((Math.abs(a.x-b.x)<EPS&&Math.abs(b.x-c.x)<EPS)||(Math.abs(a.y-b.y)<EPS&&Math.abs(b.y-c.y)<EPS))out.splice(out.length-2,1);else break}}
 return out;
}
function svgPath(points){
 if(!points.length)return '';const f=n=>Number(n.toFixed(2));let path=`M${f(points[0].x)},${f(points[0].y)}`;
 for(let i=1;i<points.length;i++){const p=points[i];if(i===points.length-1){path+=` L${f(p.x)},${f(p.y)}`;continue}const a=points[i-1],b=points[i+1],d1=Math.hypot(p.x-a.x,p.y-a.y),d2=Math.hypot(b.x-p.x,b.y-p.y),r=Math.min(6,d1/2,d2/2);path+=` L${f(p.x+(a.x-p.x)*r/d1)},${f(p.y+(a.y-p.y)*r/d1)} Q${f(p.x)},${f(p.y)} ${f(p.x+(b.x-p.x)*r/d2)},${f(p.y+(b.y-p.y)*r/d2)}`}
 return path;
}
class Heap{
 constructor(){this.a=[]}push(item){const a=this.a;a.push(item);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].score<=item.score)break;a[i]=a[p];i=p}a[i]=item}pop(){const a=this.a,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let j=i*2+1;if(j+1<a.length&&a[j+1].score<a[j].score)j++;if(last.score<=a[j].score)break;a[i]=a[j];i=j}a[i]=last}return first}get length(){return this.a.length}
}
function createRouter(positions,metrics){
 const boxes=[],grid=new Map(),cache=new Map();
 for(const [id,p] of positions){const m=metrics.get(id);if(!m)continue;const box=rect(id,p,m);boxes.push(box);for(let x=Math.floor(box.left/CELL);x<=Math.floor(box.right/CELL);x++)for(let y=Math.floor(box.top/CELL);y<=Math.floor(box.bottom/CELL);y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(box)}}
 const unique=values=>[...new Set(values)].sort((a,b)=>a-b),baseX=unique(boxes.flatMap(r=>[r.left-1,r.right+1])),baseY=unique(boxes.flatMap(r=>[r.top-1,r.bottom+1]));
 function near(values,mid){let lo=0,hi=values.length;while(lo<hi){const at=(lo+hi)>>1;if(values[at]<mid)lo=at+1;else hi=at}let left=lo-1,right=lo;const result=[];while(result.length<20&&(left>=0||right<values.length)){if(right>=values.length||(left>=0&&mid-values[left]<=values[right]-mid))result.push(values[left--]);else result.push(values[right++])}return result}
 function ports(id){const p=positions.get(id),m=metrics.get(id),x=p.x+m.iconX,y=p.y;return [
  {at:{x,y:y-m.r-1},guard:{x,y:Math.min(y-m.r-16,p.y-m.h/2-CLEARANCE-2)}},
  {at:{x,y:y+m.r+1},guard:{x,y:Math.max(y+m.r+16,p.y+m.h/2+CLEARANCE+2)}},
  {at:{x:x-m.r-1,y},guard:{x:Math.min(x-m.r-16,p.x-m.w/2-CLEARANCE-2),y}}
 ]}
 function solve(edge){
  if(!positions.has(edge.source)||!positions.has(edge.target)||!metrics.has(edge.source)||!metrics.has(edge.target))return [];
  const ids=new Set([edge.source,edge.target]),endpoints=[...ids].map(id=>({id,p:positions.get(id),m:metrics.get(id)})),labels=endpoints.map(({id,p,m})=>label(id,p,m)),symbols=endpoints.map(({id,p,m})=>({id,left:p.x+m.iconX-m.r-2,right:p.x+m.iconX+m.r+2,top:p.y-m.r-2,bottom:p.y+m.r+2}));
  function clear(a,b,includeSymbols=true,endpointOnly=false){
   for(const box of labels)if(intersects(a,b,box))return false;
   if(includeSymbols)for(const box of symbols)if(intersects(a,b,box))return false;
   if(endpointOnly)return true;
   const seen=new Set();for(let x=Math.floor(Math.min(a.x,b.x)/CELL);x<=Math.floor(Math.max(a.x,b.x)/CELL);x++)for(let y=Math.floor(Math.min(a.y,b.y)/CELL);y<=Math.floor(Math.max(a.y,b.y)/CELL);y++)for(const box of grid.get(x+','+y)||[]){if(ids.has(box.id)||seen.has(box.id))continue;seen.add(box.id);if(intersects(a,b,box))return false}return true;
  }
  const source=ports(edge.source),target=ports(edge.target);
  if(edge.source===edge.target){const a=source[0],b=source[2];return simplify([a.at,a.guard,{x:b.guard.x,y:a.guard.y},b.guard,b.at])}
  const dense=boxes.length>160;
  let best=null,bestCost=Infinity;
  const cost=points=>points.slice(1).reduce((sum,p,i)=>sum+Math.abs(p.x-points[i].x)+Math.abs(p.y-points[i].y),0)+(points.length-2)*18;
  function accept(a,b,middle,endpointOnly=false){const full=simplify([a.at,...middle,b.at]),value=cost(full);if(value>=bestCost)return;if(!clear(a.at,a.guard,false,endpointOnly)||!clear(b.guard,b.at,false,endpointOnly))return;for(let i=1;i<middle.length;i++)if(!clear(middle[i-1],middle[i],true,endpointOnly))return;best=full;bestCost=value}
  function quick(a,b,endpointOnly=false){
   const s=a.guard,t=b.guard,mx=(s.x+t.x)/2,my=(s.y+t.y)/2;accept(a,b,[s,{x:t.x,y:s.y},t],endpointOnly);accept(a,b,[s,{x:s.x,y:t.y},t],endpointOnly);
   accept(a,b,[s,{x:mx,y:s.y},{x:mx,y:t.y},t],endpointOnly);accept(a,b,[s,{x:s.x,y:my},{x:t.x,y:my},t],endpointOnly);
  }
  for(const a of source)for(const b of target)quick(a,b,dense);
  if(best)return best;
  const local=[...labels,...symbols],xs=unique([...(dense?[]:baseX),...local.flatMap(r=>[r.left-1,r.right+1])]),ys=unique([...(dense?[]:baseY),...local.flatMap(r=>[r.top-1,r.bottom+1])]),from=positions.get(edge.source),to=positions.get(edge.target),corridorX=near(xs,(from.x+to.x)/2),corridorY=near(ys,(from.y+to.y)/2);
  function simple(a,b,endpointOnly=false){
   const s=a.guard,t=b.guard;
   for(const x of corridorX)accept(a,b,[s,{x,y:s.y},{x,y:t.y},t],endpointOnly);
   for(const y of corridorY)accept(a,b,[s,{x:s.x,y},{x:t.x,y},t],endpointOnly);
  }
  for(const a of source)for(const b of target)simple(a,b,dense);
  if(best)return best;
  // Only difficult small/medium graphs need grid search; never build a Cartesian graph.
  if(boxes.length<=160){
   for(const a of source)for(const b of target){
    if(!clear(a.at,a.guard,false)||!clear(b.guard,b.at,false))continue;
    const sx=unique([...xs,a.guard.x,b.guard.x]),sy=unique([...ys,a.guard.y,b.guard.y]),nx=sx.length,ix=sx.indexOf(a.guard.x),iy=sy.indexOf(a.guard.y),tx=sx.indexOf(b.guard.x),ty=sy.indexOf(b.guard.y),heap=new Heap(),distance=new Map(),previous=new Map();
    const key=(x,y,d)=>(y*nx+x)*3+d,start=key(ix,iy,0);distance.set(start,0);heap.push({x:ix,y:iy,d:0,key:start,score:0,g:0});let found=null,steps=0;
    while(heap.length&&steps++<3500){const q=heap.pop();if(q.g!==distance.get(q.key))continue;if(q.x===tx&&q.y===ty){found=q;break}for(const [dx,dy,d] of [[1,0,1],[-1,0,1],[0,1,2],[0,-1,2]]){const x=q.x+dx,y=q.y+dy;if(x<0||x>=sx.length||y<0||y>=sy.length||!clear({x:sx[q.x],y:sy[q.y]},{x:sx[x],y:sy[y]}))continue;const k=key(x,y,d),g=q.g+Math.abs(sx[x]-sx[q.x])+Math.abs(sy[y]-sy[q.y])+(q.d&&q.d!==d?18:0);if(g>=(distance.get(k)??Infinity))continue;distance.set(k,g);previous.set(k,q);heap.push({x,y,d,key:k,g,score:g+Math.abs(sx[x]-b.guard.x)+Math.abs(sy[y]-b.guard.y)})}}
    if(found){const middle=[];let current=found;while(current){middle.push({x:sx[current.x],y:sy[current.y]});current=previous.get(current.key)}accept(a,b,middle.reverse())}
   }
  }
  if(best)return best;
  // Dense overviews still retain every connector and protect both endpoint labels.
  for(const a of source)for(const b of target)simple(a,b,true);
  return best||[source[0].at,source[0].guard,target[0].guard,target[0].at];
 }
 const points=edge=>{const key=edge.source+'\0'+edge.target;if(!cache.has(key))cache.set(key,solve(edge));return cache.get(key)};
 return {points,path:edge=>svgPath(points(edge))};
}
window.UOSGraphRouting={createRouter,route:(edge,positions,metrics)=>createRouter(positions,metrics).path(edge)};
})();
