import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, devices } from 'playwright';
import { analyzeJavaScript, fileForUrl } from './lib/assets.mjs';

const reportDir='reports/br/original-parity';
await mkdir(reportDir,{recursive:true});
const read=async f=>JSON.parse(await readFile(f,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=await read('reports/br/mirror-manifest.json');
const mount=await read('reports/br/mount-manifest.json');
const copy=await read('content/br-landing.json');
const recovery=await read('reports/br/crawl-summary.json');
const sourceOrigin=new URL(manifest.origin).origin;
const localOrigin='http://127.0.0.1:4173';
const live=[],assetChecks=[],moduleChecks=[],differences=[];
const buffers=new Map();
const cachedLive=process.argv.includes('--reuse-live-check')?await read(`${reportDir}/live-files.json`):null;

async function parallel(items,limit,worker){
  let index=0;
  await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(index<items.length){const i=index++;await worker(items[i],i);}}));
}

await parallel(manifest.files,8,async entry=>{
  const bytes=await readFile(entry.file), localHash=sha(bytes);
  let current;
  if(cachedLive){const old=cachedLive.files.find(f=>f.url===entry.url);if(!old?.identical)throw new Error(`No verified live checksum to reuse: ${entry.url}`);current={status:old.status,hash:old.currentHash};}
  else{
    for(let attempt=0;attempt<3;attempt++){
      try{const r=await fetch(entry.url,{cache:'no-store',signal:AbortSignal.timeout(25000)});current={status:r.status,hash:sha(Buffer.from(await r.arrayBuffer()))};break;}
      catch(e){if(attempt===2)current={status:'network-error',error:e.message};}
    }
  }
  const item={url:entry.url,file:entry.file,status:current.status,recordedHash:entry.sha256,currentHash:current.hash,localHash,identical:current.status===200&&current.hash===entry.sha256&&localHash===entry.sha256};
  live.push(item);
  if(!item.identical)differences.push({type:'live-original',...item});
  buffers.set(new URL(entry.url).pathname,{bytes,contentType:entry.contentType});
});
if(!cachedLive)await writeFile(`${reportDir}/live-files.json`,JSON.stringify({checkedAt:new Date().toISOString(),reused:false,files:live.sort((a,b)=>a.url.localeCompare(b.url))},null,2));
console.log(`Live original: ${live.filter(f=>f.identical).length}/${live.length} identical files`);
if(differences.length){await writeFile(`${reportDir}/differences.json`,JSON.stringify(differences,null,2));throw new Error('The live source or recovered originals changed; inspect differences before rendering.');}

