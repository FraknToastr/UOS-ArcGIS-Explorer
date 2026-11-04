/* Deterministic SVG graph geometry. No framework, force timer or discarded nodes. */
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
    let end=Math.max(1,low);
    if(out.length<lines-1){
      const breaks=[...rest.slice(0,end+1).matchAll(/[\s_-]+/g)].map(match=>match.index+(match[0].trim()?match[0].length:0));
      const boundary=breaks.at(-1);if(boundary>end*.35)end=boundary;
    }
    out.push(rest.slice(0,end).trimEnd()+(out.length===lines-1?'…':''));rest=rest.slice(end).trimStart();
  }
  return out.length?out:['Untitled resource'];
}
function metric(node,width,selected,measure){
  const offset=selected?48:34,w=clamp(measure(String(node.title||''),14,selected?600:500)+offset+12,selected?212:164,width+(selected?24:0));
  const lines=wrap(node.title,w-offset-9,selected?3:2,value=>measure(value,14,selected?600:500));
  const subtitle=wrap(node.type||node.kind,w-offset-9,1,value=>measure(value,11.5,400))[0];
  return {w,h:Math.max(selected?72:54,lines.length*17+26),lines,subtitle,iconX:-w/2+(selected?23:16),textX:-w/2+offset,r:selected?18:node.kind==='experience'?14:node.kind==='service'?12:10};
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
// Expand positions, never text or symbols. If the graph cannot fit at native size,
// expand the shorter axis before the camera scales down the complete overview.
function fillViewport(positions,metrics,width,height){
  if(positions.size<2)return;
  let b=bounds(positions,metrics);
  const k=Math.min(1,width/Math.max(1,b.width),height/Math.max(1,b.height));
  for(const [axis,extent,size] of [['x','width',width/k],['y','height',height/k]]){
    if(b[extent]>=size-1)continue;
    const initial=new Map([...positions].map(([id,p])=>[id,p[axis]]));
    if(Math.max(...initial.values())-Math.min(...initial.values())<1)continue;
    let low=1,high=2;
    const apply=factor=>{for(const [id,p] of positions)p[axis]=initial.get(id)*factor;return bounds(positions,metrics)[extent]};
    while(apply(high)<size&&high<65536)high*=2;
    for(let step=0;step<24;step++){const mid=(low+high)/2;if(apply(mid)<size)low=mid;else high=mid}
    apply(high);b=bounds(positions,metrics);
  }
}
function fit(geometry,width,height,padding=24){
  const b=geometry.bounds,k=Math.min(1,Math.max(.00001,(width-padding*2)/Math.max(1,b.width)),Math.max(.00001,(height-padding*2)/Math.max(1,b.height)));
  return {k,x:width/2-(b.left+b.right)/2*k,y:height/2-(b.top+b.bottom)/2*k};
}
function compute(nodes,edges,options={}){
  const width=Math.max(100,options.width||800),height=Math.max(100,options.height||600),type=options.layout||'dependency';
  const root=nodes.find(n=>n.id===options.root)||nodes.find(n=>n.id===options.selected)||[...nodes].sort(compare)[0];
  const measure=options.measure||((value,size)=>String(value).length*size*.52),positions=new Map(),metrics=new Map();
  const preset={roomy:{width:268,gap:66},balanced:{width:232,gap:36},compact:{width:200,gap:16}}[options.density]||{width:232,gap:36};
  const spacing=clamp((options.spacing||135)/({roomy:220,balanced:135,compact:72}[options.density]||135),.55,1.7);
  const gap=preset.gap*spacing,padding=24,availableW=Math.max(70,width-padding*2),availableH=Math.max(70,height-padding*2);
  for(const n of nodes)metrics.set(n.id,metric(n,preset.width,n.id===options.selected,measure));
  if(!nodes.length)return {positions,metrics,bounds:bounds(positions,metrics),layout:type};
  const maxWidth=Math.max(...[...metrics.values()].map(m=>m.w)),maxHeight=Math.max(...[...metrics.values()].map(m=>m.h));
  const ids=new Set(nodes.map(n=>n.id)),byId=new Map(nodes.map(n=>[n.id,n]));
  const neighbours=new Map(nodes.map(n=>[n.id,[]]));
  for(const e of edges)if(ids.has(e.source)&&ids.has(e.target)&&e.source!==e.target){
    neighbours.get(e.source).push(e.target);neighbours.get(e.target).push(e.source);
  }
  for(const list of neighbours.values())list.sort((a,b)=>compare(byId.get(a),byId.get(b)));
  const placeColumn=(items,x,rowGap=gap)=>{
    let total=items.reduce((sum,n)=>sum+metrics.get(n.id).h,0)+Math.max(0,items.length-1)*rowGap,y=-total/2;
    for(const n of items){const m=metrics.get(n.id);positions.set(n.id,{x,y:y+m.h/2});y+=m.h+rowGap}
  };
  if(type==='radial'){
    // A breadth-first tree gives each direct neighbour its own angular sector.
    // Shared resources follow their nearest branch and cycles never add copies.
    const parent=new Map([[root.id,null]]),hops=new Map([[root.id,0]]),children=new Map(nodes.map(n=>[n.id,[]])),queue=[root.id];
    for(let at=0;at<queue.length;at++){
      const id=queue[at];
      for(const next of neighbours.get(id))if(!parent.has(next)){
        parent.set(next,id);hops.set(next,hops.get(id)+1);children.get(id).push(next);queue.push(next);
      }
    }
    const detached=nodes.filter(n=>!parent.has(n.id)).sort(compare);
    for(const node of detached){parent.set(node.id,root.id);hops.set(node.id,Math.max(2,...hops.values()));children.get(root.id).push(node.id);queue.push(node.id)}
    const weights=new Map();
    for(const id of [...queue].reverse())weights.set(id,Math.max(1,children.get(id).reduce((sum,next)=>sum+(weights.get(next)||1),0)));
    const angles=new Map(),sectors=new Map(),assign=[{id:root.id,start:-Math.PI/2,end:Math.PI*1.5}];
    for(let at=0;at<assign.length;at++){
      const {id,start,end}=assign[at],list=children.get(id),total=list.reduce((sum,next)=>sum+weights.get(next),0);let cursor=start;
      for(const next of list){const span=(end-start)*weights.get(next)/Math.max(1,total),mid=cursor+span/2;angles.set(next,mid);sectors.set(next,span);assign.push({id:next,start:cursor,end:cursor+span});cursor+=span}
    }
    positions.set(root.id,{x:0,y:0});
    const stretch=clamp(availableW/availableH,.6,2.4),step=Math.max(112,maxHeight+gap),first=Math.max(130,maxWidth*.52+gap*.35);
    const cells=new Map(),cellW=maxWidth+gap,cellH=maxHeight+gap;
    const range=(p,m)=>({l:Math.floor((p.x-m.w/2-gap/2)/cellW),r:Math.floor((p.x+m.w/2+gap/2)/cellW),t:Math.floor((p.y-m.h/2-gap/2)/cellH),b:Math.floor((p.y+m.h/2+gap/2)/cellH)});
    function insert(id,p){const area=range(p,metrics.get(id));for(let x=area.l;x<=area.r;x++)for(let y=area.t;y<=area.b;y++){const key=x+','+y;if(!cells.has(key))cells.set(key,new Set());cells.get(key).add(id)}}
    function free(id,p){
      const m=metrics.get(id),area=range(p,m),seen=new Set();
      for(let x=area.l;x<=area.r;x++)for(let y=area.t;y<=area.b;y++)for(const other of cells.get(x+','+y)||[]){
        if(seen.has(other))continue;seen.add(other);const q=positions.get(other),n=metrics.get(other);
        if(Math.abs(q.x-p.x)<(m.w+n.w)/2+gap&&Math.abs(q.y-p.y)<(m.h+n.h)/2+gap)return false;
      }
      return true;
    }
    insert(root.id,positions.get(root.id));
    for(const id of queue.slice(1)){
      const base=first+(hops.get(id)-1)*step,angle=angles.get(id);
      let p,attempt=0;
      do{
        const band=Math.floor(attempt/9),slot=attempt%9,offset=slot?Math.ceil(slot/2)*(slot%2?1:-1)*Math.min(.10,(sectors.get(id)||.3)/12):0;
        const radius=base+band*step*.35;p={x:Math.cos(angle+offset)*radius*stretch,y:Math.sin(angle+offset)*radius};attempt++;
      }while(!free(id,p)&&attempt<1800);
      positions.set(id,p);insert(id,p);
    }
  }else if(options.ego&&type==='balanced'){
    positions.set(root.id,{x:0,y:0});
    const incoming=new Set(edges.filter(e=>e.target===root.id).map(e=>e.source)),outgoing=new Set(edges.filter(e=>e.source===root.id).map(e=>e.target));
    const left=[],right=[];
    for(const n of nodes.filter(n=>n.id!==root.id).sort(compare)){
      const preferLeft=incoming.has(n.id)&&!outgoing.has(n.id);
      (left.length<right.length||left.length===right.length&&preferLeft?left:right).push(n);
    }
    const rootWidth=metrics.get(root.id).w;let best=null;
    // Preserve legible text first; narrow/wrap labels and add columns before
    // resorting to a smaller camera scale for an unusually large ego network.
    for(let columns=1;columns<=Math.min(6,Math.max(left.length,right.length));columns++)for(const rowGap of [gap,Math.min(gap,24),Math.min(gap,12),6]){
      const cardWidth=clamp((availableW-rootWidth-2*columns*rowGap)/(2*columns),132,preset.width),rows=Math.ceil(Math.max(left.length,right.length)/columns);
      const projectedW=rootWidth+2*columns*(cardWidth+rowGap),projectedH=rows*60+(rows-1)*rowGap;
      const scale=Math.min(1,availableW/projectedW,availableH/projectedH),score=scale*100+cardWidth*.015+rowGap*.025;
      if(!best||score>best.score)best={columns,cardWidth,rowGap,score};
    }
    if(best){
      for(const n of nodes)if(n.id!==root.id)metrics.set(n.id,metric(n,best.cardWidth,false,measure));
      for(const [items,sign] of [[left,-1],[right,1]]){
        const rows=Math.ceil(items.length/best.columns);
        for(let col=0;col<best.columns;col++)if(rows){
          placeColumn(items.slice(col*rows,(col+1)*rows),sign*(rootWidth/2+best.rowGap+best.cardWidth/2+col*(best.cardWidth+best.rowGap)),best.rowGap);
        }
      }
    }
  }else if(type==='balanced'){
    const levels=depth(nodes,edges),ordered=[...nodes].sort((a,b)=>(levels.get(a.id)-levels.get(b.id))||compare(a,b));
    // Choose columns by available aspect ratio, then spread centres to its edges.
    let columns=1,best=-Infinity;
    for(let c=1;c<=Math.min(nodes.length,32);c++){
      const rows=Math.ceil(nodes.length/c),w=c*maxWidth+(c-1)*gap,h=rows*maxHeight+(rows-1)*gap;
      const scale=Math.min(1,availableW/w,availableH/h),score=scale*100-Math.abs(Math.log((w/h)/(availableW/availableH)));
      if(score>best){best=score;columns=c}
    }
    const rows=Math.ceil(nodes.length/columns);
    for(let col=0;col<columns;col++)placeColumn(ordered.slice(col*rows,(col+1)*rows),(col-(columns-1)/2)*(maxWidth+gap));
  }else{
    const levels=depth(nodes,edges),groups=new Map();
    for(const n of nodes){const level=levels.get(n.id);if(!groups.has(level))groups.set(level,[]);groups.get(level).push(n)}
    const capacity=Math.max(1,Math.floor((availableH+gap)/(maxHeight+gap))),columns=[];
    for(const [,group] of [...groups].sort((a,b)=>a[0]-b[0])){
      group.sort(compare);for(let at=0;at<group.length;at+=capacity)columns.push(group.slice(at,at+capacity));
    }
    // Alternate barycentre ordering to reduce crossings while retaining levels.
    for(let pass=0;pass<4;pass++){
      const order=new Map(columns.flatMap(column=>column.map((node,index)=>[node.id,index])));
      for(const column of pass%2?[...columns].reverse():columns)column.sort((a,b)=>{
        const bary=id=>{const peers=neighbours.get(id);return peers.length?peers.reduce((sum,next)=>sum+order.get(next),0)/peers.length:order.get(id)};
        return bary(a.id)-bary(b.id)||compare(a,b);
      });
    }
    for(let col=0;col<columns.length;col++)placeColumn(columns[col],col*(maxWidth+gap));
  }
  fillViewport(positions,metrics,availableW,availableH);
  return {positions,metrics,bounds:bounds(positions,metrics),layout:type};
}
window.UOSGraphLayout={compute,bounds,wrap,depth,fit};
})();
