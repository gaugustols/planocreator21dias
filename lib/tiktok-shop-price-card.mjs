import assert from 'node:assert/strict';
import {analyzeJavaScript} from './assets.mjs';

export function priceCardNodes(info){
  return info.nodes.filter(n=>n.type==='FunctionDeclaration'&&['Ve','Be'].includes(n.id?.name));
}

// Retain the recovered offer card, coupon, payment icons and checkout handler.
// The reference uses its compact layout with this offer's scratch percentage.
export function customizePriceCard(source){
  const nodes=priceCardNodes(analyzeJavaScript(source));
  assert.equal(nodes.length,2,'Recovered price card and coupon not found');
  for(const node of nodes.sort((a,b)=>b.start-a.start)){
    let component=source.slice(node.start,node.end);
    const replace=(before,after)=>{assert.equal(component.split(before).length,2,'Unexpected price card binding: '+before);component=component.replace(before,after);};
    if(node.id.name==='Ve'){
      replace('compact:c=!1}){let d=','compact:c=!1}){c=e.referenceCard||c;let d=');
      replace('f=!i&&l.showAnchor&&l.anchorPrice>l.price,m=p()','f=!i&&(e.discountPercent>0||l.showAnchor)&&l.anchorPrice>l.price,m=e.discountPercent??p()');
      replace('percent:m,countdownLabel:e.countdownLabel','percent:m,countdownLabel:e.countdownLabel,countdown:e.referenceCard');
      replace('e.secure]}','(e.referenceSecure??e.secure)]}');
      replace('{"data-price":!0,className:','{"data-price":!0,style:e.referenceCard?{fontSize:"clamp(38px,14.2vw,68px)",whiteSpace:"nowrap"}:void 0,className:');
    }else{
      replace('function Be({text:e,percent:n,countdownLabel:r}){let i=q(l.countdown.enabled),a=i!==null&&i>0?De(i):``;','function Be({text:e,percent:n,countdownLabel:r,countdown:couponCountdown}){let i=q(couponCountdown??l.countdown.enabled),a=i!==null?[Math.floor(i/3600),Math.floor(i%3600/60),i%60].map(h).join(":"):``;');
    }
    source=source.slice(0,node.start)+component+source.slice(node.end);
  }
  return source;
}
