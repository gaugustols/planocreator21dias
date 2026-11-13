import { test,after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID,createHmac } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { wilson,bottleneck } from '../analytics/statistics.mjs';
import { structureId,normalizeFlow } from '../analytics/context.mjs';
import { overviewReport } from '../analytics/report.mjs';
import { leadsCsv } from '../analytics/leads.mjs';

const tmp=await mkdtemp(path.join(os.tmpdir(),'quiz-extended-'));
process.env.ANALYTICS_LOCAL='1';process.env.ANALYTICS_REQUIRE_AUTH='0';process.env.ANALYTICS_SQLITE_FILE=path.join(tmp,'test.sqlite');
const {analyticsHandler}=await import('../analytics/handler.mjs'),{store}=await import('../analytics/store.mjs');
const server=createServer(analyticsHandler);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
after(async()=>{await new Promise(r=>server.close(r));(await store()).close();const target=path.resolve(tmp);assert.ok(target.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(target).startsWith('quiz-extended-'));await rm(target,{recursive:true,force:true});});
const flow=normalizeFlow([{id:'entrada',label:'Entrada',kind:'landing',options:[{id:'sim',label:'Sim'}]},{id:'pergunta',label:'Pergunta',kind:'question',options:[{id:'a',label:'A'},{id:'b',label:'B'}]},{id:'resultado',label:'Resultado',kind:'result'}]);
async function req(action,{body,params={},headers={}}={}){const url=new URL('/api/analytics/',origin);url.searchParams.set('action',action);for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);const r=await fetch(url,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,data:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};}
async function create(name){return (await req('offers',{body:{name,origins:[origin],steps:flow}})).data.offer;}
const offer=await create('Oferta de teste'),other=await create('Outra oferta');
const at=Date.now()-7200000,range={from:at-1000,to:Date.now()+86400000};
const event=(type,step,time=at,extra={})=>({id:randomUUID(),type,step,at:time,...extra});
const session=()=>randomUUID();
const payload=(sid,events,meta={})=>({session:sid,path:'/quiz/?email=nao-salvar@example.com',meta:{flow,source:'meta',campaign:'campanha',medium:'conjunto',content:'anuncio',term:'feed',app:'instagram',device:'mobile',version:'v1',variant:'A',...meta},events});
const collect=(body,extra={})=>req('collect',{body,params:{offer:offer.id,key:offer.publicKey},...extra});

