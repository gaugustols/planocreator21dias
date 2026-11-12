import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { summarize } from '../analytics/metrics.mjs';

test('retention deduplicates views; next-step advance, inactivity, medians and checkout are distinct',()=>{
  const now=Date.now(),old=now-2*3600000,steps=[{id:'entrada',label:'Entrada'},{id:'pergunta',label:'Pergunta'},{id:'resultado',label:'Resultado'}];
  let n=0;
  const event=(session,type,step,at=old,extra={})=>({id:String(n++),session_id:session,type,step_id:step,occurred_at:at,received_at:at,dwell_ms:0,device:'mobile',source:'instagram',campaign:'A',...extra});
  const rows=[event('A','view','entrada'),event('A','view','entrada',old+5),event('A','click','entrada',old+6,{button_id:'sim',label:'Sim',dwell_ms:1000}),event('A','click','entrada',old+7,{button_id:'sim',label:'Sim',dwell_ms:3000}),event('A','view','pergunta',old+10),event('A','view','resultado',old+20),event('A','complete','resultado',old+21),event('A','checkout','resultado',old+22),event('A','checkout','resultado',old+23),
    event('B','view','entrada'),event('B','view','pergunta',old+10),event('B','hide','pergunta',old+30,{dwell_ms:8000}),
    event('C','view','entrada',now-60000),
    event('D','view','entrada'),event('D','view','resultado',old+10),event('D','complete','resultado',old+11),
    event('E','view','entrada'),event('E','heartbeat','entrada',now-1000,{dwell_ms:12000})];
  const result=summarize({steps},rows,{now});
  assert.equal(result.summary.sessions,5);assert.equal(result.summary.completed,2);assert.equal(result.summary.checkout,1);assert.equal(result.summary.active,1);assert.equal(result.summary.abandoned,2);
  assert.equal(result.steps[0].reached,5);assert.equal(result.steps[0].advanced,2);assert.equal(result.steps[0].advanceRate,40);assert.equal(result.steps[0].medianMs,7500);
  assert.equal(result.steps[1].retention,40);assert.equal(result.steps[1].abandoned,1);assert.equal(result.steps[1].abandonRate,50);
  assert.equal(result.clicks[0].clicks,2);assert.equal(result.clicks[0].sessions,1);assert.equal(result.clicks[0].rate,20);
  assert.equal(result.steps.at(-1).completed,2);
});

