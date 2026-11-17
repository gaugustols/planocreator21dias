import assert from 'node:assert/strict';
import {analyzeJavaScript} from './assets.mjs';

const key=p=>p.key?.name??p.key?.value;
const textValue=n=>n?.value??n?.quasis?.[0]?.value.cooked;
export function stickyBarNode(info){
  return info.nodes.find(n=>n.type==='FunctionDeclaration'&&n.id?.name==='rt'&&n.params[0]?.type==='ObjectPattern'&&['label','calm'].every(k=>n.params[0].properties.some(p=>key(p)===k)));
}

// Customize only the recovered sticky bar. Its visibility observer, checkout
// destination, click handler and arrow icon stay in the original component.
export function customizeStickyBar(source){
  const info=analyzeJavaScript(source),node=stickyBarNode(info);
  assert.ok(node,'Recovered sticky offer bar not found');
  let component=source.slice(node.start,node.end);
  const replace=(before,after)=>{assert.equal(component.split(before).length,2,'Unexpected sticky bar binding: '+before);component=component.replace(before,after);};
  const priceColumn=info.nodes.find(n=>n.start>=node.start&&n.end<=node.end&&n.type==='CallExpression'&&textValue(n.arguments[0])==='span'&&n.arguments[1]?.type==='ObjectExpression'&&n.arguments[1].properties.some(p=>key(p)==='className'&&textValue(p.value)==='flex shrink-0 flex-col leading-none'));
  assert.ok(priceColumn,'Recovered sticky price column not found');
  const originalPrice=source.slice(priceColumn.start,priceColumn.end);
  replace('function rt({label:e,calm:t=!1}){','function rt({label:e,calm:t=!1}){let{content:stickyContent}=j(),stickySpec=stickyContent.offer.stickyBar||{},stickyRemaining=q(!!stickySpec.countdown&&!t),stickySeconds=Math.max(0,stickyRemaining??0),stickyClock=[Math.floor(stickySeconds/3600),Math.floor(stickySeconds%3600/60),stickySeconds%60].map(h).join(":");');
  replace(originalPrice,'stickySpec.countdown&&!t?(0,K.jsxs)("span",{className:"flex shrink-0 flex-col leading-none",style:{minWidth:86},children:[(0,K.jsx)("span",{className:"font-bold text-muted",style:{fontSize:11,lineHeight:"14px",whiteSpace:"nowrap"},children:stickySpec.countdownLabel}),(0,K.jsx)("span",{role:"timer","aria-live":"off","data-testid":"sticky-offer-timer",className:"tabular font-extrabold text-coral-600",style:{fontSize:24,lineHeight:"26px"},children:stickyClock})]}):'+originalPrice);
  replace('{"aria-hidden":!n,className:','{"aria-hidden":!n,"data-testid":"sticky-offer-bar",style:{background:"#fff",borderBottom:"1px solid #f0386b",boxShadow:"0 -8px 30px rgba(42,14,47,.08)",paddingBottom:"env(safe-area-inset-bottom, 0px)"},className:');
  replace(' mx-auto max-w-[480px] px-3 pb-cta-bar transition-',' mx-auto max-w-[480px] transition-');
  replace('className:`flex items-center gap-3 rounded-[22px] bg-paper/95 p-2.5 pl-4 shadow-[0_-10px_40px_-12px_rgb(42_14_47/0.45)] ring-1 ring-line backdrop-blur`','className:"flex items-center gap-3",style:{padding:"6px 8px 6px 14px",justifyContent:"space-between"}');
  replace('className:`flex-1`,icon:','className:"shrink-0",style:{minHeight:44,height:44,width:204,maxWidth:"calc(100% - 100px)",padding:"0 12px",fontSize:"clamp(12px,3.8vw,15px)",borderRadius:18,whiteSpace:"nowrap",flex:"0 1 204px",gap:8},icon:');
  replace('children:e})','children:stickySpec.label||e})');
  return source.slice(0,node.start)+component+source.slice(node.end);
}