function keyOf(p){return p.key?.name??p.key?.value;}
function contentOf(info){return info.objects.find(o=>o.data?.locale==='pt-BR'&&o.data?.landing&&o.data?.steps)?.data;}
function approvedNodes(info){
  const changes=new Map();
  const declaration=info.nodes.find(n=>n.type==='VariableDeclarator'&&n.init?.type==='ObjectExpression'&&n.init.properties.some(p=>keyOf(p)==='landing'));
  const landing=declaration?.init.properties.find(p=>keyOf(p)==='landing')?.value;
  const variants=landing?.properties.find(p=>keyOf(p)==='variants')?.value;
  const alternate=variants?.properties.find(p=>keyOf(p)==='c')?.value;
  for(const p of alternate?.properties||[])if(Object.hasOwn(copy,keyOf(p)))changes.set(p.value.start,copy[keyOf(p)]);
  return changes;
}
function canonical(node,approved){
  if(!node||typeof node!=='object')return node;
  if(Array.isArray(node))return node.map(n=>canonical(n,approved));
  if(node instanceof RegExp)return {regexp:node.source,flags:node.flags};
  if(approved.has(node.start))return {type:'StringValue',value:approved.get(node.start)};
  let value=node.type==='Literal'&&typeof node.value==='string'?node.value:node.type==='TemplateLiteral'&&!node.expressions.length?node.quasis[0].value.cooked:undefined;
  if(value!==undefined){
    if(/^ugc-br-/.test(value))value=value.replace(/^ugc-br-/,'ugc-');
    if(value==='/br/'||value.startsWith('/br/'))value=value.slice(3);
    return {type:'StringValue',value};
  }
  if(node.type==='BinaryExpression'&&node.operator==='+'&&node.left.type==='MemberExpression'&&node.left.property?.name==='origin'&&node.left.object?.type==='MemberExpression'&&node.left.object.property?.name==='location'&&node.left.object.object?.name==='globalThis'&&node.right.value==='/br/')return {type:'StringValue',value:sourceOrigin};
  return Object.fromEntries(Object.entries(node).filter(([key])=>!['start','end','raw'].includes(key)).map(([key,v])=>[key,canonical(v,approved)]));
}
let contentStrings=0,originalContent,emojiMap;
for(const entry of manifest.files){
  const pathname=new URL(entry.url).pathname;
  const generated=fileForUrl(entry.url,'site/br');
  const original=buffers.get(pathname).bytes, adapted=await readFile(generated);
  if(/\.m?js$/.test(pathname)){
    const a=analyzeJavaScript(original.toString('utf8')),b=analyzeJavaScript(adapted.toString('utf8'));
    const equal=JSON.stringify(canonical(a.ast,approvedNodes(a)))===JSON.stringify(canonical(b.ast,approvedNodes(b)));
    moduleChecks.push({file:pathname,semanticallyIdenticalExceptApprovedCopyAndMount:equal});
    if(!equal)differences.push({type:'javascript',file:pathname});
    const content=contentOf(a);
    originalContent ||= content;
    emojiMap ||= a.objects.find(o=>o.data?.mobile_phone&&o.data?.selfie)?.data;
    if(content){const stack=[content];while(stack.length){const item=stack.pop();if(typeof item==='string')contentStrings++;else if(item&&typeof item==='object')stack.push(...Object.values(item));}}
  }else if(!/\.html$/.test(entry.file)){
    const equal=sha(original)===sha(adapted);
    assetChecks.push({file:pathname,sha256:sha(adapted),identical:equal});
    if(!equal)differences.push({type:'asset',file:pathname});
  }
}
await writeFile(`${reportDir}/static-parity.json`,JSON.stringify({modules:moduleChecks,assets:assetChecks,contentStrings,approvedExceptions:['landing.variants.c.headline','landing.variants.c.subheadline'],differences},null,2));
console.log(`Static parity: ${moduleChecks.filter(m=>m.semanticallyIdenticalExceptApprovedCopyAndMount).length} modules, ${assetChecks.filter(a=>a.identical).length} unchanged assets, ${contentStrings} content strings`);
if(differences.length)throw new Error('Unexpected static content differences; inspect static-parity.json.');

function normalizeDynamicText(text,stepId){
  const clockPattern=/(?<![\d:])(?:[01]\d|2[0-3]):[0-5]\d(?![:\d])/g;
  const clocks=[...text.matchAll(clockPattern)].map(m=>m[0]);
  let normalized=text.replace(clockPattern,'[horário]');
  const scenes=originalContent.steps.find(s=>s.id===stepId)?.storyboard?.scenes;
  let sceneOrder;
  if(scenes){
    const cards=scenes.map(s=>({id:s.id,text:`${emojiMap[s.emoji]} ${s.label}`}));
    const positions=cards.map(c=>({...c,index:normalized.indexOf(c.text)}));
    if(positions.every(c=>c.index>=0&&normalized.indexOf(c.text,c.index+1)===-1)){
      const first=Math.min(...positions.map(c=>c.index));
      const last=Math.max(...positions.map(c=>c.index+c.text.length));
      let remainder=normalized.slice(first,last);
      for(const card of cards)remainder=remainder.replace(card.text,'');
      // Normalize only a region made exclusively of the same four cards.
      // Different labels, glyphs, duplicates or extra copy remain differences.
      if(!remainder.trim()){
        sceneOrder=positions.sort((a,b)=>a.index-b.index).map(c=>c.id);
        normalized=normalized.slice(0,first)+cards.map(c=>c.text).join(' | ')+normalized.slice(last);
      }
    }
  }
  return {text:normalized,clocks,sceneOrder};
}
function assess(report){
  const checks=report.checks.map(check=>{
    let contentEqual=check.textEqual;
    let dynamicText;
    if(!check.error&&!check.textEqual&&check.original&&check.local){
      const a=normalizeDynamicText(check.original.text,check.step),b=normalizeDynamicText(check.local.text,check.step);
      contentEqual=a.text===b.text;
      if(contentEqual)dynamicText={originalClocks:a.clocks,localClocks:b.clocks,originalSceneOrder:a.sceneOrder,localSceneOrder:b.sceneOrder};
    }
    return {...check,contentEqual,dynamicText};
  });
  const mismatches=checks.filter(r=>r.error||!r.contentEqual||!r.imagesEqual||!r.svgEqual);
  return {...report,rawExactMatchingScreens:checks.filter(r=>r.textEqual&&r.imagesEqual&&r.svgEqual).length,matchingScreens:checks.length-mismatches.length,dynamicVariations:checks.filter(r=>r.dynamicText).length,normalization:'Only HH:mm clock displays and permutations of the same four original storyboard cards are normalized. All other text, image references and inline SVGs must match.',mismatches,checks};
}

