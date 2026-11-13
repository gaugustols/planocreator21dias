import { randomBytes, randomUUID, createHmac, timingSafeEqual, scryptSync } from 'node:crypto';
import { store, localMode, offerFromRow } from './store.mjs';
import { summarize } from './metrics.mjs';
import { identifyLead,updateLeadProgress,listLeads,leadsCsv } from './leads.mjs';
import { visitContext,saveVisit,eventDetails } from './context.mjs';
import { overviewReport } from './report.mjs';
import { purgeTests } from './cleanup.mjs';
import { purchaseConnected,recordPurchase } from './purchases.mjs';

const cookieName='qa_owner';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const text=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const id=v=>text(v,100).replace(/[^a-zA-Z0-9_.:-]/g,'');
const weakLocal=()=>localMode()&&process.env.ANALYTICS_REQUIRE_AUTH!=='1';
const configured=()=>weakLocal()||(process.env.PAINEL_PASSWORD?.length>=12&&process.env.PAINEL_SESSION_SECRET?.length>=32);
function mac(value) { return createHmac('sha256',process.env.PAINEL_SESSION_SECRET).update(value+process.env.PAINEL_PASSWORD).digest('base64url'); }
function equal(a,b) { const aa=Buffer.from(a||''),bb=Buffer.from(b||'');return aa.length===bb.length&&timingSafeEqual(aa,bb); }
function authenticated(req) {
  if(weakLocal())return true;
  if(!configured())return false;
  const cookie=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!cookie)return false;
  const [value,signature]=cookie.split('.');
  if(!value||!signature||!equal(mac(value),signature))return false;
  try { const payload=JSON.parse(Buffer.from(value,'base64url'));return payload.exp>Date.now()&&payload.exp<Date.now()+9*3600000; }catch{return false;}
}
function baseUrl(req) { return process.env.PAINEL_URL || `${localMode()?'http':'https'}://${req.headers.host}`; }
function ownerOrigin(req) { return new URL(baseUrl(req)).origin; }
async function body(req) {
  const object=value=>{if(!value||typeof value!=='object'||Array.isArray(value))throw fail(400,'Envie um objeto JSON.');return value;};
  if(Number(req.headers['content-length']||0)>32768)throw fail(413,'Requisição muito grande.');
  if(req.body!==undefined) {
    const value=Buffer.isBuffer(req.body)?req.body.toString():req.body;
    if(typeof value==='object'&&value!==null){if(JSON.stringify(value).length>32768)throw fail(413,'Requisição muito grande.');return object(value);}
    try{return object(JSON.parse(value));}catch{throw fail(400,'JSON inválido.');}
  }
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>32768)throw fail(413,'Requisição muito grande.');}
  try{return object(JSON.parse(raw||'{}'));}catch{throw fail(400,'JSON inválido.');}
}
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
function originList(values) {
  if(!Array.isArray(values)||!values.length||values.length>20)throw fail(400,'Informe de 1 a 20 domínios.');
  return [...new Set(values.map(value=>{let u;try{u=new URL(value);}catch{throw fail(400,'Use o domínio completo, começando com https://.');}
    if(u.username||u.password||!['https:','http:'].includes(u.protocol)||(!localMode()&&u.protocol!=='https:'))throw fail(400,'Em produção, os domínios precisam usar HTTPS.');return u.origin;}))];
}
function stepList(values) {
  if(!Array.isArray(values)||values.length<2||values.length>100)throw fail(400,'Cadastre de 2 a 100 etapas ordenadas.');
  if(values.some(s=>!s||typeof s!=='object'))throw fail(400,'Etapas inválidas.');
  const steps=values.map(s=>({id:id(s.id),label:text(s.label,140)}));
  if(steps.some((s,i)=>!s.id||!s.label||s.id!==values[i].id)||new Set(steps.map(s=>s.id)).size!==steps.length)throw fail(400,'Cada etapa precisa de um ID único, sem espaços ou acentos, e um nome.');
  return steps;
}

