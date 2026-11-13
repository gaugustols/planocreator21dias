import { createHash } from 'node:crypto';
export const clean=(v,max=160)=>typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
const knownKinds=new Set(['landing','question','interstitial','brief','analysis','email','optin','name','scratch','result']);
export function normalizeFlow(flow) {
  if(!Array.isArray(flow)||flow.length<2||flow.length>100)throw Object.assign(Error('Informe de 2 a 100 etapas na estrutura.'),{status:400});
  const steps=flow.map((s,i)=>({id:clean(s?.id,100),label:clean(s?.label,140)||clean(s?.id,100),kind:knownKinds.has(s?.kind)?s.kind:i===0?'landing':i===flow.length-1?'result':'question',answerKey:clean(s?.answerKey,100)||clean(s?.id,100),options:Array.isArray(s?.options)?s.options.slice(0,40).map(o=>({id:clean(o.id,80),label:clean(o.label,120)})):[],phases:Array.isArray(s?.phases)?s.phases.slice(0,20).map(p=>clean(p,60)):[]}));
  if(steps.some(s=>!s.id||!/^[a-zA-Z0-9_.:-]+$/.test(s.id))||new Set(steps.map(s=>s.id)).size!==steps.length)throw Object.assign(Error('Estrutura com IDs inválidos ou repetidos.'),{status:400});
  return steps;
}
export function structureId(steps){return createHash('sha256').update(JSON.stringify(steps.map(s=>[s.id,s.kind,s.phases]))).digest('hex').slice(0,24);}
export function visitContext(offer,payload,headers={}) {
  const m=payload.meta||{},steps=normalizeFlow(m.flow||offer.steps),source=clean(m.source??payload.source,80);
  const qa=m.qa===true;
  const bot=m.bot===true||/bot\b|crawler|spider|headless|lighthouse|facebookexternalhit|preview|slurp/i.test(headers['user-agent']||'');
  const country=clean(headers['x-vercel-ip-country'],2).toUpperCase();
  return {steps,structure:structureId(steps),ignored:!qa&&(bot||/^qa/i.test(source)),qa:qa?1:0,device:['mobile','tablet'].includes(m.device||payload.device)?m.device||payload.device:'desktop',app:['instagram','facebook'].includes(m.app)?m.app:'navegador',country:/^[A-Z]{2}$/.test(country)?country:'ZZ',source,campaign:clean(m.campaign??payload.campaign,160),medium:clean(m.medium,160),content:clean(m.content,160),term:clean(m.term,80),version:clean(m.version,80)||'sem-versao',variant:clean(m.variant,80)||'não informado',path:clean(payload.path,300).split(/[?#]/)[0]};
}
export async function saveVisit(query,offer,session,context,events) {
  const first=Math.min(...events.map(e=>Math.round(e.at))),activity=events.filter(e=>e.type!=='heartbeat'),last=Math.max(...(activity.length?activity:events).map(e=>Math.round(e.at)));
  const [existing]=await query('SELECT structure_id,last_at,qa FROM qa_visits WHERE offer_id=$1 AND id=$2',[offer.id,session]);
  if(existing&&existing.structure_id!==context.structure)throw Object.assign(Error('A estrutura mudou; inicie outra visita.'),{status:409});
  if(existing&&Number(existing.qa)!==context.qa)throw Object.assign(Error('O modo QA mudou; inicie outra visita.'),{status:409});
  await query('INSERT INTO qa_structures(offer_id,id,steps,created_at) VALUES($1,$2,$3,$4) ON CONFLICT(offer_id,id) DO NOTHING',[offer.id,context.structure,JSON.stringify(context.steps),Date.now()]);
  const values=[offer.id,session,context.structure,first,existing&&!activity.length?Number(existing.last_at):last,context.device,context.app,context.country,context.source,context.campaign,context.medium,context.content,context.term,context.version,context.variant,context.qa,context.path];
  await query(`INSERT INTO qa_visits(offer_id,id,structure_id,first_at,last_at,device,app,country,source,campaign,medium,content,term,version,variant,qa,path) VALUES(${values.map((_,i)=>'$'+(i+1)).join(',')}) ON CONFLICT(offer_id,id) DO UPDATE SET first_at=CASE WHEN excluded.first_at<qa_visits.first_at THEN excluded.first_at ELSE qa_visits.first_at END,last_at=CASE WHEN excluded.last_at>qa_visits.last_at THEN excluded.last_at ELSE qa_visits.last_at END`,values);
}
export function eventDetails(event,step) {
  const data={};
  if(event.type==='answer'&&!['email','name'].includes(step.kind)){
    const values=Array.isArray(event.answers)?event.answers:[];
    data.answers=[...new Set(values.slice(0,20).map(v=>clean(v,80)).filter(v=>/^[a-zA-Z0-9_.:+-]+$/.test(v)&&(!step.options.length||step.options.some(o=>o.id===v))))];
  }
  if(event.type==='section')data.section=clean(event.section,100).replace(/[^a-zA-Z0-9_.:-]/g,'');
  if(event.type==='scroll')data.depth=Math.min(100,Math.max(0,Number(event.depth)||0));
  if(event.previous&&typeof event.previous==='object')data.previous={step:clean(event.previous.step,100),visibleMs:Math.min(3600000,Math.max(0,Number(event.previous.visibleMs)||0))};
  return data;
}
