import { summarize } from './metrics.mjs';
import { wilson,median,pct,bottleneck } from './statistics.mjs';
import { clean } from './context.mjs';
const timeout=1800000;
const tests="(v.qa=1)";
const dimensions=['source','campaign','medium','content','term','device','app','country','version','variant'];
const suggestions={landing:'Teste uma promessa mais clara e uma primeira ação simples.',question:'Teste reduzir opções e deixar a pergunta mais direta.',interstitial:'Teste encurtar a explicação e destacar o botão de continuar.',brief:'Teste simplificar a simulação e mostrar melhor o progresso.',email:'Teste explicar o benefício do cadastro e reduzir a fricção do campo.',result:'Teste antecipar preço, prova e um CTA claro no resultado.',purchase:'Revise as condições e a experiência do checkout antes de mudar a oferta.'};

export async function overviewReport(db,offer,input,{purchaseConnected=false,now=Date.now()}={}) {
  const from=Number(input.from),to=Number(input.to);
  if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<=from||to-from>366*86400000)throw Object.assign(Error('Selecione um período de até 366 dias.'),{status:400});
  const structures=(await db.query('SELECT id,steps,created_at FROM qa_structures WHERE offer_id=$1 ORDER BY created_at DESC',[offer.id])).map(s=>({id:s.id,steps:JSON.parse(s.steps),createdAt:Number(s.created_at)}));
  const [old]=await db.query('SELECT COUNT(*) AS total FROM qa_events e WHERE offer_id=$1 AND NOT EXISTS(SELECT 1 FROM qa_visits v WHERE v.offer_id=e.offer_id AND v.id=e.session_id)',[offer.id]);
  const legacyAvailable=Number(old.total)>0;
  const requested=clean(input.structure,100),structure=requested||structures[0]?.id||'legacy';
  if(structure==='legacy') {
    const events=await db.query('WITH cohort AS (SELECT session_id FROM qa_events WHERE offer_id=$1 GROUP BY session_id HAVING MIN(occurred_at)>=$2 AND MIN(occurred_at)<$3) SELECT e.* FROM qa_events e JOIN cohort c ON c.session_id=e.session_id WHERE e.offer_id=$1 AND NOT EXISTS(SELECT 1 FROM qa_visits v WHERE v.offer_id=e.offer_id AND v.id=e.session_id) ORDER BY e.occurred_at LIMIT 100001',[offer.id,from,to]);
    if(events.length>100000)throw Object.assign(Error('Reduza o período: há mais de 100 mil eventos.'),{status:422});
    const first=new Map();for(const e of events)if(!first.has(e.session_id))first.set(e.session_id,e);
    const chosen=new Set([...first].filter(([,e])=>(!input.device||e.device===input.device)&&(!input.source||e.source===input.source)&&(!input.campaign||e.campaign===input.campaign)&&(input.traffic==='all'||(input.traffic==='test'?/^qa/i.test(e.source)||e.source==='ponto_validacao':!/^qa/i.test(e.source)&&e.source!=='ponto_validacao'))).map(([id])=>id));
    const result=summarize(offer,events.filter(e=>chosen.has(e.session_id)),{now});
    return {offer,...result,structure:legacyAvailable?structure:'pending',structures:structures.map(({steps,...s})=>({...s,stepCount:steps.length})),legacyAvailable,legacy:legacyAvailable,top:legacyAvailable?[]:['Visitas','Começaram','Chegaram ao resultado','Viram o preço','Clicaram em comprar','Compras'].map((label,i)=>({label,count:i===5?null:0,rate:i===5?null:0})),bottlenecks:[],answers:[],sections:[],comparison:[],ab:[],purchaseConnected,filters:{sources:[...new Set([...first.values()].map(e=>e.source).filter(Boolean))],campaigns:[...new Set([...first.values()].map(e=>e.campaign).filter(Boolean))]},lastReceived:events.length?Math.max(...events.map(e=>Number(e.received_at))):null,checkedAt:now};
  }
  const selected=structures.find(s=>s.id===structure);if(!selected)throw Object.assign(Error('Estrutura do quiz não encontrada.'),{status:400});
  const steps=selected.steps,values=[offer.id,structure,from,to],conditions=['v.offer_id=$1','v.structure_id=$2','v.first_at>=$3','v.first_at<$4'];
  if(input.traffic==='test')conditions.push(tests);else if(input.traffic!=='all')conditions.push('v.qa=0');
  const baseWhere=conditions.join(' AND '),baseValues=[...values];
  for(const key of dimensions)if(input[key]){values.push(clean(input[key],160));conditions.push('v.'+key+'=$'+values.length);}
  const where=conditions.join(' AND ');
  const visits=await db.query('SELECT v.* FROM qa_visits v WHERE '+where+' ORDER BY v.first_at LIMIT 20001',values);
  if(visits.length>20000)throw Object.assign(Error('Reduza o período: há mais de 20 mil visitas nesta consulta.'),{status:422});
  const rows=await db.query(`SELECT e.*,d.data FROM qa_events e JOIN qa_visits v ON v.offer_id=e.offer_id AND v.id=e.session_id LEFT JOIN qa_event_details d ON d.event_id=e.id WHERE ${where} ORDER BY e.occurred_at LIMIT 100001`,values);
  if(rows.length>100000)throw Object.assign(Error('Reduza o período: há mais de 100 mil eventos nesta consulta.'),{status:422});
  const purchases=purchaseConnected?await db.query(`SELECT p.* FROM qa_purchases p JOIN qa_visits v ON v.offer_id=p.offer_id AND v.id=p.visit_id WHERE ${where}`,values):[];
  const purchased=new Set(purchases.map(p=>p.visit_id)),byVisit=new Map(visits.map(v=>[v.id,{...v,rows:[],views:new Map(),answers:new Map(),sections:new Set(),checkout:false,result:false,started:false,price:false,purchased:purchased.has(v.id),depth:0}]));
  for(const row of rows){const v=byVisit.get(row.session_id);if(!v)continue;let detail={};try{detail=JSON.parse(row.data||'{}');}catch{}const e={...row,at:Number(row.occurred_at),detail};v.rows.push(e);if(e.type==='view'&&!v.views.has(e.step_id))v.views.set(e.step_id,e.at);if(e.type==='answer')v.answers.set(e.step_id,detail.answers||[]);if(e.type==='section'){v.sections.add(detail.section);if(detail.section==='price')v.price=true;}if(e.type==='scroll')v.depth=Math.max(v.depth,detail.depth||0);if(e.type==='checkout')v.checkout=true;if(e.type==='complete'||(e.type==='view'&&steps.find(s=>s.id===e.step_id)?.kind==='result'))v.result=true;}
  for(const v of byVisit.values())v.started=v.answers.has(steps[0].id)||steps.slice(1).some(s=>v.views.has(s.id));
  const all=[...byVisit.values()],count=fn=>all.filter(fn).length,total=all.length;
  const funnel=steps.map((s,i)=>{
    const reached=all.filter(v=>v.views.has(s.id)),next=steps[i+1];
    const advanced=v=>next?v.views.has(next.id)&&v.views.get(next.id)>=v.views.get(s.id):v.checkout;
    const evaluated=reached.filter(v=>advanced(v)||Number(v.last_at)<now-timeout||v.purchased);
    const exits=reached.filter(v=>Number(v.last_at)<now-timeout&&!v.checkout&&!v.purchased&&[...v.rows].reverse().find(e=>e.type==='view')?.step_id===s.id);
    const times=reached.map(v=>Math.max(...v.rows.filter(e=>e.step_id===s.id).map(e=>Number(e.dwell_ms)||0),...v.rows.filter(e=>e.detail.previous?.step===s.id).map(e=>Number(e.detail.previous.visibleMs)||0),0)).filter(t=>t>0);
    const phaseIds=[...new Set(reached.flatMap(v=>v.rows.filter(e=>e.step_id===s.id&&e.phase).map(e=>e.phase)))];
    const baseline=s.kind==='landing'?.65:s.kind==='email'?.8:s.kind==='result'?.15:.95;
    return {...s,order:i+1,reached:reached.length,advanced:reached.filter(advanced).length,evaluated:evaluated.length,evaluatedSuccess:evaluated.filter(advanced).length,abandoned:exits.length,active:reached.filter(v=>Number(v.last_at)>=now-timeout&&[...v.rows].reverse().find(e=>e.type==='view')?.step_id===s.id&&!v.checkout).length,retention:pct(reached.length,total),advanceRate:pct(reached.filter(advanced).length,reached.length),abandonRate:pct(exits.length,reached.length),medianMs:median(times),timedSessions:times.length,baseline,phases:phaseIds.map(id=>({id,sessions:reached.filter(v=>v.rows.some(e=>e.step_id===s.id&&e.phase===id)).length,rate:pct(reached.filter(v=>v.rows.some(e=>e.step_id===s.id&&e.phase===id)).length,reached.length)}))};
  });
  const bottlenecks=funnel.map((s,i)=>{
    const peers=funnel.filter((p,j)=>j!==i&&p.kind===s.kind),peer=peers.length?{n:peers.reduce((n,p)=>n+p.evaluated,0),successes:peers.reduce((n,p)=>n+p.evaluatedSuccess,0)}:null;
    const next=steps[i+1],downstreamVisitors=next?all.filter(v=>v.views.has(next.id)):all;
    const downstream=s.kind==='result'?1:downstreamVisitors.length?downstreamVisitors.filter(v=>v.checkout).length/downstreamVisitors.length:0;
    return {stepId:s.id,step:s.label,kind:s.kind,n:s.evaluated,successes:s.evaluatedSuccess,downstreamObserved:downstreamVisitors.length,...bottleneck({successes:s.evaluatedSuccess,n:s.evaluated,visits:total,reached:s.reached,baseline:s.baseline,downstream,peer}),suggestion:suggestions[s.kind]||suggestions.interstitial};
  }).sort((a,b)=>Number(b.flag)-Number(a.flag)||b.estimatedClicksPerThousand-a.estimatedClicksPerThousand||b.lossPerThousand-a.lossPerThousand);
  if(purchaseConnected){const clicked=all.filter(v=>v.checkout),evaluated=clicked.filter(v=>v.purchased||Number(v.last_at)<now-timeout);bottlenecks.push({stepId:'checkout-purchase',step:'Clique → compra',kind:'purchase',n:evaluated.length,successes:evaluated.filter(v=>v.purchased).length,...bottleneck({successes:evaluated.filter(v=>v.purchased).length,n:evaluated.length,visits:total,reached:clicked.length,baseline:.3,downstream:1}),suggestion:suggestions.purchase});}
  const answers=funnel.filter(s=>s.options?.length||all.some(v=>v.answers.has(s.id))).map(s=>{
    const answered=all.filter(v=>v.answers.has(s.id)),ids=[...new Set([...(s.options||[]).map(o=>o.id),...answered.flatMap(v=>v.answers.get(s.id))])];
    return {step:s.id,label:s.label,answered:answered.length,options:ids.map(id=>{const chosen=answered.filter(v=>v.answers.get(s.id).includes(id));return {id,label:s.options?.find(o=>o.id===id)?.label||id,visits:chosen.length,share:pct(chosen.length,answered.length),checkout:chosen.filter(v=>v.checkout).length,checkoutRate:pct(chosen.filter(v=>v.checkout).length,chosen.length)};})};
  });
  const sectionIds=[...new Set(all.flatMap(v=>[...v.sections]))],resultVisits=all.filter(v=>v.result).length;
  const sections=sectionIds.map(id=>({id,visits:all.filter(v=>v.sections.has(id)).length,retention:pct(all.filter(v=>v.sections.has(id)).length,resultVisits)}));
  const clicks=new Map();for(const v of all)for(const e of v.rows.filter(e=>e.type==='click')){const key=e.step_id+':'+e.button_id;if(!clicks.has(key))clicks.set(key,{stepId:e.step_id,stepLabel:steps.find(s=>s.id===e.step_id)?.label||e.step_id,button:e.button_id,label:e.label,clicks:0,ids:new Set()});const c=clicks.get(key);c.clicks++;c.ids.add(v.id);}
  const group=(dimension)=>{
    const groups=new Map();for(const v of all){const key=dimension==='day'?new Date(Number(v.first_at)).toISOString().slice(0,10):v[dimension]||'Não informado';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(v);}
    return [...groups].map(([value,list])=>({value,visits:list.length,started:list.filter(v=>v.started).length,result:list.filter(v=>v.result).length,price:list.filter(v=>v.price).length,checkout:list.filter(v=>v.checkout).length,purchases:purchaseConnected?list.filter(v=>v.purchased).length:null,checkoutRate:pct(list.filter(v=>v.checkout).length,list.length),interval:wilson(list.filter(v=>v.checkout).length,list.length),steps:steps.map(s=>list.filter(v=>v.views.has(s.id)).length)})).sort((a,b)=>b.visits-a.visits).slice(0,50);
  };
  const ab=group('variant').filter(g=>g.value!=='não informado'&&g.value!=='Não informado');
  const winner=ab.length>1&&ab.every(g=>g.visits>=20)?ab.find(a=>ab.every(b=>a===b||a.interval.low>b.interval.high))?.value||null:null;
  const comparison=Object.fromEntries(['content','day','device','app','country'].map(d=>[d,group(d)]));
  const options=await db.query('SELECT DISTINCT v.source,v.campaign,v.medium,v.content,v.term,v.device,v.app,v.country,v.version,v.variant FROM qa_visits v WHERE '+baseWhere,baseValues);
  const filters=Object.fromEntries(dimensions.map(d=>[d,[...new Set(options.map(v=>v[d]).filter(Boolean))]]));filters.sources=filters.source;filters.campaigns=filters.campaign;
  const top=[{label:'Visitas',count:total},{label:'Começaram',count:count(v=>v.started)},{label:'Chegaram ao resultado',count:count(v=>v.result)},{label:'Viram o preço',count:count(v=>v.price)},{label:'Clicaram em comprar',count:count(v=>v.checkout)},{label:'Compras',count:purchaseConnected?count(v=>v.purchased):null}].map(s=>({...s,rate:s.count===null?null:pct(s.count,total)}));
  const active=count(v=>!v.checkout&&Number(v.last_at)>=now-timeout),abandoned=funnel.reduce((n,s)=>n+s.abandoned,0);
  const channels=new Map();for(const v of all){const key=JSON.stringify([v.source,v.campaign]);if(!channels.has(key))channels.set(key,{source:v.source||'Direto / sem UTM',campaign:v.campaign||'Sem campanha',sessions:0,completed:0,checkout:0});const c=channels.get(key);c.sessions++;c.completed+=+v.result;c.checkout+=+v.checkout;}const sources=[...channels.values()].map(c=>({...c,completionRate:pct(c.completed,c.sessions)}));
  const days=group('day').map(g=>({day:g.value,sessions:g.visits,completed:g.result,checkout:g.checkout})).sort((a,b)=>a.day.localeCompare(b.day));
  return {offer,flow:steps,structure,structures:structures.map(({steps,...s})=>({...s,stepCount:steps.length})),legacyAvailable,legacy:false,top,purchaseConnected,summary:{sessions:total,completed:resultVisits,completionRate:pct(resultVisits,total),checkout:count(v=>v.checkout),checkoutRate:pct(count(v=>v.checkout),total),leads:count(v=>v.rows.some(e=>e.type==='lead')),active,abandoned,abandonRate:pct(abandoned,total)},steps:funnel,bottlenecks,insight:bottlenecks.find(b=>b.flag)?{step:bottlenecks.find(b=>b.flag).step,count:Math.round(bottlenecks.find(b=>b.flag).lossPerThousand*total/1000),rate:0}:null,answers,sections,scroll:[25,50,75,90,100].map(depth=>({depth,visits:all.filter(v=>v.depth>=depth).length,rate:pct(all.filter(v=>v.depth>=depth).length,resultVisits)})),clicks:[...clicks.values()].map(({ids,...c})=>({...c,sessions:ids.size,rate:pct(ids.size,funnel.find(s=>s.id===c.stepId)?.reached||0)})),sources,days,comparison,ab,winner,abRule:'Critério conservador: mínimo de 20 visitas por variante e intervalos de Wilson de 95% sem sobreposição. Não prova causalidade sem distribuição aleatória.',filters,lastReceived:rows.length?Math.max(...rows.map(e=>Number(e.received_at))):null,timeoutMinutes:30,checkedAt:now};
}
