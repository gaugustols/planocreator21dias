/* Owner-only dashboard. No credentials or database URL are shipped to the browser. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id), esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const integer=new Intl.NumberFormat('pt-BR'), percent=n=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%', number=n=>integer.format(n||0);
  let offers=[],selected=null,data=null,tab='overview',editing=false,requestNumber=0,toastTimer;
  const titles={overview:['Cada etapa conta.','Entenda o caminho das suas sessões, do primeiro clique até a oferta.','Visão geral'],clicks:['O próximo clique tem uma história.','Veja quais escolhas e botões recebem atenção no seu quiz.','Cliques e respostas'],sources:['O caminho começa antes do quiz.','Compare as origens e campanhas que trazem suas sessões.','Origens de tráfego'],installation:['Conecte sua próxima oferta.','Um painel em português. Quizzes em qualquer idioma.','Instalação']};
  async function api(action,{method='GET',body,params={}}={}) {
    const url=new URL('/api/analytics/',location.origin);url.searchParams.set('action',action);
    for(const [key,value] of Object.entries(params))if(value!==undefined&&value!=='')url.searchParams.set(key,value);
    const r=await fetch(url,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    const result=await r.json();
    if(!r.ok){if(r.status===401&&action!=='login')showLogin('Sua sessão terminou. Entre novamente.');throw Error(result.error||'Não foi possível carregar os dados.');}
    return result;
  }
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
  function error(message){$('error').textContent=message||'';$('error').hidden=!message;}
  function showLogin(message){$('app').hidden=true;$('login').hidden=false;$('login-message').textContent=message||'';}
  function setTab(next){tab=next;const [title,description,breadcrumb]=titles[tab];$('page-title').textContent=title;$('page-description').textContent=description;$('breadcrumb').textContent=breadcrumb;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!=='tab-'+tab);$('metrics').hidden=tab==='installation';}
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
  function range(){
    const today=new Date();today.setUTCHours(0,0,0,0);
    if($('period').value==='custom'){
      const from=Date.parse($('date-from').value+'T00:00:00Z'),to=Date.parse($('date-to').value+'T00:00:00Z')+86400000;
      if(!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>366*86400000)throw Error('Escolha datas válidas, em um período de até 366 dias (UTC).');return {from,to};
    }
    return {from:today.getTime()-(Number($('period').value)-1)*86400000,to:today.getTime()+86400000};
  }
  function filterOptions(id,values,placeholder){const value=$(id).value;$(id).replaceChildren(new Option(placeholder,''),...values.map(v=>new Option(v,v)));if(values.includes(value))$(id).value=value;}
  async function loadOffers(offerId){
    const result=await api('offers');offers=result.offers;
    $('offer-select').replaceChildren(...offers.map(o=>new Option(o.name+(o.demo?' · exemplo':''),o.id)));
    const id=offerId||sessionStorage.getItem('qa-selected-offer');selected=offers.find(o=>o.id===id)||offers.find(o=>!o.demo)||offers[0]||null;
    $('empty').hidden=!!selected;$('report').hidden=!selected;$('manage-offer').disabled=!selected;
    if(selected){$('offer-select').value=selected.id;await loadReport();}else{$('demo-banner').hidden=true;$('connection').textContent='Pronto para conectar';}
  }
  async function loadReport(){
    if(!selected)return;
    const sequence=++requestNumber;error('');$('refresh').disabled=true;$('report').setAttribute('aria-busy','true');$('connection').textContent='Atualizando';
    try{
      const result=await api('overview',{params:{offer:selected.id,...range(),device:$('device').value,source:$('source').value,campaign:$('campaign').value}});
      if(sequence!==requestNumber)return;
      data=result;selected=result.offer;render(result);sessionStorage.setItem('qa-selected-offer',selected.id);
      $('connection').textContent=result.offer.demo?'Demonstração':result.lastReceived?'Coleta conectada':'Aguardando eventos';
    }catch(e){if(sequence===requestNumber){error(e.message);$('connection').textContent='Verifique a conexão';}}
    finally{if(sequence===requestNumber){$('refresh').disabled=false;$('report').removeAttribute('aria-busy');}}
  }
  function render(result){
    const s=result.summary;$('demo-banner').hidden=!result.offer.demo;
    const cards=[['Sessões iniciadas',number(s.sessions),'◎','Sessões únicas','no período selecionado',''],['Concluíram o quiz',number(s.completed),'✓',percent(s.completionRate),'das sessões iniciadas',''],['Cliques no checkout',number(s.checkout),'↗',percent(s.checkoutRate),'sessões que clicaram','purple'],['Saídas estimadas',number(s.abandoned),'↘',percent(s.abandonRate),'após 30 min sem atividade','purple']];
    $('metrics').innerHTML=cards.map(([label,value,icon,pill,footer,color])=>`<article class="metric"><div class="metric-label">${label}<span class="metric-icon">${icon}</span></div><strong>${value}</strong><div class="metric-footer"><span class="pill ${color}">${pill}</span>${footer}</div></article>`).join('');
    $('step-count').textContent=result.steps.length+' etapas';
    $('funnel').replaceChildren(...result.steps.map(step=>{
      const row=document.createElement('div');row.className='funnel-row';row.innerHTML=`<span class="funnel-name" title="${esc(step.label)}"><span class="step-number">${String(step.order).padStart(2,'0')}</span>${esc(step.label)}</span><div class="bar-track"><div class="bar-fill"></div></div><span class="funnel-value">${number(step.reached)}</span><span class="funnel-rate">${percent(step.retention)}</span>`;row.querySelector('.bar-fill').style.width=step.retention+'%';return row;
    }));
    $('insight-title').textContent=result.insight?result.insight.step:'Ainda sem saídas estimadas';
    $('insight-text').textContent=result.insight?`${number(result.insight.count)} sessões tiveram sua última atividade nesta etapa: ${percent(result.insight.rate)} de quem chegou aqui. Um bom ponto para investigar.`:'Assim que houver sessões inativas, mostramos aqui a etapa com o maior número de saídas estimadas.';
    $('active-count').textContent=number(s.active);
    $('last-event').textContent=result.lastReceived?'Último evento: '+new Date(result.lastReceived).toLocaleString('pt-BR'):'Nenhum evento recebido. Confira a instalação.';
    $('steps-body').innerHTML=result.steps.map(step=>`<tr><td title="${esc(step.id)}"><span class="step-number">${String(step.order).padStart(2,'0')}</span>${esc(step.label)}</td><td>${number(step.reached)}</td><td>${step.order===result.steps.length?'—':number(step.advanced)+` <span class="pill">${percent(step.advanceRate)}</span>`}</td><td>${percent(step.retention)}</td><td>${number(step.abandoned)} <span class="subtle">(${percent(step.abandonRate)})</span></td><td>${step.timedSessions?formatTime(step.medianMs):'—'}</td></tr>`).join('');
    $('phases').innerHTML=result.steps.filter(step=>step.phases.length).map(step=>`<details><summary>Subfases · ${esc(step.label)}</summary><div class="phase-chips">${step.phases.map(p=>`<span>${esc(p.id)}: ${number(p.sessions)} (${percent(p.rate)})</span>`).join('')}</div></details>`).join('');
    $('clicks-body').innerHTML=result.clicks.length?result.clicks.map(c=>`<tr><td>${esc(c.stepLabel)}</td><td title="${esc(c.button)}">${esc(c.label)}</td><td>${number(c.clicks)}</td><td>${number(c.sessions)}</td><td>${percent(c.rate)}</td></tr>`).join(''):'<tr><td colspan="5">Nenhum clique recebido neste período.</td></tr>';
    $('sources-body').innerHTML=result.sources.length?result.sources.map(c=>`<tr><td>${esc(c.source)}</td><td>${esc(c.campaign)}</td><td>${number(c.sessions)}</td><td>${number(c.completed)}</td><td>${percent(c.completionRate)}</td><td>${number(c.checkout)}</td></tr>`).join(''):'<tr><td colspan="6">Nenhuma sessão recebida neste período.</td></tr>';
    filterOptions('source',result.filters.sources,'Todas as origens');filterOptions('campaign',result.filters.campaigns,'Todas as campanhas');
    const dates=range(),byDay=new Map(result.days.map(d=>[d.day,d.sessions])),days=[];
    for(let at=dates.from;at<dates.to&&at<=Date.now();at+=86400000){const day=new Date(at).toISOString().slice(0,10);days.push({day,sessions:byDay.get(day)||0});}
    const max=Math.max(1,...days.map(d=>d.sessions)),labelEvery=Math.ceil(days.length/10);
    $('daily-chart').replaceChildren(...days.map((d,i)=>{const column=document.createElement('div');column.className='daily-column';column.title=d.day+': '+number(d.sessions)+' sessões';column.innerHTML=`<span class="daily-count">${days.length<16?number(d.sessions):''}</span><div class="daily-bar"></div><span class="daily-label">${i%labelEvery===0||i===days.length-1?d.day.slice(8)+'/'+d.day.slice(5,7):' '}</span>`;column.querySelector('.daily-bar').style.height=Math.max(2,d.sessions/max*90)+'px';return column;}));
    const element=document.createElement('script');element.defer=true;element.src=location.origin+'/quiz-analytics.js';element.dataset.offer=result.offer.id;element.dataset.key=result.offer.publicKey;
    $('snippet').textContent=element.outerHTML;
    $('updated').textContent='Atualizado às '+new Date(result.checkedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+' · datas do filtro em UTC';
  }
  function formatTime(ms){const sec=Math.round(ms/1000);return sec<60?sec+'s':Math.floor(sec/60)+'min '+sec%60+'s';}
  function openOffer(edit){
    editing=edit&&!!selected;$('dialog-title').textContent=editing?'Configurar oferta':'Nova oferta';$('form-error').hidden=true;
    $('offer-name').value=editing?selected.name:'';$('offer-origins').value=editing?selected.origins.join('\n'):'';
    $('offer-steps').value=editing?selected.steps.map(s=>s.id+' | '+s.label).join('\n'):'entrada | Entrada do quiz\npergunta-1 | Primeira pergunta\npergunta-2 | Segunda pergunta\ncadastro | Cadastro\nresultado | Resultado e oferta';
    $('offer-dialog').showModal();
  }
  ['new-offer','demo-create','empty-create'].forEach(id=>$(id).addEventListener('click',()=>openOffer(false)));
  $('manage-offer').addEventListener('click',()=>openOffer(true));['close-dialog','cancel-dialog'].forEach(id=>$(id).addEventListener('click',()=>$('offer-dialog').close()));
  $('offer-form').addEventListener('submit',async e=>{
    e.preventDefault();const button=e.submitter;button.disabled=true;$('form-error').hidden=true;
    try{
      const steps=$('offer-steps').value.split('\n').filter(s=>s.trim()).map(line=>{const at=line.indexOf('|');if(at<1)throw Error('Use o formato: id-da-etapa | Nome da etapa');return {id:line.slice(0,at).trim(),label:line.slice(at+1).trim()};});
      const body={name:$('offer-name').value,origins:$('offer-origins').value.split('\n').map(s=>s.trim()).filter(Boolean),steps};
      const result=await api(editing?'update-offer':'offers',{method:'POST',body,params:editing?{offer:selected.id}:{}});
      const offerId=editing?selected.id:result.offer.id;$('offer-dialog').close();$('source').value='';$('campaign').value='';await loadOffers(offerId);if(!editing)setTab('installation');toast(editing?'Oferta atualizada.':'Oferta criada. Agora conecte o script ao quiz.');
    }catch(e){$('form-error').textContent=e.message;$('form-error').hidden=false;}finally{button.disabled=false;}
  });
  $('offer-select').addEventListener('change',()=>{selected=offers.find(o=>o.id===$('offer-select').value);$('source').value='';$('campaign').value='';loadReport();});
  ['device','source','campaign','date-from','date-to'].forEach(id=>$(id).addEventListener('change',loadReport));
  $('period').addEventListener('change',()=>{$('custom-dates').hidden=$('period').value!=='custom';loadReport();});
  $('refresh').addEventListener('click',loadReport);
  $('copy-snippet').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('snippet').textContent);toast('Código copiado.');}catch{toast('Selecione e copie o código exibido.');}});
  $('export').addEventListener('click',()=>{
    if(!data)return;
    const cell=v=>'"'+String(v).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
    const rows=[['Etapa','Chegaram','Avançaram','Retenção (%)','Saídas estimadas','Abandono (%)','Tempo visível mediano (ms)'],...data.steps.map(s=>[s.label,s.reached,s.advanced,s.retention,s.abandoned,s.abandonRate,s.medianMs])];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='funil-'+selected.id+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('login-form').addEventListener('submit',async e=>{e.preventDefault();e.submitter.disabled=true;try{await api('login',{method:'POST',body:{password:$('password').value}});$('password').value='';await boot();}catch(e){$('login-message').textContent=e.message;}finally{e.submitter.disabled=false;}});
  $('logout').addEventListener('click',async()=>{try{await api('logout',{method:'POST',body:{}});showLogin();}catch(e){error(e.message);}});
  async function boot(){
    try{
      const session=await api('session');
      if(!session.authenticated){showLogin(session.configured?'':'Configure a senha, o segredo de sessão e o banco na Vercel para ativar o painel.');return;}
      $('login').hidden=true;$('app').hidden=false;$('environment').textContent=session.local?'Prévia local':'Proprietário';$('logout').hidden=session.local;
      const day=new Date().toISOString().slice(0,10);$('date-to').value=day;$('date-from').value=new Date(Date.now()-6*86400000).toISOString().slice(0,10);
      await loadOffers();
    }catch(e){if(!$('app').hidden)error(e.message);else showLogin(e.message);}
  }
  boot();
})();