async function collect(req,res,url) {
  if(!['POST','OPTIONS'].includes(req.method))throw fail(405,'Método não permitido.');
  if(!url.searchParams.get('offer')&&req.method==='POST'){const legacy=await body(req);if(legacy.s&&legacy.m&&Array.isArray(legacy.e))return json(res,202,{ignored:true,reason:'legacy-duplicate'});throw fail(403,'Oferta não autorizada.');}
  const db=await store();
  const [row]=await db.query('SELECT * FROM qa_offers WHERE id=$1 AND public_key=$2',[url.searchParams.get('offer'),url.searchParams.get('key')]);
  const offer=offerFromRow(row),origin=req.headers.origin;
  if(!offer||!origin||!offer.origins.includes(origin))throw fail(403,'Oferta ou domínio não autorizado.');
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  const payload=await body(req), now=Date.now();
  const context=visitContext(offer,payload,req.headers);
  if(context.ignored)return json(res,202,{accepted:0,ignored:true});
  if(url.searchParams.get('action')==='identify'){
    await identifyLead(db,{...offer,steps:context.steps},{...payload,source:context.source,campaign:context.campaign,device:context.device},context);
    return json(res,202,{accepted:true});
  }
  if(!Array.isArray(payload.events)||!payload.events.length||payload.events.length>20)throw fail(400,'Envie de 1 a 20 eventos por lote.');
  if(!/^[a-zA-Z0-9_-]{16,80}$/.test(payload.session||''))throw fail(400,'Sessão inválida.');
  const allowedSteps=new Set(context.steps.map(s=>s.id)), types=new Set(['view','phase','answer','section','scroll','click','hide','exit','heartbeat','complete','checkout','lead']);
  const rows=payload.events.map(e=>{
    if(!e||typeof e!=='object')throw fail(400,'Evento inválido.');
    if(!/^[a-zA-Z0-9_-]{16,80}$/.test(e.id||'')||!types.has(e.type)||!allowedSteps.has(e.step))throw fail(400,'Evento ou etapa não reconhecida.');
    const at=Number(e.at),dwell=Number(e.dwell||0);
    if(!Number.isFinite(at)||at<now-24*3600000||at>now+60000||!Number.isFinite(dwell)||dwell<0)throw fail(400,'Horário ou duração inválidos.');
    // URL queries, email, name, input values and IP addresses are never event columns.
    return [e.id,offer.id,payload.session,e.type,e.step,id(e.phase),id(e.button),text(e.label,140),Math.round(at),now,
      context.device,context.source,context.campaign,text(payload.path,300).split(/[?#]/)[0],Math.min(Math.round(dwell),3600000)];
  });
  const [rate]=await db.query('SELECT COUNT(*) AS total FROM qa_events WHERE offer_id=$1 AND received_at>$2',[offer.id,now-60000]);
  if(Number(rate.total)>20000)throw fail(429,'Limite de coleta por minuto atingido.');
  await db.transaction(async query=>{
    await saveVisit(query,offer,payload.session,context,payload.events);
    for(let i=0;i<rows.length;i++){
      const values=rows[i],e=payload.events[i];
      await query(`INSERT INTO qa_events (id,offer_id,session_id,type,step_id,phase,button_id,label,occurred_at,received_at,device,source,campaign,path,dwell_ms) VALUES (${values.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT(id) DO NOTHING`,values);
      await query('INSERT INTO qa_event_details(event_id,data) VALUES($1,$2) ON CONFLICT(event_id) DO NOTHING',[e.id,JSON.stringify(eventDetails(e,context.steps.find(s=>s.id===e.step)))]);
    }
    await updateLeadProgress(query,offer.id,payload.session,payload.events);
  });
  json(res,202,{accepted:rows.length});
}

export async function analyticsHandler(req,res) {
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const url=new URL(req.url,baseUrl(req)),action=url.searchParams.get('action')||'session';
  try {
    if(action==='purchase'&&req.method==='POST')return json(res,202,await recordPurchase(await store(),await body(req),req.headers['x-gal-signature']));
    if(action==='collect'||action==='identify')return await collect(req,res,url);
    if(!['GET','POST'].includes(req.method))throw fail(405,'Método não permitido.');
    if(req.method==='POST'&&req.headers.origin!==ownerOrigin(req))throw fail(403,'Origem não autorizada.');
    if(action==='session'&&req.method==='GET')return json(res,200,{authenticated:authenticated(req),configured:configured(),local:localMode(),database:!!(localMode()||process.env.DATABASE_URL||process.env.POSTGRES_URL),setup:{passwordPresent:!!process.env.PAINEL_PASSWORD,sessionSecretPresent:!!process.env.PAINEL_SESSION_SECRET,passwordReady:process.env.PAINEL_PASSWORD?.length>=12,sessionSecretReady:process.env.PAINEL_SESSION_SECRET?.length>=32}});
    if(action==='login'&&req.method==='POST') {
      if(!configured())throw fail(503,'Configure PAINEL_PASSWORD (12+ caracteres) e PAINEL_SESSION_SECRET (32+) na Vercel.');
      const db=await store(),now=Date.now();
      const address=createHmac('sha256',process.env.PAINEL_SESSION_SECRET).update(String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown')).digest('hex');
      const [attempts]=await db.query('SELECT COUNT(*) AS total FROM qa_login_attempts WHERE address=$1 AND received_at>$2',[address,now-15*60000]);
      if(Number(attempts.total)>=10)throw fail(429,'Muitas tentativas. Aguarde 15 minutos.');
      const data=await body(req),password=text(data.password,300);
      const a=scryptSync(password,'quiz-owner-login',32),b=scryptSync(process.env.PAINEL_PASSWORD,'quiz-owner-login',32);
      if(!timingSafeEqual(a,b)){await db.query('INSERT INTO qa_login_attempts(id,address,received_at) VALUES($1,$2,$3)',[randomUUID(),address,now]);throw fail(401,'Senha incorreta.');}
      await db.query('DELETE FROM qa_login_attempts WHERE received_at<$1 OR address=$2',[now-15*60000,address]);
      const value=Buffer.from(JSON.stringify({exp:now+8*3600000,nonce:randomBytes(12).toString('hex')})).toString('base64url');
      res.setHeader('Set-Cookie',[`${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${localMode()?'':'; Secure'}`,`${cookieName}=${value}.${mac(value)}; HttpOnly; SameSite=Lax; Path=/api/analytics; Max-Age=28800${localMode()?'':'; Secure'}`]);
      return json(res,200,{ok:true});
    }
    if(!authenticated(req))throw fail(401,'Entre para acessar o painel.');
    if(action==='logout'&&req.method==='POST'){res.setHeader('Set-Cookie',['/','/api/analytics'].map(p=>`${cookieName}=; HttpOnly; SameSite=Lax; Path=${p}; Max-Age=0${localMode()?'':'; Secure'}`));return json(res,200,{ok:true});}
    const db=await store();
    if((action==='leads'||action==='export-leads')&&req.method==='POST'){
      const result=await listLeads(db,await body(req),{exporting:action==='export-leads'});
      if(action==='leads')return json(res,200,result);
      const csv=leadsCsv(result.leads);
      res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="gal-pulse-leads.csv"'});res.end(csv);return;
    }
    if(action==='offers'&&req.method==='GET')return json(res,200,{offers:(await db.query('SELECT * FROM qa_offers ORDER BY created_at DESC')).map(offerFromRow)});
    if(action==='offers'&&req.method==='POST') {
      const data=await body(req),name=text(data.name,100),origins=originList(data.origins),steps=stepList(data.steps);
      if(!name)throw fail(400,'Informe um nome para a oferta.');
      const offer={id:randomUUID(),name,origins,steps,publicKey:randomBytes(24).toString('base64url'),createdAt:Date.now(),demo:false};
      await db.query('INSERT INTO qa_offers(id,name,origins,steps,public_key,created_at,demo) VALUES($1,$2,$3,$4,$5,$6,$7)',[offer.id,name,JSON.stringify(origins),JSON.stringify(steps),offer.publicKey,offer.createdAt,0]);
      return json(res,201,{offer});
    }
    const [row]=await db.query('SELECT * FROM qa_offers WHERE id=$1',[url.searchParams.get('offer')]);
    const offer=offerFromRow(row);if(!offer)throw fail(404,'Oferta não encontrada.');
    if(action==='purge-tests'&&req.method==='POST')return json(res,200,await purgeTests(db,offer));
    if(action==='test-audit'&&req.method==='GET'){
      const rows=await db.query("SELECT v.id,e.step_id,COUNT(*) AS views FROM qa_visits v JOIN qa_events e ON e.offer_id=v.offer_id AND e.session_id=v.id WHERE v.offer_id=$1 AND v.qa=1 AND e.type='view' GROUP BY v.id,e.step_id ORDER BY v.id,e.step_id",[offer.id]);
      return json(res,200,{views:rows});
    }
    if(action==='update-offer'&&req.method==='POST') {
      const data=await body(req),name=text(data.name,100),origins=originList(data.origins),steps=stepList(data.steps);
      if(!name)throw fail(400,'Informe um nome.');
      if(offer.steps.some((s,i)=>s.id!==steps[i]?.id))throw fail(400,'Preserve a ordem e os IDs existentes. Para outro fluxo, cadastre uma nova oferta.');
      await db.query('UPDATE qa_offers SET name=$1,origins=$2,steps=$3 WHERE id=$4',[name,JSON.stringify(origins),JSON.stringify(steps),offer.id]);return json(res,200,{ok:true});
    }
    if(action==='overview'&&req.method==='GET') {
      return json(res,200,{...await overviewReport(db,offer,Object.fromEntries(url.searchParams),{purchaseConnected:purchaseConnected()}),storage:db.kind});
    }
    throw fail(404,'Operação não encontrada.');
  }catch(error) {
    const status=error.status||500;
    if(status===500)console.error('Analytics request failed:',error.code||error.name);
    if(!res.headersSent)json(res,status,{error:status===500?'Não foi possível acessar o banco. Confira a configuração do painel.':error.message});
    else res.end();
  }
}