function disablePixels(bytes){
  let source=bytes.toString('utf8');
  const info=analyzeJavaScript(source);
  const config=info.nodes.find(n=>n.type==='VariableDeclarator'&&n.init?.type==='ObjectExpression'&&n.init.properties.some(p=>keyOf(p)==='brandName'));
  const edits=(config?.init.properties||[]).filter(p=>['metaPixelId','utmify'].includes(keyOf(p))).map(p=>({start:p.value.start,end:p.value.end,text:keyOf(p)==='utmify'?'{pixelId:"",utmsScript:false,metaPixelIds:[]}':'""'})).sort((a,b)=>b.start-a.start);
  for(const e of edits)source=source.slice(0,e.start)+e.text+source.slice(e.end);
  return Buffer.from(source);
}
const referenceCache=new Map();
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(pathname.startsWith('/api/')){res.writeHead(503);res.end();return;}
  let key=pathname==='/'?'/':pathname;
  if(key.endsWith('/index.html'))key=key.slice(0,-10);
  const entry=buffers.get(key)||(!path.posix.extname(key)?buffers.get(key.replace(/\/?$/,'/')):null);
  if(!entry){res.writeHead(404);res.end();return;}
  let body=entry.bytes;
  if(/\/assets\/index-[^/]+\.js$/.test(pathname)){
    if(!referenceCache.has(pathname))referenceCache.set(pathname,disablePixels(body));
    body=referenceCache.get(pathname);
  }
  res.writeHead(200,{'Content-Type':entry.contentType,'Cache-Control':'no-store'});res.end(body);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const referenceOrigin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
const fixedTime=Date.now(),renderChecks=[],errors=[];

