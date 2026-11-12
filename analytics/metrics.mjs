const percent = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
const median = values => { if (!values.length) return 0; const s = [...values].sort((a,b) => a-b); const middle = Math.floor(s.length/2); return Math.round(s.length%2 ? s[middle] : (s[middle-1]+s[middle])/2); };

export function summarize(offer, events, { now = Date.now(), timeout = 30 * 60000 } = {}) {
  const sessions = new Map(), index = new Map(offer.steps.map((s, i) => [s.id, i]));
  for (const row of events) {
    if (!sessions.has(row.session_id)) sessions.set(row.session_id, []);
    sessions.get(row.session_id).push({ ...row, occurred_at: Number(row.occurred_at), dwell_ms: Number(row.dwell_ms) });
  }
  const steps = offer.steps.map((step, i) => ({ ...step, order: i+1, reached: 0, advanced: 0, abandoned: 0, active: 0, completed: 0, times: [], phaseMap: new Map() }));
  const clicks = new Map(), days = new Map(), sources = new Map();
  let completed = 0, checkout = 0, leads = 0, active = 0, abandoned = 0;
  const deviceCount = { mobile: 0, desktop: 0, tablet: 0 };
  for (const [sid, rows] of sessions) {
    rows.sort((a,b) => a.occurred_at-b.occurred_at || a.received_at-b.received_at);
    const views = new Map(), last = rows.filter(r=>r.type!=='heartbeat').at(-1)||rows.at(-1), first = rows[0];
    const finished = rows.some(r=>r.type==='complete');
    const hasCheckout = rows.some(r=>r.type==='checkout');
    const hasLead = rows.some(r=>r.type==='lead');
    const live = !finished && !hasCheckout && now-last.occurred_at < timeout;
    if (finished) completed++; if (hasCheckout) checkout++; if (hasLead) leads++;
    if (live) active++; else if (!finished && !hasCheckout) abandoned++;
    deviceCount[first.device] = (deviceCount[first.device] || 0) + 1;
    const day = new Date(first.occurred_at).toISOString().slice(0,10);
    if(!days.has(day)) days.set(day,{day,sessions:0,completed:0,checkout:0});
    const daily = days.get(day); daily.sessions++; daily.completed += +finished; daily.checkout += +hasCheckout;
    const source = first.source || 'Direto / sem UTM', campaign = first.campaign || 'Sem campanha';
    const skey = JSON.stringify([source,campaign]);
    if (!sources.has(skey)) sources.set(skey,{source,campaign,sessions:0,completed:0,checkout:0});
    const channel = sources.get(skey); channel.sessions++; channel.completed += +finished; channel.checkout += +hasCheckout;
    let lastView;
    for (const row of rows) {
      const i = index.get(row.step_id);
      if (i === undefined) continue;
      if (row.type==='view') {
        if (!views.has(i)) views.set(i,row.occurred_at);
        lastView = i;
        if(row.phase) {
          const phases=steps[i].phaseMap;
          if(!phases.has(row.phase))phases.set(row.phase,new Set());
          phases.get(row.phase).add(sid);
        }
      }
      if (row.type==='click') {
        const key = JSON.stringify([row.step_id,row.button_id || row.type]);
        if(!clicks.has(key))clicks.set(key,{stepId:row.step_id,stepLabel:steps[i].label,button:row.button_id || row.type,label:row.label || row.button_id || 'Checkout',clicks:0,sessions:new Set()});
        const click=clicks.get(key); click.clicks++; click.sessions.add(sid);
      }
    }
    for (const [i, at] of views) {
      const step=steps[i]; step.reached++;
      const next=rows.find(r=>r.type==='view' && index.get(r.step_id)===i+1 && r.occurred_at>=at);
      if(next)step.advanced++;
      if(i===steps.length-1 && (finished||hasCheckout))step.completed++;
      const durations=rows.filter(r=>r.step_id===step.id&&r.dwell_ms>0).map(r=>r.dwell_ms);
      // Each event reports the cumulative visible time for this step; use its maximum per session.
      if(durations.length)step.times.push(Math.max(...durations));
      if(lastView===i&&!finished&&!hasCheckout) { if(live)step.active++; else step.abandoned++; }
    }
  }
  const total=sessions.size;
  const funnel=steps.map(({times,phaseMap,...s})=>({...s,retention:percent(s.reached,total),advanceRate:percent(s.advanced,s.reached),abandonRate:percent(s.abandoned,s.reached),medianMs:median(times),timedSessions:times.length,phases:[...phaseMap].map(([id,visitors])=>({id,sessions:visitors.size,rate:percent(visitors.size,s.reached)}))}));
  const biggestDrop=[...funnel].sort((a,b)=>b.abandoned-a.abandoned)[0];
  return { summary:{sessions:total,completed,completionRate:percent(completed,total),checkout,checkoutRate:percent(checkout,total),leads,active,abandoned,abandonRate:percent(abandoned,total),devices:deviceCount},steps:funnel,
    clicks:[...clicks.values()].map(c=>({...c,sessions:c.sessions.size,rate:percent(c.sessions.size,funnel.find(s=>s.id===c.stepId)?.reached||0)})).sort((a,b)=>b.clicks-a.clicks),
    days:[...days.values()].sort((a,b)=>a.day.localeCompare(b.day)),sources:[...sources.values()].map(s=>({...s,completionRate:percent(s.completed,s.sessions)})).sort((a,b)=>b.sessions-a.sessions),
    insight:biggestDrop?.abandoned?{step:biggestDrop.label,count:biggestDrop.abandoned,rate:biggestDrop.abandonRate}:null, timeoutMinutes:timeout/60000,
  };
}
