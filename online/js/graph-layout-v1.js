/* V1 screenshot-era layouts: original geometry, label metrics and viewport fitting. */
(() => {
'use strict';
const rank={experience:0,webmap:1,webscene:1,service:2,layer:3,table:4,other:5};
const compare=(a,b)=>(rank[a.kind]??5)-(rank[b.kind]??5)||String(a.title).localeCompare(String(b.title))||a.id.localeCompare(b.id);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function wrap(text,width,lines,measure){
  let rest=String(text||''),out=[];
  while(rest&&out.length<lines){
    if(measure(rest)<=width){out.push(rest);rest='';break}
    let low=0,high=rest.length;while(low<high){const mid=Math.ceil((low+high)/2);if(measure(rest.slice(0,mid)+'…')<=width)low=mid;else high=mid-1}
    let end=Math.max(1,low);if(out.length<lines-1){const space=rest.lastIndexOf(' ',end);if(space>end*.45)end=space}
    out.push(rest.slice(0,end).trimEnd()+(out.length===lines-1?'…':''));rest=rest.slice(end).trimStart();
  }
  return out.length?out:['Untitled resource'];
}
function metric(node,width,selected,measure){
  const w=selected?Math.max(188,width+35):width,offset=selected?45:30;
  const lines=wrap(node.title,w-offset-9,selected?3:2,value=>measure(value,14,selected?600:500));
  const subtitle=wrap(node.type||node.kind,w-offset-9,1,value=>measure(value,11.5,400))[0];
  return {w,h:Math.max(selected?72:54,lines.length*17+24),lines,subtitle,iconX:-w/2+(selected?21:14),textX:-w/2+offset,r:selected?20:node.kind==='experience'?16:node.kind==='service'?14:11};
}
function depth(nodes,edges){
  const ids=new Set(nodes.map(n=>n.id)),adj=new Map(nodes.map(n=>[n.id,[]]));for(const e of edges)if(ids.has(e.source)&&ids.has(e.target))adj.get(e.source).push(e.target);
  let serial=0;const index=new Map(),low=new Map(),stack=[],on=new Set(),component=new Map(),groups=[];
  function visit(id){index.set(id,serial);low.set(id,serial++);stack.push(id);on.add(id);for(const to of adj.get(id)){if(!index.has(to)){visit(to);low.set(id,Math.min(low.get(id),low.get(to)))}else if(on.has(to))low.set(id,Math.min(low.get(id),index.get(to)))}if(low.get(id)===index.get(id)){let last;const group=[];do{last=stack.pop();on.delete(last);component.set(last,groups.length);group.push(last)}while(last!==id);groups.push(group)}}
  for(const n of nodes)if(!index.has(n.id))visit(n.id);
  const links=groups.map(()=>new Set()),incoming=groups.map(()=>0),level=groups.map(()=>0);
  for(const e of edges){const a=component.get(e.source),b=component.get(e.target);if(a!=null&&b!=null&&a!==b&&!links[a].has(b)){links[a].add(b);incoming[b]++}}
  const queue=[];incoming.forEach((count,i)=>{if(!count)queue.push(i)});for(let i=0;i<queue.length;i++)for(const to of links[queue[i]]){level[to]=Math.max(level[to],level[queue[i]]+1);if(!--incoming[to])queue.push(to)}
  return new Map(nodes.map(n=>[n.id,level[component.get(n.id)]||0]));
}
function bounds(positions,metrics){let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;for(const [id,p] of positions){const m=metrics.get(id);left=Math.min(left,p.x-m.w/2);right=Math.max(right,p.x+m.w/2);top=Math.min(top,p.y-m.h/2);bottom=Math.max(bottom,p.y+m.h/2)}return positions.size?{left,top,right,bottom,width:right-left,height:bottom-top}:{left:0,top:0,right:0,bottom:0,width:0,height:0}}
function compute(nodes,edges,options={}){
  const width=Math.max(100,options.width||800),height=Math.max(100,options.height||600),type=options.layout||'dependency',root=nodes.find(n=>n.id===options.root)||nodes.find(n=>n.id===options.selected)||[...nodes].sort(compare)[0];
  const measure=options.measure||((value,size)=>String(value).length*size*.52),positions=new Map(),metrics=new Map();
  const levels=depth(nodes,edges),maxDepth=Math.max(0,...levels.values());
  const depthCounts=new Map();for(const value of levels.values())depthCounts.set(value,(depthCounts.get(value)||0)+1);
  const dependencyRows=Math.max(3,Math.floor((height-48)/62)),dependencyColumns=[...depthCounts.values()].reduce((sum,count)=>sum+Math.ceil(count/dependencyRows),0);
  const densityScale=clamp(Number(options.densityScale)||1,.62,1.3);
  let nodeWidth=type==='radial'?clamp((width-48)/7.5*densityScale,96,168):type==='balanced'?clamp(Math.sqrt(width*height/Math.max(1,nodes.length))*1.25*densityScale,112,188):clamp((width-48-22*Math.max(0,dependencyColumns-1)-80)/Math.max(1,dependencyColumns)*densityScale,96,190);
  if(options.ego)nodeWidth=clamp((width/2-120)/2-14,128,188);
  for(const n of nodes)metrics.set(n.id,metric(n,nodeWidth,n.id===options.selected,measure));
  const maxHeight=Math.max(54,...[...metrics.values()].map(m=>m.h)),gap=clamp(8*(options.spacing||135)/135,4,18);
  const placeColumn=(items,x)=>{let total=items.reduce((sum,n)=>sum+metrics.get(n.id).h,0)+Math.max(0,items.length-1)*gap,y=-total/2;for(const n of items){const m=metrics.get(n.id);positions.set(n.id,{x,y:y+m.h/2});y+=m.h+gap}};
  if(!nodes.length)return {positions,metrics,bounds:bounds(positions,metrics),layout:type};
  if(type==='radial'){
    positions.set(root.id,{x:0,y:0});
    const remaining=nodes.filter(n=>n.id!==root.id).sort(compare),n=remaining.length;
    // Keep the restored preset geometry at slider=135 while making the spacing
    // slider adjust radial distances as well as the two column-based layouts.
    const presetSpacing=({roomy:220,balanced:135,compact:72})[options.density]||135;
    const spacingScale=Math.sqrt(clamp((options.spacing||presetSpacing)/presetSpacing,.55,1.7));
    const scale=clamp(Number(options.densityScale)||1,.62,1.3)*spacingScale,rx=Math.max(130,(width-nodeWidth)/2-24)*scale,ry=Math.max(100,(height-maxHeight)/2-24)*scale;
    const cells=new Map(),cellW=nodeWidth+gap,cellH=60;
    const ranges=(p,m)=>({a:Math.floor((p.x-m.w/2-5)/cellW),b:Math.floor((p.x+m.w/2+5)/cellW),c:Math.floor((p.y-m.h/2-5)/cellH),d:Math.floor((p.y+m.h/2+5)/cellH)});
    function insert(id,p){const r=ranges(p,metrics.get(id));for(let x=r.a;x<=r.b;x++)for(let y=r.c;y<=r.d;y++){const key=x+','+y;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(id)}}
    function free(id,p){const m=metrics.get(id),r=ranges(p,m),seen=new Set();for(let x=r.a;x<=r.b;x++)for(let y=r.c;y<=r.d;y++)for(const other of cells.get(x+','+y)||[]){if(seen.has(other))continue;seen.add(other);const q=positions.get(other),s=metrics.get(other);if(Math.abs(p.x-q.x)<(m.w+s.w)/2+9&&Math.abs(p.y-q.y)<(m.h+s.h)/2+9)return false}return true}
    insert(root.id,{x:0,y:0});
    const ringCount=Math.max(2,Math.ceil(Math.sqrt(n/12)));let at=0;
    for(let ring=0;at<n;ring++){
      const fraction=ring<ringCount?(.55+.45*ring/Math.max(1,ringCount-1)):1+(ring-ringCount+1)*.27;
      const quota=ring<ringCount?Math.ceil(n*(ring===0?.35:.65/Math.max(1,ringCount-1))):n-at;
      let placed=0;
      for(let slot=0;slot<quota&&at<n;slot++){
        const node=remaining[at],angle=-Math.PI/2+slot/Math.max(1,quota)*Math.PI*2;
        let found=null;for(let attempt=0;attempt<180;attempt++){const offset=(attempt%2?1:-1)*Math.ceil(attempt/2)*Math.PI/180,a=angle+offset,p={x:Math.cos(a)*rx*fraction,y:Math.sin(a)*ry*fraction};if(free(node.id,p)){found=p;break}}
        if(found){positions.set(node.id,found);insert(node.id,found);at++;placed++}
      }
      if(!placed&&ring>ringCount+50)throw Error('Could not place radial graph');
    }
  }else if(options.ego&&root&&type==='balanced'){
    const rootM=metrics.get(root.id);positions.set(root.id,{x:0,y:0});
    const incoming=new Set(edges.filter(e=>e.target===root.id).map(e=>e.source)),outgoing=new Set(edges.filter(e=>e.source===root.id).map(e=>e.target));
    const left=[],right=[];let leftHeight=0,rightHeight=0;
    for(const n of nodes.filter(n=>n.id!==root.id).sort(compare)){const preferLeft=incoming.has(n.id)&&!outgoing.has(n.id),h=metrics.get(n.id).h+gap;if(leftHeight<rightHeight||(leftHeight===rightHeight&&preferLeft)){left.push(n);leftHeight+=h}else{right.push(n);rightHeight+=h}}
    const half=Math.max(150,width/2-rootM.w/2-30),columns=Math.max(1,Math.floor((half+16)/(nodeWidth+16)));
    for(const [items,sign] of [[left,-1],[right,1]]){
      const rows=Math.max(1,Math.ceil(items.length/columns));
      for(let col=0;col<columns;col++){const group=items.slice(col*rows,(col+1)*rows);if(group.length)placeColumn(group,sign*(rootM.w/2+22+nodeWidth/2+col*(nodeWidth+18)))}
    }
  }else if(type==='balanced'){
    const ordered=[...nodes].sort((a,b)=>(levels.get(a.id)-levels.get(b.id))||compare(a,b));
    const columns=clamp(Math.round(Math.sqrt(nodes.length*width/height*maxHeight/nodeWidth)),1,Math.max(1,nodes.length)),rows=Math.ceil(nodes.length/columns);
    for(let col=0;col<columns;col++)placeColumn(ordered.slice(col*rows,(col+1)*rows),(col-(columns-1)/2)*(nodeWidth+22));
  }else{
    const groups=new Map();for(const n of nodes){const level=levels.get(n.id);if(!groups.has(level))groups.set(level,[]);groups.get(level).push(n)}
    let x=0;for(const [level,group] of [...groups].sort((a,b)=>a[0]-b[0])){group.sort(compare);for(let at=0;at<group.length;at+=dependencyRows){const part=group.slice(at,at+dependencyRows),w=Math.max(...part.map(n=>metrics.get(n.id).w));placeColumn(part,x+w/2);x+=w+22}}
  }
  // The last V1 revision expanded the shorter axis of non-radial layouts.
  if(type!=='radial'&&positions.size>1){
    const current=bounds(positions,metrics),actual=current.width/Math.max(1,current.height),desired=width/Math.max(1,height);
    let sx=1,sy=1;if(actual>desired)sy=actual/desired;else sx=desired/Math.max(.01,actual);
    for(const p of positions.values()){p.x*=sx;p.y*=sy}
  }
  return {positions,metrics,bounds:bounds(positions,metrics),layout:type};
}
function fit(geometry,width,height,options={}){
  const b=geometry.bounds,pad=14;
  let w=b.width,h=b.height,cx=(b.left+b.right)/2,cy=(b.top+b.bottom)/2;
  const root=options.root||options.selected;
  if(options.ego&&geometry.layout!=='dependency'&&geometry.positions.has(root)){
    const p=geometry.positions.get(root);cx=p.x;cy=p.y;
    w=2*Math.max(Math.abs(b.left-cx),Math.abs(b.right-cx));
    h=2*Math.max(Math.abs(b.top-cy),Math.abs(b.bottom-cy));
  }
  const k=Math.max(.00001,Math.min(2.4,(width-pad*2)/Math.max(1,w),(height-pad*2)/Math.max(1,h)));
  return {k,x:width/2-cx*k,y:height/2-cy*k};
}
function path(edge,positions,metrics){
  const a=positions.get(edge.source),b=positions.get(edge.target),am=metrics.get(edge.source),bm=metrics.get(edge.target);
  if(!a||!b||!am||!bm)return '';
  const ax=a.x+am.iconX,ay=a.y,bx=b.x+bm.iconX,by=b.y;
  if(edge.source===edge.target)return `M${ax+am.r},${ay} C${ax+70},${ay-80} ${ax-70},${ay-80} ${ax-am.r},${ay}`;
  const distance=Math.max(1,Math.hypot(bx-ax,by-ay)),dx=(bx-ax)/distance,dy=(by-ay)/distance;
  const x1=ax+dx*(am.r+1),y1=ay+dy*(am.r+1),x2=bx-dx*(bm.r+5),y2=by-dy*(bm.r+5);
  const bend=Math.max(24,Math.abs(x2-x1)*.45),direction=x2>=x1?1:-1;
  return `M${x1},${y1} C${x1+bend*direction},${y1} ${x2-bend*direction},${y2} ${x2},${y2}`;
}
window.UOSGraphLayoutV1={compute,bounds,wrap,depth,fit,path};
})();