async function snapshot(page){
  return page.evaluate(()=>{
    const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
    const normalizeUrl=value=>{try{const u=new URL(value,document.baseURI);return u.pathname.replace(/^\/br\//,'/');}catch{return value;}};
    const svgs=[...document.querySelectorAll('main svg')].filter(visible).map(svg=>{
      let html=svg.outerHTML;
      [...svg.querySelectorAll('[id]')].forEach((e,i)=>{const id=e.id;html=html.split(id).join(`comparison-id-${i}`);});
      return html;
    });
    const images=[...document.images].filter(visible).map(e=>({url:normalizeUrl(e.currentSrc||e.src),alt:e.alt,loaded:e.complete&&e.naturalWidth>0,width:e.naturalWidth,height:e.naturalHeight}));
    const section=document.querySelector('main [data-step]');
    return {step:section?.getAttribute('data-step'),phase:section?.getAttribute('data-phase')||'',text:document.body.innerText.replace(/\s+/g,' ').trim(),images,svgs};
  });
}
async function renderSide(scenario,reference){
  const prefix=reference?'ugc-':'ugc-br-';
  const origin=reference?referenceOrigin:localOrigin;
  const base=reference?'/':'/br/';
  const context=await browser.newContext({viewport:scenario.viewport,hasTouch:true,isMobile:true,userAgent:devices['Pixel 7'].userAgent,reducedMotion:'reduce'});
  const watchdog=setTimeout(()=>context.close().catch(()=>{}),45000);
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  // Keep calendar/clock labels fixed while leaving React's scheduler, lazy
  // imports and browser rendering on native timers.
  await page.clock.setFixedTime(fixedTime);
  await context.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(['http:','https:'].includes(u.protocol)&&u.origin!==origin){errors.push({scenario:scenario.name,side:reference?'original':'local',type:'external-request',url:u.href});return route.abort('blockedbyclient');}
    return route.continue();
  });
  page.on('pageerror',e=>errors.push({scenario:scenario.name,side:reference?'original':'local',type:'javascript',message:e.message}));
  page.on('response',r=>{if(r.status()>=400)errors.push({scenario:scenario.name,side:reference?'original':'local',type:'http',status:r.status(),url:r.url()});});
  await context.addInitScript(({prefix,state,branch})=>{
    sessionStorage.setItem(prefix+'funnel-v1',JSON.stringify(state));
    sessionStorage.setItem(prefix+'ab-v1',JSON.stringify({landing1:branch.landing+'!',result1:branch.result+'!'}));
    localStorage.setItem(prefix+'muted-v1','true');localStorage.setItem(prefix+'m-off','1');
    if(branch.index%2===0)sessionStorage.setItem(prefix+'nome-v1',JSON.stringify('Recuperacao'));
    sessionStorage.setItem(prefix+'email-v1',JSON.stringify({id:'a'.repeat(24),email:'recuperacao.teste@example.com',optin:branch.index%2===0,sent:false}));
    let random=14021;Math.random=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
  },{prefix,state:scenario.state,branch:scenario.branch});
  try {
  await page.goto(origin+(scenario.path?(reference?scenario.path:'/br'+scenario.path):base),{waitUntil:'load'});
  let ready=false;
  for(let attempt=0;attempt<300;attempt++){
    ready=await page.evaluate(step=>{
      if(step===null)return document.body.innerText.length>100;
      const section=document.querySelector('main [data-step]');
      return window.__ugcReady&&section?.getAttribute('data-step')===step&&getComputedStyle(section).visibility!=='hidden'&&document.body.innerText.length>100;
    },scenario.step);
    if(ready)break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  if(!ready)throw new Error(`The restored screen did not render: ${scenario.step}`);
  await page.evaluate(()=>document.fonts.ready);
  await new Promise(resolve=>setTimeout(resolve,30));
  await new Promise(resolve=>setTimeout(resolve,450));
  if(scenario.step==='analisi'){
    for(let attempt=0;attempt<150;attempt++){
      if(await page.locator('main [data-step]').first().getAttribute('data-phase')==='question')break;
      await new Promise(resolve=>setTimeout(resolve,50));
    }
  }
  const data=await snapshot(page);
  if(data.text.length<100)throw new Error('The page was still hidden when the snapshot was collected.');
  clearTimeout(watchdog);
  return {page,context,data};
  } catch(error) { clearTimeout(watchdog); await context.close(); throw error; }
}
const scenarios=[];
for(const result of recovery.results){
  const steps=await read(`capture_br_${result.branch.name}/steps.json`),seen=new Set();
  for(const step of steps){
    if(step.step==='landing')continue;
    const key=step.step+':'+(step.kind==='brief'?step.phase:'');
    if(seen.has(key))continue;seen.add(key);
    const stable=step.kind==='brief'&&step.phase==='delivery'?steps.filter(s=>s.step===step.step&&s.phase===step.phase).at(-1):step;
    scenarios.push({name:result.branch.name+'_'+key.replace(':','_'),branch:result.branch,viewport:result.viewport,state:stable.state,step:step.step,phase:step.kind==='brief'?step.phase:''});
  }
}
let selected=process.argv.includes('--pilot')?scenarios.filter(s=>s.branch.index===0):process.argv.includes('--full-matrix')?scenarios:scenarios.filter(s=>s.branch.index===0||s.step==='risultato');
if(!process.argv.includes('--pilot'))selected.push({name:'legal_arrependimento',branch:recovery.results[0].branch,viewport:{width:390,height:844},state:scenarios[0].state,step:null,phase:'',path:'/arrependimento/'});

try{
  await parallel(selected,1,async scenario=>{
    let sides;
    try{
      const completed=await Promise.allSettled([renderSide(scenario,true),renderSide(scenario,false)]);
      sides=completed.filter(r=>r.status==='fulfilled').map(r=>r.value);
      const failed=completed.find(r=>r.status==='rejected');
      if(failed)throw failed.reason;
      const [a,b]=sides.map(s=>s.data);
      const textEqual=a.text===b.text,imagesEqual=JSON.stringify(a.images)===JSON.stringify(b.images),svgEqual=JSON.stringify(a.svgs)===JSON.stringify(b.svgs);
      const result={scenario:scenario.name,branch:scenario.branch.name,step:scenario.step,phase:scenario.phase,viewport:scenario.viewport,textEqual,imagesEqual,svgEqual,referencePhase:a.phase,localPhase:b.phase,characters:a.text.length,visibleImages:a.images.length,visibleSvg:a.svgs.length};
      if(!textEqual||!imagesEqual||!svgEqual){
        result.original=a;result.local=b;
        await writeFile(`${reportDir}/${scenario.name}.json`,JSON.stringify(result,null,2));
        await Promise.all(sides.map((s,i)=>s.page.screenshot({path:`${reportDir}/${scenario.name}-${i?'local':'original'}.png`,fullPage:true,timeout:30000})));
      }else{
        await unlink(`${reportDir}/${scenario.name}.json`).catch(e=>{if(e.code!=='ENOENT')throw e;});
        if(scenario.branch.index===0&&['obiettivo','risultato'].includes(scenario.step))await Promise.all(sides.map((s,i)=>s.page.screenshot({path:`${reportDir}/${scenario.name}-${i?'local':'original'}.png`,fullPage:true,timeout:30000})));
        else await Promise.all(['local','original'].map(side=>unlink(`${reportDir}/${scenario.name}-${side}.png`).catch(e=>{if(e.code!=='ENOENT')throw e;})));
      }
      renderChecks.push(result);
      if(renderChecks.length%20===0){
        await writeFile(`${reportDir}/in-progress.json`,JSON.stringify({checkedAt:new Date().toISOString(),expected:selected.length,checks:renderChecks},null,2));
        console.log(`Compared ${renderChecks.length}/${selected.length} screens; ${renderChecks.filter(r=>!r.textEqual||!r.imagesEqual||!r.svgEqual).length} raw differences`);
      }
    }catch(error){renderChecks.push({scenario:scenario.name,step:scenario.step,phase:scenario.phase,error:error.message});console.error(scenario.name,error.message);}
    finally{if(sides)await Promise.all(sides.map(s=>s.context.close()));}
  });
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
const checks=renderChecks;
const combinedErrors=errors;
const report=assess({checkedAt:new Date().toISOString(),reference:manifest.origin,referenceMethod:'Fresh HTTP file hashes plus the verified original served locally without tracking; only local pages were rendered, with matching state, A/B variant, random seed, time and viewport.',liveOriginalFiles:live.length,liveFilesIdentical:live.filter(f=>f.identical).length,moduleChecks,unchangedAssets:assetChecks.length,contentStrings,approvedCopyExceptions:['landing.variants.c.headline','landing.variants.c.subheadline'],renderedScreens:checks.length,branches:new Set(checks.map(r=>r.branch)).size,errors:combinedErrors,checks});
await writeFile(`${reportDir}/comparison${process.argv.includes('--pilot')?'-pilot':''}.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({liveFiles:live.length,modules:moduleChecks.length,assets:assetChecks.length,contentStrings,screens:checks.length,rawExact:report.rawExactMatchingScreens,dynamicVariations:report.dynamicVariations,mismatches:report.mismatches.length,errors:report.errors.length},null,2));
if(report.mismatches.length||report.errors.length)process.exitCode=1;
