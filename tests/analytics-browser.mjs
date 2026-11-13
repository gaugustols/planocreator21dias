import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const tmp=await mkdtemp(path.join(os.tmpdir(),'quiz-browser-'));
const reserved=createServer();await new Promise(r=>reserved.listen(0,'127.0.0.1',r));const port=reserved.address().port;await new Promise(r=>reserved.close(r));
const origin=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['serve_analytics.mjs','--no-demo'],{env:{...process.env,PORT:String(port),ANALYTICS_SQLITE_FILE:path.join(tmp,'test.sqlite'),ANALYTICS_REQUIRE_AUTH:'0'},stdio:['ignore','pipe','pipe'],windowsHide:true});
let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
let browser;
const report={checkedAt:new Date().toISOString(),checks:[],errors:[]};
await mkdir('reports/analytics',{recursive:true});
async function newPage(options){const context=await browser.newContext(options);await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());return context.newPage();}
async function check(name,worker){await worker();report.checks.push({name,passed:true});console.log('PASS',name);}
try {
  let ready=false;
  for(let i=0;i<200;i++){try{if((await fetch(origin+'/api/analytics/?action=session')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  if(!ready)throw Error('Preview did not start: '+output);
  browser=await chromium.launch();
  const page=await newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await check('empty workspace and a new non-Portuguese offer through the UI',async()=>{
    await page.goto(origin+'/painel/');await page.locator('#empty').waitFor({state:'visible'});
    await page.click('#empty-create');await page.fill('#offer-name','Quiz français · teste isolado');await page.fill('#offer-origins',origin);
    await page.fill('#offer-steps','entrada | Entrada\npergunta | Pergunta de perfil\nresultado | Resultado e oferta');
    await page.locator('#offer-form button[type=submit]').click();await page.locator('#tab-installation').waitFor({state:'visible'});
    assert.match(await page.locator('#snippet').textContent(),/data-offer=/);
  });
  const offers=await (await fetch(origin+'/api/analytics/?action=offers')).json(),offer=offers.offers[0];
  const quiz=await newPage();quiz.on('pageerror',e=>report.errors.push(e.message));
  const sdk=await readFile('site/quiz-analytics.js','utf8');
  const events=[];
  quiz.on('request',r=>{if(r.url().includes('action=collect'))events.push(JSON.parse(r.postData()));});
  await quiz.route(url=>url.origin===origin&&url.pathname==='/fixture/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><title>Quiz français</title><main><section data-quiz-step="entrada"><h1>Bienvenue</h1><button id="next" data-track-id="continuer" data-track-label="Continuar">Commencer</button></section></main><script>document.querySelector('main').onclick=function(e){if(e.target.id==='next')this.innerHTML='<section data-quiz-step="pergunta"><input aria-label="Email" value="nao-coletar@example.com"><button id="result" data-track-id="oui" data-track-label="Sim">Oui</button></section>';if(e.target.id==='result')this.innerHTML='<section data-quiz-step="resultado" data-quiz-result><h1>Votre résultat</h1><a href="#checkout" data-quiz-checkout data-track-id="acheter" data-track-label="Comprar">Acheter</a></section>'}</script><script defer src="/quiz-analytics.js" data-test="1" data-offer="${offer.id}" data-key="${offer.publicKey}"></script>`}));
  await quiz.route(origin+'/quiz-analytics.js',route=>route.fulfill({contentType:'application/javascript',body:sdk}));
  await check('real collector: French UI, Portuguese button labels, steps, completion and checkout',async()=>{
    await quiz.goto(origin+'/fixture/?utm_source=instagram&utm_campaign=teste');
    await quiz.waitForFunction(()=>!!window.QuizAnalytics);
    const beforeMutation=await quiz.evaluate(id=>JSON.parse(sessionStorage.getItem('qa-session:'+id)).last,offer.id);
    await quiz.waitForTimeout(50);await quiz.evaluate(()=>document.querySelector('h1').textContent+=' !');await quiz.waitForTimeout(100);
    assert.equal(await quiz.evaluate(id=>JSON.parse(sessionStorage.getItem('qa-session:'+id)).last,offer.id),beforeMutation,'Background DOM updates must not extend user activity');
    await quiz.click('#next');await quiz.click('#result');await quiz.locator('[data-quiz-result]').waitFor();await quiz.click('[data-quiz-checkout]');await quiz.evaluate(()=>QuizAnalytics.flush());
    let result;
    for(let i=0;i<60;i++){
      result=await (await fetch(origin+'/api/analytics/?action=overview&offer='+offer.id+'&traffic=test&from='+(Date.now()-86400000)+'&to='+(Date.now()+86400000))).json();
      if(result.summary?.checkout===1)break;await new Promise(r=>setTimeout(r,100));
    }
    assert.equal(result.summary.sessions,1);assert.equal(result.summary.completed,1);assert.equal(result.summary.checkout,1);
    assert.deepEqual(result.steps.map(s=>s.reached),[1,1,1]);assert.deepEqual(result.steps.slice(0,2).map(s=>s.advanced),[1,1]);
    assert.equal(result.clicks.reduce((n,c)=>n+c.clicks,0),3);assert.ok(result.clicks.some(c=>c.label==='Sim'));
    assert.equal(result.sources[0].source,'instagram');assert.equal(result.sources[0].campaign,'teste');
    assert.ok(!JSON.stringify(events).includes('nao-coletar@example.com'));assert.ok(!JSON.stringify(events).includes('utm_source='));
    assert.equal(await quiz.evaluate(()=>QuizAnalytics.identify({email:'qa.leads@example.com',name:'=Teste CSV',marketingConsent:true})),true);
  });
  await check('all dashboard reports, device filters and CSV export',async()=>{
    await page.click('[data-tab=overview]');await page.locator('.advanced-filters summary').click();await page.selectOption('#traffic','test');await page.click('#refresh');await page.waitForFunction(()=>document.querySelector('#metrics strong')?.textContent==='1');
    assert.equal(await page.locator('#funnel .funnel-row').count(),3);
    await page.click('[data-tab=clicks]');await page.locator('#tab-clicks').waitFor({state:'visible'});assert.match(await page.locator('#clicks-body').innerText(),/Continuar/);
    await page.click('[data-tab=sources]');await page.locator('#tab-sources').waitFor({state:'visible'});assert.match(await page.locator('#sources-body').innerText(),/instagram/);
    await page.selectOption('#device','mobile');await page.waitForFunction(()=>document.querySelector('#metrics strong')?.textContent==='0');
    await page.selectOption('#device','');await page.waitForFunction(()=>document.querySelector('#metrics strong')?.textContent==='1');
    await page.click('[data-tab=overview]');const downloadPromise=page.waitForEvent('download');await page.click('#export');const download=await downloadPromise;
    const csv=await readFile(await download.path(),'utf8');assert.match(csv,/Retenção/);assert.match(csv,/Resultado e oferta/);
    await page.click('[data-tab=compare]');await page.selectOption('#compare-dimension','app');assert.match(await page.locator('#compare-content').innerText(),/navegador/);
    await page.click('[data-tab=leads]');await page.locator('#leads-body').getByText('qa.leads@example.com').waitFor();assert.match(await page.locator('#leads-body').innerText(),/Resultado e oferta/);
    await page.fill('#lead-query','qa.leads');await page.locator('#leads-search button').click();await page.waitForFunction(()=>document.querySelector('#leads-count')?.textContent.includes('1 leads'));
    const leadsDownload=page.waitForEvent('download');await page.click('#export-leads');const leadsCsv=await readFile(await (await leadsDownload).path(),'utf8');assert.match(leadsCsv,/qa.leads@example.com/);assert.match(leadsCsv,/"'=Teste CSV"/);
    await page.click('[data-tab=overview]');
  });
  await check('responsive layout at 390px and 320px, no uncaught browser errors',async()=>{
    for(const width of [390,320,304]){
      await page.setViewportSize({width,height:844});
      for(const tab of ['compare','leads','installation','clicks','overview']){await page.click('[data-tab='+tab+']');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow at '+width+' on '+tab);}
      await page.screenshot({path:`reports/analytics/painel-test-${width}.png`,fullPage:true});
    }
    await page.locator('#app [data-theme-value=dark]').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.reload();await page.locator('#app').waitFor({state:'visible'});assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.locator('#app [data-theme-value=light]').click();
    assert.deepEqual(report.errors,[]);
  });
  // Verify the SDK against the real recovered quiz's existing markers, without altering its files.
  await check('existing recovered quiz markers are recognized without changing its copy',async()=>{
    const brData=JSON.parse(await readFile('reports/br/recovered-data.json','utf8'));
    const states=JSON.parse(await readFile('capture_br_18-29_volto/steps.json','utf8'));
    const steps=[{id:'landing',label:'Entrada'},...brData.content.steps.map(s=>({id:s.id,label:s.title||s.brand?.name||'Resultado'}))];
    const created=await fetch(origin+'/api/analytics/?action=offers',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:'Adapter UGC · teste isolado',origins:[origin],steps})});
    const adapted=(await created.json()).offer;
    const current=await newPage();current.on('pageerror',e=>report.errors.push(e.message));
    await current.addInitScript(state=>{sessionStorage.setItem('ugc-br-funnel-v1',JSON.stringify(state));localStorage.setItem('ugc-br-m-off','1');},states.find(s=>s.step==='camera').state);
    await current.goto(origin+'/br/');await current.locator('main [data-step="camera"]').waitFor();
    await current.evaluate(({offer,key})=>{const s=document.createElement('script');s.src='/quiz-analytics.js';s.dataset.test='1';s.dataset.offer=offer;s.dataset.key=key;document.body.append(s);},{offer:adapted.id,key:adapted.publicKey});
    await current.waitForFunction(()=>!!window.QuizAnalytics);await current.evaluate(()=>QuizAnalytics.flush());
    const response=await fetch(origin+'/api/analytics/?action=overview&offer='+adapted.id+'&traffic=test&from='+(Date.now()-86400000)+'&to='+(Date.now()+86400000));const result=await response.json();
    assert.equal(result.steps.find(s=>s.id==='camera').reached,1);assert.deepEqual(report.errors,[]);await current.close();
  });
}catch(error){report.errors.push(error.stack);process.exitCode=1;console.error(error);}
finally{
  if(browser)await browser.close();
  if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}
  await mkdir('reports/analytics',{recursive:true});await writeFile('reports/analytics/browser-verification.json',JSON.stringify(report,null,2));
  const absolute=path.resolve(tmp),parent=path.resolve(os.tmpdir());
  if(absolute.startsWith(parent+path.sep)&&path.basename(absolute).startsWith('quiz-browser-'))await rm(absolute,{recursive:true,force:true});
}
if(report.errors.length)process.exitCode=1;
