import { createHash,randomUUID } from 'node:crypto';
import { saveVisit } from './context.mjs';

const fail=(status,message)=>Object.assign(new Error(message),{status});
const clean=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const emailPattern=/^[^\s@<>]{1,64}@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i;
const max=(a,b)=>Math.max(Number(a),Number(b));

export async function identifyLead(db,offer,payload,context) {
  const now=Date.now(),email=clean(payload.email,255).toLowerCase(),name=clean(payload.name,120);
  if(email.length>254||!emailPattern.test(email))throw fail(400,'Informe um email válido.');
  if(!/^[a-zA-Z0-9_-]{16,80}$/.test(payload.session||''))throw fail(400,'Sessão inválida.');
  if(!offer.steps.some(s=>s.id===payload.step))throw fail(400,'Etapa não reconhecida.');
  const at=Number(payload.at);
  if(!Number.isFinite(at)||at<now-86400000||at>now+60000)throw fail(400,'Horário de captura inválido.');
  const phase=clean(payload.phase,100),source=clean(payload.source,80),campaign=clean(payload.campaign,160);
  const device=['mobile','tablet'].includes(payload.device)?payload.device:'desktop';
  const optin=payload.marketingConsent===true?'yes':payload.marketingConsent===false?'no':'unknown';
  const [rate]=await db.query('SELECT COUNT(*) AS total FROM qa_leads WHERE offer_id=$1 AND created_at>$2',[offer.id,now-60000]);
  if(Number(rate.total)>=2000)throw fail(429,'Limite de cadastros por minuto atingido.');
  await db.transaction(async query=>{
    if(context)await saveVisit(query,offer,payload.session,context,[{at}]);
    const [latestView]=await query("SELECT step_id,phase,occurred_at FROM qa_events WHERE offer_id=$1 AND session_id=$2 AND type='view' ORDER BY occurred_at DESC LIMIT 1",[offer.id,payload.session]);
    const stepAt=latestView&&Number(latestView.occurred_at)>at?Number(latestView.occurred_at):at;
    const step=stepAt>at?latestView.step_id:payload.step,subphase=stepAt>at?latestView.phase:phase;
    const values=[randomUUID(),offer.id,email,name,source,campaign,device,now,at,max(at,stepAt),step,subphase,stepAt,optin,context?.qa||0];
    // Contact data lives separately from anonymous events. Upserts are atomic, including concurrent submissions.
    const [lead]=await query(`INSERT INTO qa_leads(id,offer_id,email,name,source,campaign,device,created_at,contact_at,last_seen,last_step,last_phase,last_step_at,optin_status,is_test)
      VALUES(${values.map((_,i)=>'$'+(i+1)).join(',')})
      ON CONFLICT(offer_id,email,is_test) DO UPDATE SET
        name=CASE WHEN excluded.contact_at>=qa_leads.contact_at AND excluded.name<>'' THEN excluded.name ELSE qa_leads.name END,
        optin_status=CASE WHEN excluded.contact_at>=qa_leads.contact_at AND excluded.optin_status<>'unknown' THEN excluded.optin_status ELSE qa_leads.optin_status END,
        contact_at=CASE WHEN excluded.contact_at>qa_leads.contact_at THEN excluded.contact_at ELSE qa_leads.contact_at END,
        last_seen=CASE WHEN excluded.last_seen>qa_leads.last_seen THEN excluded.last_seen ELSE qa_leads.last_seen END,
        last_step=CASE WHEN excluded.last_step_at>=qa_leads.last_step_at THEN excluded.last_step ELSE qa_leads.last_step END,
        last_phase=CASE WHEN excluded.last_step_at>=qa_leads.last_step_at THEN excluded.last_phase ELSE qa_leads.last_phase END,
        last_step_at=CASE WHEN excluded.last_step_at>qa_leads.last_step_at THEN excluded.last_step_at ELSE qa_leads.last_step_at END
      RETURNING id`,values);
    await query('INSERT INTO qa_lead_sessions(offer_id,session_id,lead_id,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(offer_id,session_id) DO UPDATE SET lead_id=excluded.lead_id',[offer.id,payload.session,lead.id,now]);
    const eventId='lead-'+createHash('sha256').update(offer.id+':'+payload.session).digest('hex');
    await query(`INSERT INTO qa_events(id,offer_id,session_id,type,step_id,phase,button_id,label,occurred_at,received_at,device,source,campaign,path,dwell_ms)
      VALUES($1,$2,$3,'lead',$4,$5,'','',$6,$7,$8,$9,$10,$11,0) ON CONFLICT(id) DO NOTHING`,
      [eventId,offer.id,payload.session,payload.step,phase,at,now,device,source,campaign,clean(payload.path,300).split(/[?#]/)[0]]);
  });
}

export async function updateLeadProgress(query,offerId,session,events) {
  const views=events.filter(e=>e.type==='view').sort((a,b)=>Number(b.at)-Number(a.at));
  const activity=events.filter(e=>e.type!=='heartbeat');
  if(!views.length&&!activity.length)return;
  const [binding]=await query('SELECT lead_id FROM qa_lead_sessions WHERE offer_id=$1 AND session_id=$2',[offerId,session]);
  if(!binding)return;
  if(views.length){const e=views[0];await query('UPDATE qa_leads SET last_step=$1,last_phase=$2,last_step_at=$3 WHERE id=$4 AND last_step_at<=$3',[e.step,clean(e.phase,100),Math.round(e.at),binding.lead_id]);}
  const last=Math.max(...activity.map(e=>Number(e.at)),0);
  if(last)await query('UPDATE qa_leads SET last_seen=$1 WHERE id=$2 AND last_seen<$1',[Math.round(last),binding.lead_id]);
}

function leadFilters(input) {
  const from=Number(input.from),to=Number(input.to);
  if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<=from||to-from>366*86400000)throw fail(400,'Selecione um período de captura de até 366 dias.');
  const values=[from,to],where=['l.created_at>=$1','l.created_at<$2'];
  const add=(sql,value)=>{values.push(value);where.push(sql.replace('?', '$'+values.length));};
  if(input.traffic==='test')where.push('l.is_test=1');else if(input.traffic!=='all')where.push('l.is_test=0');
  if(input.offer)add('l.offer_id=?',clean(input.offer,100));
  if(input.device)add('l.device=?',clean(input.device,20));
  if(input.source)add('l.source=?',clean(input.source,80));
  if(input.campaign)add('l.campaign=?',clean(input.campaign,160));
  if(input.q){const q=clean(input.q,120).toLowerCase();values.push('%'+q.replace(/!/g,'!!').replace(/%/g,'!%').replace(/_/g,'!_')+'%');const n=values.length;where.push(`(LOWER(l.email) LIKE $${n} ESCAPE '!' OR LOWER(l.name) LIKE $${n} ESCAPE '!')`);}
  return {values,where:where.join(' AND ')};
}

function formatRow(row) {
  const steps=JSON.parse(row.steps),step=steps.find(s=>s.id===row.last_step);
  return {id:row.id,offerId:row.offer_id,offerName:row.offer_name,email:row.email,name:row.name,source:row.source,campaign:row.campaign,device:row.device,createdAt:Number(row.created_at),lastSeen:Number(row.last_seen),lastStep:row.last_step,lastStepLabel:step?.label||row.last_step,lastPhase:row.last_phase,marketingConsent:row.optin_status==='unknown'?null:row.optin_status==='yes'};
}

export async function listLeads(db,input,{exporting=false}={}) {
  const {values,where}=leadFilters(input);
  const [count]=await db.query('SELECT COUNT(*) AS total FROM qa_leads l WHERE '+where,values),total=Number(count.total);
  const page=Number(input.page||0),pageSize=50;
  if(!Number.isInteger(page)||page<0||page>100000)throw fail(400,'Página inválida.');
  if(exporting&&total>10000)throw fail(422,'A exportação tem mais de 10 mil leads. Reduza o período ou aplique filtros.');
  const limit=exporting?10000:pageSize,offset=exporting?0:page*pageSize;
  const rows=await db.query(`SELECT l.*,o.name AS offer_name,o.steps FROM qa_leads l JOIN qa_offers o ON o.id=l.offer_id WHERE ${where} ORDER BY l.created_at DESC,l.id DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,limit,offset]);
  const base=leadFilters({from:input.from,to:input.to,offer:input.offer});
  const options=exporting?[]:await db.query('SELECT DISTINCT l.source,l.campaign FROM qa_leads l WHERE '+base.where,base.values);
  return {leads:rows.map(formatRow),total,page,pageSize,filters:{sources:[...new Set(options.map(o=>o.source).filter(Boolean))],campaigns:[...new Set(options.map(o=>o.campaign).filter(Boolean))]},checkedAt:Date.now()};
}

export function leadsCsv(leads) {
  const cell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const header=['Nome','Email','Oferta','Origem','Campanha de captura','Última etapa','Subfase','Dispositivo','Capturado em (UTC)','Última atividade (UTC)','Autorização de marketing'];
  const rows=leads.map(l=>[l.name,l.email,l.offerName,l.source,l.campaign,l.lastStepLabel,l.lastPhase,l.device,new Date(l.createdAt).toISOString(),new Date(l.lastSeen).toISOString(),l.marketingConsent===null?'Não informado':l.marketingConsent?'Sim':'Não']);
  const csv='\uFEFF'+[header,...rows].map(row=>row.map(cell).join(';')).join('\r\n');
  if(Buffer.byteLength(csv)>3000000)throw fail(422,'A exportação está grande. Reduza o período ou aplique filtros.');
  return csv;
}
