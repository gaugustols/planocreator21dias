import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const base='http://127.0.0.1:4173';
await mkdir('reports',{recursive:true});
const manifest=JSON.parse(await readFile('reports/mirror-manifest.json','utf8'));
const integrity=[];
for(const entry of manifest.files){
  const actual=createHash('sha256').update(await readFile(entry.file)).digest('hex');
  assert.equal(actual,entry.sha256,`Original file changed: ${entry.file}`);
  integrity.push({file:entry.file,ok:true});
}
const status=await fetch(`${base}/__recovery/status`);
assert.equal(status.headers.get('x-recovery-server'),'planocreator21dias-v1');
const missing=await fetch(`${base}/assets/definitely-not-present.js`);
assert.equal(missing.status,404);
const api=await fetch(`${base}/api/lead`);
assert.equal(api.status,503);
const browser=await chromium.launch({headless:true});
const routes=[],errors=[],external=[];
try{
  for(const route of ['/','/0/0','/paywall/','/recesso/','/?ver=oferta']){
    const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await context.route('**/*',r=>{const url=new URL(r.request().url());if(['http:','https:'].includes(url.protocol)&&url.origin!==base){external.push(url.href);return r.abort();}return r.continue();});
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push({route,message:e.message}));
    page.on('requestfailed',r=>errors.push({route,url:r.url(),message:r.failure()?.errorText}));
    page.on('response',r=>{if(r.status()>=400)errors.push({route,url:r.url(),status:r.status()});});
    const response=await page.goto(base+route,{waitUntil:'networkidle'});
    assert.equal(response.status(),200,route);
    const text=await page.locator('body').innerText();
    assert(text.length>200);
    routes.push({route,status:response.status(),fallback:response.headers()['x-recovery-spa-fallback']||null,characters:text.length});
    await page.screenshot({path:`reports/local-${route==='/recesso/'?'withdrawal':route==='/?ver=oferta'?'offer':route==='/'?'landing':route.includes('paywall')?'deep-paywall':'deep-step'}.png`,fullPage:true});
    if(route==='/'){
      await page.getByTestId('option').filter({visible:true}).first().click();
      await page.waitForFunction(()=>document.querySelector('main [data-step]')?.getAttribute('data-step')==='obiettivo');
      await page.reload({waitUntil:'networkidle'});
      assert.equal(await page.locator('main [data-step]').first().getAttribute('data-step'),'obiettivo');
      await page.getByRole('button',{name:'Indietro',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('main [data-step]')?.getAttribute('data-step')==='landing');
      routes.at(-1).reloadResumeAndBack=true;
    }
    await context.close();
  }
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await page.goto(base,{waitUntil:'networkidle'});
  await page.screenshot({path:'reports/local-desktop.png',fullPage:true});
  await page.close();
}finally{await browser.close();}
assert.equal(errors.length,0,JSON.stringify(errors));
assert.equal(external.length,0,JSON.stringify(external));
const report={checkedAt:new Date().toISOString(),originalFilesVerified:integrity.length,routes,missingAssetStatus:missing.status,missingBackendStatus:api.status,errors,externalRequests:external};
await writeFile('reports/local-verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
