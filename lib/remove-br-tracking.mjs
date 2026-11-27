import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { analyzeJavaScript } from './assets.mjs';

export function cleanBrJavaScript(source) {
  const edits = [];
  const bodies = {
    St:'return false;', Ct:'return "";', wt:'return {};', Tt:'return {};',
    Jn:'qn={...e};', Yn:'return qn;', Kn:'return "";',
    Et:'return null;', Dt:'', Ot:'', kt:'', j:'', At:'', jt:'', Mt:'', Nt:'', Pt:'', Lt:'', Rt:'', zt:'',
    Gn:'return false;', Zn:'return undefined;',
    Qn:'const value={email:e.email,optin:false};Jn(value);return value;',
    $n:'', er:'', tr:'', nr:'return e;',
    ur:'rr=true;', br:'if(!window.fbq||sr)return;sr=true;cr.splice(0).forEach(yr);',
    dr:'', fr:'return false;', mr:'', gr:'',
    wr:'if(e==="ViewContent"||e==="InitiateCheckout")Cr({kind:"track",name:e,params:t});', Tr:'',
    Dr:'try{const params={};new URLSearchParams(e||window.location.search).forEach((value,key)=>{if(Er.test(key)&&value)params[key]=value});if(Object.keys(params).length)ze("session",Ve.utm,{...(Re("session",Ve.utm)||{}),...params})}catch{}',
    Or:'const params={...(Re("session",Ve.utm)||{})};try{new URLSearchParams(window.location.search).forEach((value,key)=>{if(Er.test(key)&&value)params[key]=value})}catch{}return params;',
    kr:'try{const url=new URL(w.checkoutUrl);for(const [key,value] of Object.entries(Or()))if(!url.searchParams.has(key))url.searchParams.set(key,value);return e?Ar(url.toString(),e):url.toString()}catch{return w.checkoutUrl}',
    Mr:'return e;',
    Pr:'if(Nr)return;Nr=true;window.setTimeout(()=>{Nr=false},2500);try{wr("InitiateCheckout",{content_name:w.productName,value:t?.price??w.price,currency:"BRL",position:e})}catch{}let url=kr();if(t)url=Ar(url,t.code);ze("session",Ve.backToOffer,Date.now());window.setTimeout(()=>window.location.assign(url),sr?180:0);',
    Fr:'Dr();window.addEventListener("pageshow",()=>{Nr=false;Dr()});br();wr("ViewContent",{content_name:w.productName,content_category:new URLSearchParams(window.location.search).get("ver")==="oferta"?"offer":"quiz",value:w.price,currency:"BRL"});'
  };
  const returnOffer=source.match(/function Ar\(e,t\)\{if\(t===`z752258y`\)return `([^`]+)`;/)?.[1];
  if(returnOffer)bodies.Ar='try{const url=new URL(t==="z752258y"?'+JSON.stringify(returnOffer)+':e);for(const [key,value] of Object.entries(Or()))if(!url.searchParams.has(key))url.searchParams.set(key,value);if(t!=="z752258y")url.searchParams.set("off",t);return url.toString()}catch{return e}';
  const info=analyzeJavaScript(source);
  // Only application-level declarations: never React internals with the same short names.
  const top = info.nodes.filter(n=>n.type==='Program')[0];
  if(!top)throw new Error('Missing program AST');
  const found=new Set();
  for(const node of top.body) if(node.type==='FunctionDeclaration' && Object.hasOwn(bodies,node.id.name)){
    edits.push({start:node.body.start,end:node.body.end,text:'{'+bodies[node.id.name]+'}'});
    found.add(node.id.name);
  }
  for(const name of Object.keys(bodies))if(!found.has(name))throw new Error('Tracking function changed: '+name);
  for(const node of info.nodes) if(node.type==='Property'){
    const key=node.key?.name??node.key?.value;
    const value=node.value;
    const text=source.slice(value.start,value.end);
    if(key==='metaPixelId')edits.push({start:value.start,end:value.end,text:'"1200409882408830"'});
    if(key==='cookieConsent')edits.push({start:value.start,end:value.end,text:'false'});
    if(key==='pixelId'&&text.includes('6ad3d977f9f1c8c2e0347272'))edits.push({start:value.start,end:value.end,text:'""'});
    if(key==='metaPixelIds'&&text.includes('2346168272822517'))edits.push({start:value.start,end:value.end,text:'[]'});
    if(key==='utmsScript')edits.push({start:value.start,end:value.end,text:'false'});
  }
  for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
  source=source.replace('var ht="/br/api/q"','var ht=""');
  source=source.replace('o Pixel da Meta e a Utmify medem as visitas','o Pixel da Meta mede as visitas');
  return source.replace(/t\.kind===`landing`&&!Re\(`session`,Ki\)&&\(ze\(`session`,Ki,!0\),wr\(`ViewContent`,\{content_name:w\.productName,content_category:`quiz`\}\)\)/, 'false');
}

export const metaPixelHead = "<!-- Meta Pixel Code -->\n<script id=\"ugc-meta-pixel\" data-pixel-id=\"1200409882408830\">\n!function(f,b,e,v,n,t,s)\n{if(f.fbq)return;n=f.fbq=function(){n.callMethod?\nn.callMethod.apply(n,arguments):n.queue.push(arguments)};\nif(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';\nn.queue=[];t=b.createElement(e);t.async=!0;\nt.src=v;\nt.onload=function(){document.documentElement.dataset.metaPixelStatus='loaded'};\nt.onerror=function(){document.documentElement.dataset.metaPixelStatus='blocked'};\ns=b.getElementsByTagName(e)[0];\ns.parentNode.insertBefore(t,s)}(window, document,'script',\n'https://connect.facebook.net/en_US/fbevents.js');\nfbq('init', '1200409882408830');\nfbq('track', 'PageView');\n</script>\n<!-- End Meta Pixel Code -->";
export const metaPixelNoScript = "<noscript><img height=\"1\" width=\"1\" style=\"display:none\" src=\"https://www.facebook.com/tr?id=1200409882408830&ev=PageView&noscript=1\" /></noscript>";

export const utmifyUtmsHead = "<script id=\"ugc-utmify-utms\"\n  src=\"https://cdn.utmify.com.br/scripts/utms/latest.js\"\n  data-utmify-prevent-xcod-sck\n  data-utmify-prevent-subids\n  async\n  defer\n></script>";

export const cleanupBootstrap = `<script>
(function(){
  var tracking=/^(ugc-br-(?:m|ab|email|nome|vc)-v1$|ugc-br-m-(?:force|off)$)/i;
  for(var storage of [sessionStorage,localStorage])try{for(var key of Object.keys(storage))if(tracking.test(key))storage.removeItem(key)}catch(e){}
})();
</script>`;

export async function removeBrTracking(root='site/br') {
  const assets=path.join(root,'assets');
  const names=(await readdir(assets)).filter(n=>!/-clean(?:-[a-f0-9]{12})?\.js$/.test(n));
  const entry=names.find(n=>/^index-CsqgZ4_P\.js$/.test(n));
  if(!entry)throw new Error('Expected BR application bundle missing');
  const original=await readFile(path.join(assets,entry),'utf8');
  const cleaned=cleanBrJavaScript(original);
  const version=createHash('sha256').update(cleaned).digest('hex').slice(0,12);
  const suffix='-clean-'+version+'.js';
  const next=entry.replace('.js',suffix);
  const renamed=new Map(names.filter(n=>/\.js$/.test(n)).map(n=>[n,n.replace('.js',suffix)]));
  // Every lazy chunk must import the cleaned entry, including result and brief screens.
  for(const name of names.filter(n=>/\.js$/.test(n))) {
    const file=path.join(assets,name);
    const content=name===entry?cleaned:await readFile(file,'utf8');
    let output=content;
    for(const [before,after] of renamed)output=output.replaceAll(before,after);
    await writeFile(path.join(assets,renamed.get(name)),output);
    await writeFile(file,output);
  }
  let html=await readFile(path.join(root,'index.html'),'utf8');
  html=html.replace(/<script\b[^>]*>[\s\S]*?window\.__ugcAb[\s\S]*?<\/script>/, '<script>document.documentElement.className+=" ab-landing1-a ab-result1-a";</script>');
  html=html.replace('<head>','<head>'+cleanupBootstrap+metaPixelHead+utmifyUtmsHead).replace(/<body\b[^>]*>/i, opening=>opening+metaPixelNoScript).replaceAll(entry,next);
  html=html.replace(/<script\b[^>]*src=["'][^"']*quiz-analytics\.js[^"']*["'][^>]*>[\s\S]*?<\/script>/gi,'');
  await writeFile(path.join(root,'index.html'),html);
}

