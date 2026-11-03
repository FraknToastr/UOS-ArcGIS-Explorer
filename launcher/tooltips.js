/* Shared accessible tips: legacy titles are migrated before interaction. */
(() => {
'use strict';
if(window.UOSTooltips)return;
const tip=document.createElement('div');tip.id='uos-accessible-tip';tip.setAttribute('role','tooltip');tip.hidden=true;document.body.appendChild(tip);
let owner=null,timer=0,keyboard=false,lastPoint=null;
function migrate(root){
 if(root.nodeType!==1)return;
 for(const node of [root,...root.querySelectorAll('[title],svg title')]){
  if(node.hasAttribute?.('title')){const value=node.getAttribute('title');if(value){node.dataset.tooltip=value;if(!node.textContent.trim()&&!node.hasAttribute('aria-label')&&!node.hasAttribute('aria-labelledby'))node.setAttribute('aria-label',value)}node.removeAttribute('title')}
  if(node.localName==='title'&&node.namespaceURI==='http://www.w3.org/2000/svg'){const parent=node.parentElement;if(parent){if(!parent.dataset.tooltip)parent.dataset.tooltip=node.textContent;if(!parent.hasAttribute('aria-label')&&!parent.hasAttribute('aria-labelledby'))parent.setAttribute('aria-label',node.textContent)}node.remove()}
 }
}
function hide(){clearTimeout(timer);timer=0;if(owner){const ids=(owner.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==tip.id);if(ids.length)owner.setAttribute('aria-describedby',ids.join(' '));else owner.removeAttribute('aria-describedby')}owner=null;tip.hidden=true;lastPoint=null}
function place(){
 if(!owner||!owner.isConnected){hide();return}
 const vp=window.visualViewport,left=vp?.offsetLeft||0,top=vp?.offsetTop||0,width=vp?.width||innerWidth,height=vp?.height||innerHeight;
 tip.style.maxWidth=Math.max(1,Math.min(380,width-16))+'px';tip.style.maxHeight=Math.max(1,height-16)+'px';
 const box=tip.getBoundingClientRect(),anchor=owner.getBoundingClientRect();
 let x=lastPoint?lastPoint.x+40:anchor.left,y=lastPoint?lastPoint.y+40:anchor.bottom+12;
 if(x+box.width>left+width-8)x=lastPoint?lastPoint.x-box.width-40:left+width-box.width-8;
 if(y+box.height>top+height-8)y=lastPoint?lastPoint.y-box.height-40:anchor.top-box.height-12;
 tip.style.left=Math.max(left+8,Math.min(x,left+width-box.width-8))+'px';tip.style.top=Math.max(top+8,Math.min(y,top+height-box.height-8))+'px';
}
function show(node,point,delay){hide();if(!node?.dataset.tooltip)return;owner=node;lastPoint=point;timer=setTimeout(()=>{timer=0;if(!owner?.isConnected){hide();return}tip.textContent=owner.dataset.tooltip;tip.hidden=false;const ids=new Set((owner.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));ids.add(tip.id);owner.setAttribute('aria-describedby',[...ids].join(' '));place()},delay)}
function candidate(target){return target?.closest?.('[data-tooltip]')}
document.addEventListener('pointerover',event=>{const node=candidate(event.target);if(node&&(!owner||owner!==node))show(node,{x:event.clientX,y:event.clientY},250)});
document.addEventListener('pointermove',event=>{if(owner&&owner.contains(event.target)){lastPoint={x:event.clientX,y:event.clientY};if(!tip.hidden)place()}});
document.addEventListener('pointerout',event=>{if(owner&&!owner.contains(event.relatedTarget))hide()});
document.addEventListener('pointerdown',()=>{keyboard=false;hide()},true);
document.addEventListener('keydown',event=>{keyboard=true;if(event.key==='Escape')hide()},true);
document.addEventListener('focusin',event=>{if(keyboard)show(candidate(event.target),null,0)});
document.addEventListener('focusout',hide);
document.addEventListener('scroll',hide,true);window.addEventListener('blur',hide);window.addEventListener('pagehide',hide);window.addEventListener('resize',hide);window.visualViewport?.addEventListener('resize',hide);
document.addEventListener('visibilitychange',()=>{if(document.hidden)hide()});
migrate(document.body);
new MutationObserver(records=>{if(owner&&!owner.isConnected)hide();for(const record of records){if(record.type==='attributes')migrate(record.target);else for(const node of record.addedNodes)if(node!==tip)migrate(node)}}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['title']});
window.UOSTooltips={hide};
})();
