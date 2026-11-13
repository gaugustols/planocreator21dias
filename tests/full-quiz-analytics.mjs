// One complete mobile journey per current offer. Live mode writes only isolated QA traffic.
import assert from 'node:assert/strict';
import { chromium,devices } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp,rm,readFile,writeFile,mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import { analyticsSetup } from '../analytics/installations.mjs';
import { runtimeInstallation } from '../analytics/build-installations.mjs';

const live=process.argv.includes('--live'),tmp=live?null:await mkdtemp(path.join(os.tmpdir(),'quiz-full-'));
let child,browser,origin=analyticsSetup.panelOrigin;
const report={checkedAt:new Date().toISOString(),live,journeys:[],errors:[]};
if(!live){const net=createServer();await new Promise(r=>net.listen(0,'127.0.0.1',r));const port=net.address().port;await new Promise(r=>net.close(r));origin='http://127.0.0.1:'+port;child=spawn(process.execPath,['serve_analytics.mjs','--no-demo'],{env:{...process.env,PORT:String(port),ANALYTICS_SQLITE_FILE:path.join(tmp,'test.sqlite'),ANALYTICS_LOAD_INSTALLATIONS:'1'},stdio:'ignore',windowsHide:true});}
async function waitServer(){for(let i=0;i<200;i++){try{if((await fetch(origin+'/api/analytics/?action=session')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Preview did not start');}
try{
  await waitServer();browser=await chromium.launch();
  for(const base of analyticsSetup.installations){
    const installation=await runtimeInstallation(base),br=base.path==='/br/',prefix=br?'ugc-br-':'ugc-',content=JSON.parse(await readFile(br?'reports/br/recovered-data.json':'reports/recovered-data.json','utf8')).content;
    if(!live){const r=await fetch(origin+'/api/analytics/?action=update-offer&offer='+base.offer.id,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({name:base.offer.name,origins:[origin],steps:base.offer.steps})});assert.equal(r.status,200);}
    const context=await browser.newContext({...devices['Pixel 7'],viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(8000);
    const errors=[],responses=[],requests=[],screens=[],states=[],beacons=[];let visit;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(new URL(r.url()).pathname==='/api/q/'&&r.request().postData()?.includes('"meta"'))responses.push({status:r.status(),action:new URL(r.url()).searchParams.get('action')});});
    page.on('request',r=>{if(new URL(r.url()).pathname==='/api/q/'&&r.postData()?.includes('"meta"')){const body=JSON.parse(r.postData());requests.push(body);if(body.events)beacons.push(r.resourceType());visit=body.session;}});
    await context.addInitScript(p=>{if(!/^https?:$/.test(location.protocol))return;localStorage.setItem(p+'m-off','1');localStorage.setItem(p+'muted-v1','true');sessionStorage.setItem(p+'ab-v1',JSON.stringify({landing1:'a!',result1:'a!'}));},prefix);
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin||!/^https?:/.test(route.request().url())?route.continue():route.abort());
    await page.goto(origin+base.path+'?gal_qa=1&utm_source=qa_percurso&utm_campaign=validacao_gal_pulse&utm_medium=conjunto_qa&utm_content=anuncio_qa&utm_term=feed');
    // Local previews preserve original HTML; inject exactly the same collector configuration as the build.
    if(!live)await page.evaluate(i=>{const s=document.createElement('script');s.src='/quiz-analytics.js';s.dataset.offer=i.offer.id;s.dataset.key=i.offer.publicKey;s.dataset.endpoint='/api/q/';s.dataset.test='1';s.dataset.flow=JSON.stringify(i.flow);s.dataset.version=i.version;s.dataset.leadStorage=i.leadStorageKey;s.dataset.funnelStorage=i.funnelStorageKey;s.dataset.abStorage=i.abStorageKey;document.body.append(s);},installation);
    await page.waitForFunction(()=>!!window.QuizAnalytics);
    await page.waitForSelector('main [data-step]');await page.evaluate(()=>QuizAnalytics.flush());await page.waitForTimeout(100);assert.ok(responses.some(r=>r.status===202),'Collector must accept the first screen before continuing: '+JSON.stringify(responses));
    let reached=false,last='',idle=Date.now();
    for(let iteration=0;iteration<700;iteration++){
      await page.waitForTimeout(260);
      const root=page.locator('main [data-step]').first(),id=await root.getAttribute('data-step'),kind=await root.getAttribute('data-kind'),phase=await root.getAttribute('data-phase')||'';
      const sig=id+':'+phase;if(sig!==last){states.push(sig);last=sig;idle=Date.now();console.log(base.path,sig);}if(!screens.includes(id))screens.push(id);if(Date.now()-idle>30000)throw Error('No progress at '+sig);
      if(kind==='result'){reached=true;break;}
      const entry=id==='landing'?content.landing.firstQuestion:content.steps.find(s=>s.id===id);
      const primary=page.getByTestId('primary').filter({visible:true});
      const click=async locator=>{try{if(await locator.count()&&await locator.first().isEnabled({timeout:500})){await locator.first().click({timeout:1500});return true;}}catch(e){if(!/Timeout|detached|not attached/.test(e.message))throw e;}return false;};
      if(kind==='email'){await page.locator('main input[type=email],main input[inputmode=email]').first().fill('qa.percurso.'+(br?'br':'it')+'@example.com');await click(primary);continue;}
      if(kind==='name'){await page.getByTestId('name-input').fill('Teste GAL');await click(primary);continue;}
      if(kind==='optin'){await click(page.getByTestId('optin-no'));continue;}
      if(kind==='scratch'){if(!await click(page.getByTestId('scratch-reveal')))await click(primary);continue;}
      if(kind==='analysis'&&phase==='question'){await click(page.locator('[data-testid=option][data-option-id="'+entry.midQuestion.options[0].id+'"]'));continue;}
      if(kind==='question'||id==='landing'){
        const options=page.getByTestId('option');if(entry.multi){let selected=true;for(let i=0;i<Math.min(2,await options.count());i++){if(await options.nth(i).getAttribute('aria-checked')!=='true'){await click(options.nth(i));selected=false;break;}}if(selected)await click(primary);}else await click(options.first());continue;
      }
      if(kind==='brief'){
        if(await click(primary))continue;
        if(phase==='hook'||phase==='closing'){await click(page.locator('[data-testid=task-option][data-correct=true]'));continue;}
        if(phase==='storyboard'){const choices=await page.getByTestId('scene').evaluateAll(es=>es.filter(e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true').map(e=>Number(e.dataset.order)).sort((a,b)=>a-b));if(choices.length)await click(page.locator('[data-testid=scene][data-order="'+choices[0]+'"]'));continue;}
        if(phase==='record'){await click(page.getByTestId('record'));continue;}
      }
      await click(primary);if(Date.now()-idle>25000)throw Error('No progress at '+sig);
    }
    assert.ok(reached,'Did not reach result');assert.deepEqual(screens,installation.flow.map(s=>s.id));
    const sections=page.locator('[data-section]');for(let i=0;i<await sections.count();i++){await sections.nth(i).scrollIntoViewIfNeeded();await page.waitForTimeout(120);}
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(300);
    // Exercise the real collector listener, then stop application handlers before external navigation.
    await page.evaluate(()=>document.addEventListener('click',e=>{if(e.target.closest('[data-testid=checkout]')){e.preventDefault();e.stopImmediatePropagation();}},true));
    await page.getByTestId('checkout').first().click();await page.waitForTimeout(500);await page.evaluate(()=>QuizAnalytics.flush());await page.waitForTimeout(800);
    const sid=await page.evaluate(id=>JSON.parse(sessionStorage.getItem('qa-session:'+id)).id,base.offer.id);visit=sid;
    const events=requests.flatMap(r=>r.events||[]),views=events.filter(e=>e.type==='view');
    assert.equal(views.length,19);assert.equal(new Set(views.map(e=>e.step)).size,19);assert.ok(events.some(e=>e.type==='answer'));assert.ok(events.some(e=>e.type==='section'&&e.section==='price'));assert.ok(events.some(e=>e.type==='scroll'&&e.depth===100));assert.ok(events.some(e=>e.type==='checkout'));assert.ok(requests.some(r=>r.name==='Teste GAL'));assert.ok(!JSON.stringify(events).includes('@example.com'));assert.ok(responses.length&&responses.every(r=>r.status===202),JSON.stringify(responses));
    await page.goto('about:blank');await page.waitForTimeout(800);await context.close();
    const journey={path:base.path,offer:base.offer.id,visit,screens:screens.length,states:states.length,events:events.length,answers:events.filter(e=>e.type==='answer').length,price:true,scroll100:true,checkout:true,leadName:true,beaconUsed:beacons.includes('ping'),responses,errors};
    if(!live){
      const db=new DatabaseSync(path.join(tmp,'test.sqlite'));const rows=db.prepare("SELECT step_id,COUNT(*) AS n FROM qa_events WHERE offer_id=? AND session_id=? AND type='view' GROUP BY step_id").all(base.offer.id,sid);assert.equal(rows.length,19);assert.ok(rows.every(r=>r.n===1));assert.equal(db.prepare('SELECT name FROM qa_leads WHERE offer_id=?').get(base.offer.id).name,'Teste GAL');assert.ok(db.prepare("SELECT COUNT(*) AS n FROM qa_events WHERE session_id=? AND type='exit'").get(sid).n>=1);db.close();journey.databaseViews=rows;
      const url=origin+'/api/analytics/?action=overview&offer='+base.offer.id+'&traffic=test&from='+(Date.now()-86400000)+'&to='+(Date.now()+86400000),result=await (await fetch(url)).json();assert.equal(result.summary.sessions,1);assert.equal(result.top[3].count,1);assert.equal(result.summary.checkout,1);
      await fetch(origin+'/api/analytics/?action=purge-tests&offer='+base.offer.id,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});const clean=await (await fetch(url)).json();assert.equal(clean.summary.sessions,0);journey.deleted=true;
    }
    assert.deepEqual(errors,[]);report.journeys.push(journey);console.log('PASS complete mobile journey',base.path);
  }
}catch(e){report.errors.push(e.stack);console.error(e);process.exitCode=1;}
finally{if(browser)await browser.close();if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}await mkdir('reports/analytics',{recursive:true});await writeFile('reports/analytics/full-quiz-'+(live?'production':'local')+'.json',JSON.stringify(report,null,2));if(tmp){const target=path.resolve(tmp);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('quiz-full-'));await rm(target,{recursive:true,force:true});}}
