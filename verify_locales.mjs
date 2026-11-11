import { chromium, devices } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { analyzeJavaScript } from './lib/assets.mjs';

const origin='http://127.0.0.1:4173';
const json=async file=>JSON.parse(await readFile(file,'utf8'));
const originalManifests=await Promise.all(['reports/mirror-manifest.json','reports/br/mirror-manifest.json'].map(json));
const mount=await json('reports/br/mount-manifest.json');
let verifiedOriginals=0;
for(const manifest of originalManifests) for(const file of manifest.files){
  assert.equal(createHash('sha256').update(await readFile(file.file)).digest('hex'),file.sha256,file.file);
  verifiedOriginals++;
}
for(const file of mount.files) assert.equal(createHash('sha256').update(await readFile(file.file)).digest('hex'),file.sha256,file.file);
const redirect=await fetch(origin+'/br?utm_source=route-check',{redirect:'manual'});
assert.equal(redirect.status,308);
assert.equal(redirect.headers.get('location'),'/br/?utm_source=route-check');
for(const route of ['/api/lead','/br/api/lead']) assert.equal((await fetch(origin+route)).status,503,route);
for(const route of ['/assets/not-present.js','/br/assets/not-present.js']) assert.equal((await fetch(origin+route)).status,404,route);

const browser=await chromium.launch({headless:true});
const errors=[],externalRequests=[],crossLocaleRequests=[],layoutChecks=[],routeChecks=[];
async function context(){
  const result=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:devices['Pixel 7'].userAgent,reducedMotion:'reduce'});
  await result.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(['http:','https:'].includes(u.protocol)&&u.origin!==origin){externalRequests.push(u.href);return route.abort('blockedbyclient');}
    const documentUrl=route.request().frame().url();
    if(route.request().resourceType()!=='document'&&documentUrl.startsWith(origin+'/br/')&&u.origin===origin&&!u.pathname.startsWith('/br/')){crossLocaleRequests.push(u.href);return route.abort('blockedbyclient');}
    return route.continue();
  });
  result.on('page',page=>{
    page.on('pageerror',e=>errors.push({type:'javascript',url:page.url(),error:e.message}));
    page.on('requestfailed',r=>errors.push({type:'network',url:r.url(),error:r.failure()?.errorText}));
    page.on('response',r=>{if(r.status()>=400)errors.push({type:'http',url:r.url(),status:r.status()});});
  });
  return result;
}
try{
  const ctx=await context(),page=await ctx.newPage();
  for(const[route,lang]of[['/?ab=landing1:b','it'],['/br/?ab=landing1:b','pt-BR'],['/br/0/0','pt-BR'],['/br/paywall/','pt-BR'],['/br/arrependimento/','pt-BR'],['/br/?ver=oferta','pt-BR']]){
    const response=await page.goto(origin+route,{waitUntil:'networkidle'});
    assert.equal(response.status(),200,route);
    assert.equal(await page.locator('html').getAttribute('lang'),lang,route);
    await page.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=innerHeight){scrollTo(0,y);await new Promise(r=>setTimeout(r,35));}scrollTo(0,0)});
    const images=await page.locator('img').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>({src:e.currentSrc,complete:e.complete,width:e.naturalWidth})));
    assert(images.every(i=>i.complete&&i.width>0),JSON.stringify(images));
    if(route.startsWith('/br/')){
      const ownLinks=await page.locator('a[href]').evaluateAll(es=>es.map(e=>e.href).filter(h=>h.startsWith(location.origin)));
      assert(ownLinks.every(h=>new URL(h).pathname.startsWith('/br/')),JSON.stringify(ownLinks));
    }
    routeChecks.push({route,status:response.status(),lang,visibleImages:images.length,fallback:response.headers()['x-recovery-spa-fallback']||null});
  }
  for(const width of [320,360,390,430]){
    await page.setViewportSize({width,height:844});
    await page.goto(origin+'/br/?ab=landing1:b',{waitUntil:'networkidle'});
    const layout=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
    assert(layout.document<=width+1&&layout.body<=width+1,JSON.stringify(layout));
    layoutChecks.push(layout);
    if(width===390)await page.screenshot({path:'reports/br/local-landing-390.png',fullPage:true});
  }
  await ctx.close();

  // Use one tab/origin to expose any cross-language storage collision.
  const isolated=await context(),tab=await isolated.newPage();
  await tab.goto(origin+'/?utm_source=it-check',{waitUntil:'networkidle'});
  await tab.locator('[data-testid="option"][data-option-id="18-29"]:visible').tap();
  await tab.waitForFunction(()=>document.querySelector('main [data-step]')?.getAttribute('data-step')==='obiettivo');
  await tab.waitForTimeout(600);
  await tab.locator('[data-option-id="mio"]:visible').tap();
  await tab.waitForFunction(()=>document.querySelector('main [data-step]')?.getAttribute('data-step')==='spesa');
  const itState=await tab.evaluate(()=>sessionStorage.getItem('ugc-funnel-v1'));
  const itUtm=await tab.evaluate(()=>sessionStorage.getItem('ugc-utm-v1'));
  await tab.evaluate(()=>{sessionStorage.setItem('ugc-nome-v1',JSON.stringify('Nome Italiano'));localStorage.setItem('ugc-countdown-v1',JSON.stringify(123456789));});
  await tab.goto(origin+'/br/?utm_source=br-check',{waitUntil:'networkidle'});
  assert.equal(await tab.locator('main [data-step]').first().getAttribute('data-step'),'landing');
  await tab.locator('[data-testid="option"][data-option-id="40-49"]:visible').tap();
  await tab.waitForFunction(()=>document.querySelector('main [data-step]')?.getAttribute('data-step')==='obiettivo');
  await tab.waitForTimeout(600);
  await tab.locator('[data-option-id="arrotondare"]:visible').tap();
  await tab.waitForFunction(()=>document.querySelector('main [data-step]')?.getAttribute('data-step')==='spesa');
  const brState=await tab.evaluate(()=>sessionStorage.getItem('ugc-br-funnel-v1'));
  assert.equal(await tab.evaluate(()=>sessionStorage.getItem('ugc-funnel-v1')),itState);
  assert.equal(await tab.evaluate(()=>sessionStorage.getItem('ugc-utm-v1')),itUtm);
  assert.equal(await tab.evaluate(()=>sessionStorage.getItem('ugc-br-nome-v1')),null);
  assert.equal(await tab.evaluate(()=>localStorage.getItem('ugc-br-countdown-v1')),null);
  await tab.reload({waitUntil:'networkidle'});
  assert.equal(await tab.locator('main [data-step]').first().getAttribute('data-step'),'spesa');
  await tab.getByRole('button',{name:'Voltar',exact:true}).tap();
  await tab.waitForFunction(()=>document.querySelector('main [data-step]')?.getAttribute('data-step')==='obiettivo');
  await tab.goto(origin+'/',{waitUntil:'networkidle'});
  assert.equal(await tab.locator('main [data-step]').first().getAttribute('data-step'),'spesa');
  assert.equal(await tab.evaluate(()=>sessionStorage.getItem('ugc-funnel-v1')),itState);
  assert.equal(await tab.evaluate(()=>sessionStorage.getItem('ugc-nome-v1')),JSON.stringify('Nome Italiano'));

  // Invoke only the recovered local return-to-quiz function, never checkout.
  const main=mount.files.find(f=>/\/assets\/index-[^/]+\.js$/.test(f.file));
  const mainSource=await readFile(main.file,'utf8'),info=analyzeJavaScript(mainSource);
  const returnFunction=info.nodes.find(n=>n.type==='FunctionDeclaration'&&/window\.location\.assign/.test(mainSource.slice(n.start,n.end))&&mainSource.slice(n.start,n.end).includes('"/br/"'));
  const returnExport=info.ast.body.filter(n=>n.type==='ExportNamedDeclaration').flatMap(n=>n.specifiers).find(s=>s.local.name===returnFunction.id.name).exported.name;
  await tab.goto(origin+'/br/?ver=oferta&utm_source=br-check',{waitUntil:'networkidle'});
  const scriptUrl=await tab.locator('script[type="module"][src]').getAttribute('src');
  await Promise.all([tab.waitForURL(u=>u.pathname==='/br/'&&!u.searchParams.has('ver')),tab.evaluate(async({scriptUrl,returnExport})=>{const m=await import(new URL(scriptUrl,document.baseURI).href);m[returnExport]();},{scriptUrl,returnExport})]);
  await tab.waitForLoadState('networkidle');
  assert.equal(await tab.locator('main [data-step]').first().getAttribute('data-step'),'landing');
  assert.equal(await tab.evaluate(()=>sessionStorage.getItem('ugc-funnel-v1')),itState);
  await writeFile('reports/br/storage-isolation.json',JSON.stringify({passed:true,itState:JSON.parse(itState),brState:JSON.parse(brState),utmSeparated:true,nameSeparated:true,countdownSeparated:true,reloadAndBack:true,returnToBrazilianQuiz:true},null,2));
  await isolated.close();
}finally{await browser.close();}
assert.equal(errors.length,0,JSON.stringify(errors));
assert.equal(externalRequests.length,0,JSON.stringify(externalRequests));
assert.equal(crossLocaleRequests.length,0,JSON.stringify(crossLocaleRequests));
const report={checkedAt:new Date().toISOString(),originalFilesVerified:verifiedOriginals,mountedFilesVerified:mount.files.length,bareBrRedirect:redirect.headers.get('location'),routeChecks,layoutChecks,storageIsolation:true,errors,externalRequests,crossLocaleRequests};
await writeFile('reports/br/local-verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
