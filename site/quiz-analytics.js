(function(){
  'use strict';
  var script=document.currentScript,params=new URLSearchParams(location.search);
  var test=script&&(script.dataset.test==='1'||params.get('gal_qa')==='1');
  if(!script||window.QuizAnalytics||navigator.globalPrivacyControl||(!test&&(navigator.webdriver||/^qa/i.test(params.get('utm_source')||''))))return;
  var offer=script.dataset.offer,key=script.dataset.key;if(!offer||!key)return;
  var endpoint=new URL(script.dataset.endpoint||'/api/q/',script.src);
  endpoint.searchParams.set('action','collect');endpoint.searchParams.set('offer',offer);endpoint.searchParams.set('key',key);
  var flow;try{flow=JSON.parse(script.dataset.flow||'null');}catch{}
  var version=script.dataset.version||'sem-versao',structure=JSON.stringify((flow||[]).map(function(s){return [s.id,s.kind,s.phases||[]];}));
  var storageKey='qa-session:'+offer,session,queue=[],current='',phase='',visibleSince=0,durations={},lastView='',lastHeartbeat=0,inflight=0,answerCache={},seenSections={},depth=0,lastIdentity='',identityBusy=false,pending=false;
  function uid(){return crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(20)),function(v){return v.toString(16).padStart(2,'0');}).join('');}
  function safe(value,max){return String(value||'').replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g,'[email]').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max||140);}
  function read(name){try{return JSON.parse(sessionStorage.getItem(name)||'null');}catch{return null;}}
  function variant(){var ab=read(script.dataset.abStorage);return safe(params.get('variant')||(ab&&Object.keys(ab).sort().map(function(k){return k+'='+ab[k];}).join(';')),80)||'não informado';}
  function save(){try{sessionStorage.setItem(storageKey,JSON.stringify(session));}catch{}}
  function touch(){
    var now=Date.now();
    if(!session||now-session.last>1800000||session.structure!==structure||session.meta.qa!==!!test||session.meta.version!==version){
      var ua=navigator.userAgent;
      session={id:uid(),last:now,structure:structure,meta:{qa:!!test,source:safe(params.get('utm_source'),80),campaign:safe(params.get('utm_campaign'),160),medium:safe(params.get('utm_medium'),160),content:safe(params.get('utm_content'),160),term:safe(params.get('utm_term'),80),version:version,variant:variant(),app:/Instagram/i.test(ua)?'instagram':/FBAN|FBAV|FBIOS|FB_IAB/i.test(ua)?'facebook':'navegador',device:matchMedia('(pointer: coarse)').matches?(Math.min(screen.width,screen.height)>=600?'tablet':'mobile'):'desktop'}};
      lastView='';durations={};answerCache={};seenSections={};depth=0;lastIdentity='';visibleSince=document.hidden?0:performance.now();
    }
    session.last=now;save();
  }
  session=read(storageKey);if(!session||!/^[a-zA-Z0-9_-]{16,80}$/.test(session.id||'')||!Number.isFinite(session.last)||!session.meta)session=null;touch();
  function dwell(){return current?Math.round((durations[current]||0)+(visibleSince?performance.now()-visibleSince:0)):0;}
  function envelope(){return {session:session.id,meta:Object.assign({},session.meta,flow?{flow:flow}:{}),path:location.pathname};}
  function enqueue(type,extra){if(!current)return;queue.push({event:Object.assign({id:uid(),type:type,step:current,phase:phase,at:Date.now(),dwell:dwell()},extra||{}),context:envelope()});if(queue.length>=15)flush(false,false);}
  async function flush(closing,ack){
    if(!queue.length||(inflight&&!closing))return;
    var first=queue[0],batch=[];for(var i=0;i<queue.length&&batch.length<20&&queue[i].context.session===first.context.session;i++)batch.push(queue[i]);
    var body=JSON.stringify(Object.assign({},first.context,{events:batch.map(function(b){return b.event;})}));queue.splice(0,batch.length);
    if(!ack&&navigator.sendBeacon){try{if(navigator.sendBeacon(endpoint.toString(),new Blob([body],{type:'text/plain;charset=UTF-8'}))){if(queue.length)flush(closing,false);return;}}catch{}}
    inflight++;
    try{var r=await fetch(endpoint.toString(),{method:'POST',body:body,headers:{'Content-Type':'text/plain;charset=UTF-8'},credentials:'omit',keepalive:true});if(!r.ok&&(r.status===429||r.status>=500))queue=batch.concat(queue);}
    catch{queue=batch.concat(queue);}finally{inflight--;if(queue.length>100)queue.splice(0,queue.length-100);}
    if(ack&&queue.length&&!inflight&&queue[0]!==batch[0])return flush(false,true);
  }
  function step(id,subphase){
    id=safe(id,100);subphase=safe(subphase,100);if(!id)return;
    var signature=id+':'+subphase;if(signature===lastView)return;
    var oldSession=session.id,previous=current,previousTime=dwell(),hadView=!!lastView;touch();
    if(previous&&hadView&&oldSession===session.id){enqueue('heartbeat');durations[previous]=previousTime;}
    var phaseOnly=previous===id&&hadView&&oldSession===session.id;
    current=id;phase=subphase;visibleSince=document.hidden?0:performance.now();lastView=signature;
    enqueue(phaseOnly?'phase':'view',previous&&previous!==id&&oldSession===session.id?{previous:{step:previous,visibleMs:previousTime}}:{});
  }
  function action(type,button,label){touch();if(!lastView&&current)step(current,phase);enqueue(type,{button:safe(button,100),label:safe(label)});if(type==='checkout')flush(false,false);}
  function answer(id,values){var s=(flow||[]).find(function(s){return s.id===id;});if(s&&['email','name','optin'].includes(s.kind))return;var ids=(Array.isArray(values)?values:[values]).filter(function(v){return typeof v==='string'&&/^[a-zA-Z0-9_.:+-]{1,80}$/.test(v)&&(!s||!s.options||!s.options.length||s.options.some(function(o){return o.id===v;}));});var sig=JSON.stringify(ids);if(!ids.length||answerCache[id]===sig)return;answerCache[id]=sig;enqueue('answer',{step:id,answers:ids});}
  function answers(){var state=read(script.dataset.funnelStorage);if(!state||!state.answers||!flow)return;flow.forEach(function(s){if(state.answers[s.answerKey])answer(s.id,state.answers[s.answerKey]);});}
  async function identify(value){
    if(!current||!value||identityBusy)return false;
    var email=String(value.email||'').trim().toLowerCase(),name=String(value.name||'').trim().slice(0,120);if(!/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,63}$/i.test(email))return false;
    var signature=JSON.stringify([session.id,email,name,value.marketingConsent]);if(signature===lastIdentity)return true;
    identityBusy=true;var url=new URL(endpoint);url.searchParams.set('action','identify');
    try{var r=await fetch(url,{method:'POST',credentials:'omit',keepalive:true,headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify(Object.assign(envelope(),{email:email,name:name,marketingConsent:value.marketingConsent,step:current,phase:phase,at:Date.now()}))});if(r.ok){lastIdentity=signature;return true;}}
    catch{}finally{identityBusy=false;}return false;
  }
  function contact(){var record=read(script.dataset.leadStorage);if(record&&record.email)identify({email:record.email,name:record.nome||'',marketingConsent:typeof record.optin==='boolean'?record.optin:undefined});}
  function resultVisible(){var s=(flow||[]).find(function(s){return s.id===current;});return s?s.kind==='result':!!document.querySelector('[data-quiz-result],main [data-kind="result"]');}
  var observer=typeof IntersectionObserver==='function'?new IntersectionObserver(function(entries){if(!resultVisible())return;entries.forEach(function(e){var id=e.target.dataset.section||e.target.dataset.quizSection;if(e.isIntersecting&&id&&!seenSections[id]){seenSections[id]=true;enqueue('section',{section:safe(id,100)});}});},{threshold:0,rootMargin:'-10% 0px -10% 0px'}):null;
  var observed=new WeakSet();
  function sections(){if(!resultVisible()||!observer)return;document.querySelectorAll('[data-section],[data-quiz-section]').forEach(function(n){if(!observed.has(n)){observed.add(n);observer.observe(n);}});}
  function scroll(){if(!current||!resultVisible())return;var root=document.scrollingElement||document.documentElement,value=Math.min(100,Math.round((scrollY+innerHeight)/Math.max(root.scrollHeight,innerHeight)*100));[25,50,75,90,100].forEach(function(d){if(value>=d&&depth<d)enqueue('scroll',{depth:d});});depth=Math.max(depth,value);}
  function scan(){var node=document.querySelector('[data-quiz-step],main [data-step]');if(node){if(session.meta.variant==='não informado'){session.meta.variant=variant();save();}var id=node.dataset.quizStep||node.dataset.step,subphase=node.dataset.quizPhase||node.dataset.phase||'',changed=id!==current||!lastView;step(id,subphase);if(changed&&(node.hasAttribute('data-quiz-result')||node.dataset.kind==='result'))enqueue('complete');}answers();contact();sections();scroll();}
  window.QuizAnalytics={step:step,answer:answer,identify:identify,click:function(id,label){action('click',id,label);},complete:function(){action('complete');},lead:function(){action('lead');},checkout:function(id,label){action('checkout',id,label);},flush:function(){return flush(false,true);},configure:function(next){if(!Array.isArray(next))return;flow=next;structure=JSON.stringify(flow.map(function(s){return [s.id,s.kind,s.phases||[]];}));touch();scan();}};
  document.addEventListener('click',function(event){
    var node=event.target.closest('button,a,[role="button"],[data-track-id]');if(!node||node.closest('[data-analytics-ignore]')||node.matches(':disabled,[aria-disabled="true"]'))return;
    scan();if(!current)return;
    var root=node.closest('[data-quiz-step],[data-step]')||document,section=node.closest('[data-section],[data-quiz-section]');
    var identifier=node.dataset.trackId||node.dataset.optionId||node.dataset.option||node.dataset.testid||node.id||node.tagName.toLowerCase()+'-'+Array.from(root.querySelectorAll('button,a,[role="button"]')).indexOf(node);
    if(!node.dataset.trackId&&!node.dataset.optionId&&!node.dataset.option&&node.dataset.testid){var same=Array.from(root.querySelectorAll('[data-testid="'+node.dataset.testid.replace(/[^a-zA-Z0-9_-]/g,'')+'"]'));identifier=(phase?phase+':':'')+identifier+(same.length>1?':'+same.indexOf(node):'');}
    var label=node.dataset.trackLabel||node.getAttribute('aria-label')||node.textContent;if(node.querySelector('input,textarea,[contenteditable]'))label=node.dataset.trackLabel||identifier;
    var href=node.getAttribute('href')||'',checkout=node.hasAttribute('data-quiz-checkout')||/^https:\/\/pay\.hotmart\.com\//.test(href);
    if(checkout&&!node.dataset.trackId){var parent=section||root;identifier=(section?(section.dataset.section||section.dataset.quizSection):'result')+':'+identifier+':'+Array.from(parent.querySelectorAll('a,button')).indexOf(node);}
    action('click',identifier,label);if(checkout)action('checkout',identifier,label);if(node.hasAttribute('data-quiz-complete'))action('complete');setTimeout(scan,0);
  },true);
  function hidden(type){if(current){enqueue(type);durations[current]=dwell();visibleSince=0;}flush(true,false);}
  document.addEventListener('visibilitychange',function(){if(document.hidden)hidden('hide');else{touch();visibleSince=performance.now();scan();}});addEventListener('pagehide',function(){hidden('exit');});
  document.addEventListener('quiz:step',function(e){if(e.detail)step(e.detail.id,e.detail.phase);});document.addEventListener('quiz:complete',function(){action('complete');});
  new MutationObserver(function(){if(!pending){pending=true;requestAnimationFrame(function(){pending=false;scan();});}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-step','data-phase','data-quiz-step','data-quiz-phase']});
  setInterval(function(){if(!document.hidden&&current&&Date.now()-session.last<1800000&&Date.now()-lastHeartbeat>15000){enqueue('heartbeat');lastHeartbeat=Date.now();}answers();contact();flush(false,false);},2000);
  ['pointerdown','keydown','scroll'].forEach(function(type){addEventListener(type,function(){if(current){touch();if(!lastView)step(current,phase);}if(type==='scroll')scroll();},{passive:true});});
  scan();
})();
