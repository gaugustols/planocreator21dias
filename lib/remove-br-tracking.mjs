import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
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
    ur:'', dr:'', fr:'return false;', mr:'', hr:'return false;', gr:'', _r:'', vr:'return false;', yr:'', br:'', xr:'', Sr:'', Cr:'', wr:'', Tr:'',
    Dr:'', Or:'return {};',
    kr:'try{const url=new URL(w.checkoutUrl);for(const key of [...url.searchParams.keys()])if(/^(utm_|fbclid$|gclid$|ttclid$|msclkid$|xcod$|sck$|src$)/i.test(key))url.searchParams.delete(key);return e?Ar(url.toString(),e):url.toString()}catch{return w.checkoutUrl}',
    Mr:'return e;',
    Pr:'if(Nr)return;Nr=true;window.setTimeout(()=>{Nr=false},2500);let url=kr();if(t)url=Ar(url,t.code);ze("session",Ve.backToOffer,Date.now());window.location.assign(url);',
    Fr:'window.addEventListener("pageshow",()=>{Nr=false});'
  };
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
    if(key==='pixelId'&&text.includes('6ad3d977f9f1c8c2e0347272'))edits.push({start:value.start,end:value.end,text:'""'});
    if(key==='metaPixelIds'&&text.includes('2346168272822517'))edits.push({start:value.start,end:value.end,text:'[]'});
    if(key==='utmsScript')edits.push({start:value.start,end:value.end,text:'false'});
  }
  for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
  source=source.replace('var ht="/br/api/q"','var ht=""');
  return source.replace('ze(`session`,Ki,!0),wr(', 'wr(');
}

export const cleanupBootstrap = `<script>
(function(){
  var tracking=/^(utm_|utmify_|_fb[pc]$|fbclid$|gclid$|ttclid$|msclkid$|xcod$|sck$|src$|lead$|multiFbc$|lastExternalReferrer|ugc-br-(?:utm|m|ab|email|nome|vc)-v1$|ugc-br-m-(?:force|off)$)/i;
  try{var url=new URL(location.href);for(var key of Array.from(url.searchParams.keys()))if(tracking.test(key))url.searchParams.delete(key);history.replaceState(history.state,'',url.href)}catch(e){}
  for(var storage of [sessionStorage,localStorage])try{for(var key of Object.keys(storage))if(tracking.test(key))storage.removeItem(key)}catch(e){}
  try{var host=location.hostname.split('.');for(var name of ['_fbp','_fbc'])for(var domain of ['',...host.map(function(_,i){return '.'+host.slice(i).join('.')})])document.cookie=name+'=; Max-Age=0; path=/'+(domain?'; domain='+domain:'')}catch(e){}
})();
</script>`;

export async function removeBrTracking(root='site/br') {
  const assets=path.join(root,'assets');
  const names=(await readdir(assets)).filter(n=>!n.endsWith('-clean.js'));
  const entry=names.find(n=>/^index-CsqgZ4_P\.js$/.test(n));
  if(!entry)throw new Error('Expected BR application bundle missing');
  const original=await readFile(path.join(assets,entry),'utf8');
  const cleaned=cleanBrJavaScript(original);
  const next=entry.replace('.js','-clean.js');
  const renamed=new Map(names.filter(n=>/\.js$/.test(n)).map(n=>[n,n.replace('.js','-clean.js')]));
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
  html=html.replace('<head>','<head>'+cleanupBootstrap).replaceAll(entry,next);
  html=html.replace(/<script\b[^>]*src=["'][^"']*quiz-analytics\.js[^"']*["'][^>]*>[\s\S]*?<\/script>/gi,'');
  await writeFile(path.join(root,'index.html'),html);
}