test('Wilson and bottleneck gates require 20 evaluable visits, 95% evidence and material loss',()=>{
  const w=wilson(10,20);assert.ok(Math.abs(w.low-.299298)<.00001&&Math.abs(w.high-.700702)<.00001);
  assert.equal(bottleneck({successes:0,n:19,visits:100,reached:19,baseline:.65}).flag,false);
  assert.equal(bottleneck({successes:5,n:100,visits:100,reached:100,baseline:.65,downstream:.5}).flag,true);
  assert.equal(bottleneck({successes:0,n:20,visits:100000,reached:20,baseline:.65}).flag,false);
  assert.equal(bottleneck({successes:19,n:20,visits:20,reached:20,baseline:.95}).flag,false);
  assert.equal(structureId(flow),structureId(flow.map(s=>({...s,label:'Novo título'}))));assert.notEqual(structureId(flow),structureId([flow[0],flow[2],flow[1]]));
});
test('filters robots and qa sources, keeps all UTMs/app/country, deduplicates events and separates structures',async()=>{
  const sid=session(),body=payload(sid,[event('view','entrada')]);
  assert.equal((await collect({...body,meta:{...body.meta,source:'QA_teste'}})).data.ignored,true);
  assert.equal((await collect(body,{headers:{'User-Agent':'Googlebot'}})).data.ignored,true);
  assert.equal((await collect(body,{headers:{'x-vercel-ip-country':'BR','x-forwarded-for':'198.51.100.1'}})).status,202);
  await collect(body);const db=await store();assert.equal((await db.query('SELECT id FROM qa_events WHERE session_id=$1',[sid])).length,1);
  const [v]=await db.query('SELECT * FROM qa_visits WHERE id=$1',[sid]);assert.equal(v.country,'BR');assert.equal(v.medium,'conjunto');assert.equal(v.content,'anuncio');assert.equal(v.term,'feed');assert.equal(v.app,'instagram');assert.equal(v.path,'/quiz/');assert.ok(!JSON.stringify(v).includes('198.51.100.1'));
  assert.equal((await collect(payload(sid,[event('view','entrada')],{flow:[flow[0],flow[2],flow[1]]}))).status,409);
  const changed=payload(session(),[event('view','entrada')],{flow:[flow[0],flow[2],flow[1]],version:'v2'});assert.equal((await collect(changed)).status,202);
  const report=(await req('overview',{params:{offer:offer.id,...range,structure:structureId(flow),content:'missing'}})).data;assert.equal(report.summary.sessions,0);assert.equal(report.structures.length,2);
});
test('funnel, answers, sections, scroll, median, comparisons and low-sample status are factual',async()=>{
  const sid=session();const events=[event('view','entrada'),event('answer','entrada',at+1,{answers:['sim']}),event('view','pergunta',at+1000,{previous:{step:'entrada',visibleMs:1000}}),event('answer','pergunta',at+1001,{answers:['a','nao-salvar@example.com']}),event('view','resultado',at+6000,{previous:{step:'pergunta',visibleMs:5000}}),event('section','resultado',at+7000,{section:'price'}),event('scroll','resultado',at+7001,{depth:90}),event('click','resultado',at+8000,{button:'price:checkout',label:'Comprar'}),event('checkout','resultado',at+8001,{button:'price:checkout'})];assert.equal((await collect(payload(sid,events))).status,202);
  const r=(await req('overview',{params:{offer:offer.id,...range,structure:structureId(flow)}})).data;
  assert.equal(r.top[5].count,null);assert.equal(r.top[3].count,1);assert.equal(r.summary.checkout,1);assert.equal(r.steps[1].medianMs,5000);assert.equal(r.answers.find(a=>a.step==='pergunta').options[0].checkoutRate,100);assert.equal(r.sections[0].id,'price');assert.equal(r.scroll.find(s=>s.depth===90).visits,1);assert.equal(r.comparison.app[0].value,'instagram');assert.ok(r.bottlenecks.every(b=>!b.flag));
  const active=session();await collect(payload(active,[event('view','entrada',Date.now())]));await collect(payload(active,[event('heartbeat','entrada',Date.now()+10)]));
  const report=await overviewReport(await store(),offer,{...range,structure:structureId(flow)});assert.equal(report.steps[0].active,1);assert.equal(report.steps[0].evaluated,2);
});
test('leads capture updates name and last screen, isolates offers, protects CSV and never writes PII to events',async()=>{
  const sid=session(),identify={session:sid,path:'/quiz/',meta:{flow,source:'meta',campaign:'captura'},step:'pergunta',email:'QA.LEAD@example.com',name:'=Teste',at:Date.now(),marketingConsent:true};
  const params={offer:offer.id,key:offer.publicKey};assert.equal((await req('identify',{params,body:identify})).status,202);
  const later=Date.now()+100;await collect(payload(sid,[event('view','resultado',later)]));
  await req('identify',{params,body:{...identify,at:identify.at-1,name:'Nome antigo'}});
  const r=await req('leads',{body:{...range,offer:offer.id,q:'qa.lead'}});assert.equal(r.data.total,1);const l=r.data.leads[0];assert.equal(l.name,'=Teste');assert.equal(l.email,'qa.lead@example.com');assert.equal(l.campaign,'captura');assert.equal(l.lastStep,'resultado');assert.equal(l.marketingConsent,true);
  assert.equal((await req('leads',{body:{...range,offer:other.id}})).data.total,0);
  assert.match(leadsCsv(r.data.leads),/"'=Teste"/);assert.match((await req('export-leads',{body:{...range,offer:offer.id}})).data,/qa.lead@example.com/);
  const events=await (await store()).query('SELECT * FROM qa_events WHERE session_id=$1',[sid]);assert.ok(!JSON.stringify(events).includes('qa.lead@example.com'));assert.ok(!JSON.stringify(events).includes('=Teste'));
  const invalid=await req('identify',{params,body:{...identify,email:'invalido'}});assert.equal(invalid.status,400);
  await req('identify',{params:{offer:other.id,key:other.publicKey},body:{...identify,session:session()}});assert.equal((await req('leads',{body:{...range,q:'qa.lead'}})).data.total,2);
});
test('purchases require a server signature, are idempotent, link the submitted email and leave checkout disconnected by default',async()=>{
  const body={offer:offer.id,transaction:'test-payment-1',email:'qa.lead@example.com',at:Date.now()+200};
  assert.equal((await req('purchase',{body})).status,503);process.env.CHECKOUT_ENABLED='1';process.env.CHECKOUT_WEBHOOK_SECRET='only-a-local-test-secret-123456789';
  assert.equal((await req('purchase',{body})).status,403);
  const signature=createHmac('sha256',process.env.CHECKOUT_WEBHOOK_SECRET).update(JSON.stringify(body)).digest('hex');
  assert.equal((await req('purchase',{body,headers:{'x-gal-signature':signature}})).data.linked,true);await req('purchase',{body,headers:{'x-gal-signature':signature}});
  assert.equal((await (await store()).query('SELECT id FROM qa_purchases WHERE offer_id=$1',[offer.id])).length,1);
  const r=(await req('overview',{params:{offer:offer.id,...range,structure:structureId(flow)}})).data;assert.equal(r.top[5].count,1);delete process.env.CHECKOUT_ENABLED;delete process.env.CHECKOUT_WEBHOOK_SECRET;
});
test('QA data is hidden by default and cleanup removes only QA visits, their events and test-only leads',async()=>{
  const sid=session(),meta={qa:true,source:'qa_percurso'};assert.equal((await collect(payload(sid,[event('view','entrada')],meta))).status,202);
  await req('identify',{params:{offer:offer.id,key:offer.publicKey},body:{...payload(sid,[],meta),email:'qa.descartavel@example.com',name:'Teste',step:'entrada',at:Date.now()}});
  await req('identify',{params:{offer:offer.id,key:offer.publicKey},body:{...payload(session(),[],meta),email:'qa.lead@example.com',name:'QA não pode alterar lead real',step:'entrada',at:Date.now()}});
  const filter={offer:offer.id,...range,structure:structureId(flow)};assert.equal((await req('overview',{params:{...filter,traffic:'test'}})).data.summary.sessions,2);
  const before=(await req('overview',{params:filter})).data.summary.sessions;assert.equal((await req('leads',{body:{...range,traffic:'test'}})).data.total,2);
  assert.equal((await req('purge-tests',{params:{offer:offer.id},body:{}})).data.deletedVisits,2);
  assert.equal((await req('test-audit',{params:{offer:offer.id}})).data.views.length,0);assert.equal((await req('leads',{body:{...range,traffic:'test'}})).data.total,0);
  assert.equal((await req('overview',{params:filter})).data.summary.sessions,before);
  assert.equal((await req('leads',{body:{...range,offer:offer.id,q:'qa.lead'}})).data.leads[0].name,'=Teste');
});
test('a material bottleneck is ranked only after enough inactive visits and projects observed downstream clicks',async()=>{
  const sample=await create('Amostra estatística isolada');
  for(let i=0;i<40;i++){const events=[event('view','entrada')];if(i<8)events.push(event('view','pergunta',at+1000));if(i<4)events.push(event('view','resultado',at+2000));if(i<2)events.push(event('checkout','resultado',at+3000));const r=await req('collect',{params:{offer:sample.id,key:sample.publicKey},body:payload(session(),events)});assert.equal(r.status,202);}
  const r=(await req('overview',{params:{offer:sample.id,...range}})).data,first=r.bottlenecks[0];assert.equal(first.flag,true);assert.equal(first.stepId,'entrada');assert.equal(first.n,40);assert.equal(first.lossPerThousand,450);assert.equal(first.estimatedClicksPerThousand,112.5);assert.ok(first.interval.high<.65);
});
test('A/B evidence stays inconclusive with small samples and uses conservative 95% bounds',async()=>{
  const sample=await create('A/B isolado');
  for(let i=0;i<40;i++){const events=[event('view','entrada'),event('view','pergunta',at+1000),event('view','resultado',at+2000)];if(i>=20)events.push(event('checkout','resultado',at+3000));await req('collect',{params:{offer:sample.id,key:sample.publicKey},body:payload(session(),events,{variant:i<20?'A':'B'})});if(i===20){const r=(await req('overview',{params:{offer:sample.id,...range}})).data;assert.equal(r.winner,null);}}
  const r=(await req('overview',{params:{offer:sample.id,...range}})).data;assert.equal(r.winner,'B');assert.equal(r.ab.length,2);
});