const tmp=await mkdtemp(path.join(os.tmpdir(),'quiz-analytics-'));
process.env.ANALYTICS_LOCAL='1';process.env.ANALYTICS_REQUIRE_AUTH='1';process.env.ANALYTICS_SQLITE_FILE=path.join(tmp,'test.sqlite');
process.env.PAINEL_PASSWORD='teste-local-apenas-12345';process.env.PAINEL_SESSION_SECRET='segredo-exclusivo-dos-testes-1234567890';
const {analyticsHandler}=await import('../analytics/handler.mjs');
const server=createServer(analyticsHandler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
after(async()=>{
  await new Promise(resolve=>server.close(resolve));
  (await (await import('../analytics/store.mjs')).store()).close();
  const absolute=path.resolve(tmp),parent=path.resolve(os.tmpdir());
  if(!absolute.startsWith(parent+path.sep)||!path.basename(absolute).startsWith('quiz-analytics-'))throw Error('Unsafe test cleanup target');
  await rm(absolute,{recursive:true,force:true});
});
let cookie,offer,second;
async function request(action,{method='GET',body,params={},auth=true,requestOrigin=origin}={}){
  const url=new URL('/api/analytics/',origin);url.searchParams.set('action',action);for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
  const r=await fetch(url,{method,headers:{...(method!=='GET'?{'Content-Type':'application/json',Origin:requestOrigin}:{}),...(cookie&&auth?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});
  const raw=await r.text();return {status:r.status,data:raw?JSON.parse(raw):null,headers:r.headers};
}

test('owner auth, CSRF, offer isolation and collector origin validation',async()=>{
  const unauthorized=await request('offers',{auth:false});assert.equal(unauthorized.status,401);
  assert.equal((await request('login',{method:'POST',body:{password:'wrong'}})).status,401);
  const login=await request('login',{method:'POST',body:{password:process.env.PAINEL_PASSWORD}});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'),/HttpOnly/);assert.match(login.headers.get('set-cookie'),/SameSite=Lax/);
  assert.equal((await request('offers',{method:'POST',body:{},requestOrigin:'https://attacker.example'})).status,403);
  const input={name:'Quiz em francês',origins:['https://quiz.example'],steps:[{id:'entrada',label:'Entrada'},{id:'resultado',label:'Resultado'}]};
  const created=await request('offers',{method:'POST',body:input});assert.equal(created.status,201);offer=created.data.offer;
  second=(await request('offers',{method:'POST',body:{...input,name:'Outra oferta'}})).data.offer;
  const at=Date.now(),event={id:randomUUID(),type:'view',step:'entrada',at};
  const params={offer:offer.id,key:offer.publicKey},body={session:'test-session-123456789',source:'meta',campaign:'Teste',path:'/fr/?email=not-stored@example.com',events:[event]};
  assert.equal((await request('collect',{method:'POST',params,body,auth:false,requestOrigin:'https://attacker.example'})).status,403);
  assert.equal((await request('collect',{method:'OPTIONS',params,auth:false,requestOrigin:'https://quiz.example'})).status,204);
  const accepted=await request('collect',{method:'POST',params,body,auth:false,requestOrigin:'https://quiz.example'});assert.equal(accepted.status,202);assert.equal(accepted.headers.get('access-control-allow-origin'),'https://quiz.example');
  await request('collect',{method:'POST',params,body,auth:false,requestOrigin:'https://quiz.example'}); // Retry the same event ID.
  const secondEvent={...event,id:randomUUID(),type:'view',step:'resultado',at:at+10};
  await request('collect',{method:'POST',params,body:{...body,events:[secondEvent,{...secondEvent,id:randomUUID(),type:'complete'}]},auth:false,requestOrigin:'https://quiz.example'});
  assert.equal((await request('collect',{method:'POST',params,body:{...body,events:[{...event,id:randomUUID(),step:'missing'}]},auth:false,requestOrigin:'https://quiz.example'})).status,400);
  assert.equal((await request('collect',{method:'POST',params,body:{...body,events:[null]},auth:false,requestOrigin:'https://quiz.example'})).status,400);
  const query={offer:offer.id,from:at-1000,to:at+86400000};
  const overview=await request('overview',{params:query});assert.equal(overview.status,200);assert.equal(overview.data.summary.sessions,1);assert.equal(overview.data.steps[0].reached,1);assert.equal(overview.data.summary.completed,1);
  const other=await request('overview',{params:{...query,offer:second.id}});assert.equal(other.data.summary.sessions,0);
  const filtered=await request('overview',{params:{...query,source:'different'}});assert.equal(filtered.data.summary.sessions,0);
  const {store}=await import('../analytics/store.mjs');const stored=await (await store()).query('SELECT path FROM qa_events WHERE offer_id=$1',[offer.id]);assert.ok(stored.every(e=>e.path==='/fr/'));
  const update=await request('update-offer',{method:'POST',params:{offer:offer.id},body:{...input,steps:[input.steps[1],input.steps[0]]}});assert.equal(update.status,400);
  assert.equal((await request('logout',{method:'POST',body:{}})).status,200);
});

test('cohort counts follow-through after the selected session-start interval',async()=>{
  const at=Date.now()-3*86400000,db=await (await import('../analytics/store.mjs')).store();
  const sql='INSERT INTO qa_events(id,offer_id,session_id,type,step_id,phase,button_id,label,occurred_at,received_at,device,source,campaign,path,dwell_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)';
  for(const [type,step,time] of [['view','entrada',at],['view','resultado',at+86400000],['complete','resultado',at+86400001]])await db.query(sql,[randomUUID(),second.id,'cohort-session-123456',type,step,'','','',time,time,'desktop','','','/',0]);
  const result=await request('overview',{params:{offer:second.id,from:at-1000,to:at+1000}});
  assert.equal(result.data.summary.sessions,1);assert.equal(result.data.summary.completed,1);assert.equal(result.data.steps[0].advanced,1);
});
