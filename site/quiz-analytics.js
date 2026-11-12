(function () {
  'use strict';
  var script=document.currentScript;
  if(!script || window.QuizAnalytics || navigator.globalPrivacyControl || (navigator.webdriver && script.dataset.test!=='1'))return;
  var offer=script.dataset.offer,key=script.dataset.key;
  if(!offer||!key)return;
  var endpoint=new URL(script.dataset.endpoint||'/api/analytics/',script.src);
  endpoint.searchParams.set('action','collect');endpoint.searchParams.set('offer',offer);endpoint.searchParams.set('key',key);
  var storageKey='qa-session:'+offer,session,queue=[],current=null,phase='',visibleSince=0,durations={},lastView='',inflight=0,lastHeartbeat=0;
  function uid(){return crypto.randomUUID?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(20)),function(v){return v.toString(16).padStart(2,'0');}).join('');}
  function safe(value,max){return String(value||'').replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g,'[email]').trim().slice(0,max||140);}
  function save(){try{sessionStorage.setItem(storageKey,JSON.stringify(session));}catch{}}
  function touch(){
    var now=Date.now();
    if(!session||now-session.last>1800000){
      var params=new URLSearchParams(location.search);
      session={id:uid(),last:now,source:safe(params.get('utm_source'),80),campaign:safe(params.get('utm_campaign'),160)};lastView='';durations={};visibleSince=document.hidden?0:performance.now();
    }
    session.last=now;save();
  }
  try{session=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
  if(!session||!/^[a-zA-Z0-9_-]{16,80}$/.test(session.id||'')||!Number.isFinite(session.last))session=null;
  touch();
  function dwell(){return current?Math.round((durations[current]||0)+(visibleSince?performance.now()-visibleSince:0)):0;}
  function enqueue(type,extra){
    if(!current)return;
    queue.push(Object.assign({id:uid(),type:type,step:current,phase:phase,at:Date.now(),dwell:dwell(),_session:session.id,_source:session.source,_campaign:session.campaign,_path:location.pathname},extra||{}));
    if(queue.length>=15)flush(false);
  }
  async function flush(closing){
    if(!queue.length||(inflight&&!closing))return;
    var first=queue[0],batch=[];
    for(var i=0;i<queue.length&&batch.length<20&&queue[i]._session===first._session;i++)batch.push(queue[i]);
    var cleanEvents=batch.map(function(item){var copy=Object.assign({},item);delete copy._session;delete copy._source;delete copy._campaign;delete copy._path;return copy;});
    var body=JSON.stringify({session:first._session,source:first._source,campaign:first._campaign,path:first._path,
      device:matchMedia('(pointer: coarse)').matches?(Math.min(screen.width,screen.height)>=600?'tablet':'mobile'):'desktop',events:cleanEvents});
    queue.splice(0,batch.length);inflight++;
    try{var response=await fetch(endpoint.toString(),{method:'POST',body:body,headers:{'Content-Type':'text/plain;charset=UTF-8'},credentials:'omit',keepalive:true});
      if(!response.ok&&!(response.status>=400&&response.status<500&&response.status!==429))queue=batch.concat(queue);
    }catch{queue=batch.concat(queue);}finally{inflight--;if(queue.length>100)queue.splice(0,queue.length-100);}
  }
  function step(id,subphase){
    id=safe(id,100);subphase=safe(subphase,100);if(!id)return;
    var signature=id+':'+subphase;
    if(signature===lastView)return;
    var oldSession=session.id,previousView=lastView;touch();
    if(current&&previousView&&oldSession===session.id){enqueue('heartbeat');durations[current]=dwell();}
    current=id;phase=subphase;visibleSince=document.hidden?0:performance.now();lastView=signature;
    enqueue('view');
  }
  function scan(){var node=document.querySelector('[data-quiz-step], main [data-step]');if(node){var signature=(node.dataset.quizStep||node.dataset.step)+':'+(node.dataset.quizPhase||node.dataset.phase||'');var changed=signature!==lastView;step(node.dataset.quizStep||node.dataset.step,node.dataset.quizPhase||node.dataset.phase||'');if(changed&&(node.hasAttribute('data-quiz-result')||node.dataset.kind==='result'))action('complete');}}
  function action(type,button,label){
    touch();if(!lastView&&current)step(current,phase);
    enqueue(type,{button:safe(button,100),label:safe(label)});
    if(type==='checkout'||type==='complete'||type==='lead')flush(false);
  }
  window.QuizAnalytics={step:step,click:function(id,label){action('click',id,label);},complete:function(){action('complete');},lead:function(){action('lead');},checkout:function(id,label){action('checkout',id,label);},flush:function(){return flush(false);}};
  document.addEventListener('click',function(event){
    var node=event.target.closest('button,a,[role="button"],[data-track-id]');
    if(!node||node.closest('[data-analytics-ignore]')||node.matches(':disabled,[aria-disabled="true"]'))return;
    scan();if(!current)return;
    var root=node.closest('[data-quiz-step],[data-step]')||document;
    var identifier=node.dataset.trackId||node.dataset.option||node.dataset.testid||node.id||node.tagName.toLowerCase()+'-'+Array.from(root.querySelectorAll('button,a,[role="button"]')).indexOf(node);
    var label=node.dataset.trackLabel||node.getAttribute('aria-label')||node.textContent;
    if(node.querySelector('input,textarea,[contenteditable]'))label=node.dataset.trackLabel||identifier;
    action('click',identifier,label);
    if(node.hasAttribute('data-quiz-complete'))action('complete');
    if(node.hasAttribute('data-quiz-lead'))action('lead');
    var href=node.getAttribute('href')||'';
    if(node.hasAttribute('data-quiz-checkout')||/^https:\/\/pay\.hotmart\.com\//.test(href))action('checkout',identifier,label);
  },true);
  function hidden(){if(current){enqueue('hide');durations[current]=dwell();visibleSince=0;}flush(true);}
  document.addEventListener('visibilitychange',function(){if(document.hidden)hidden();else{touch();visibleSince=performance.now();scan();}});
  addEventListener('pagehide',hidden);
  document.addEventListener('quiz:step',function(e){if(e.detail)step(e.detail.id,e.detail.phase);});
  document.addEventListener('quiz:complete',function(){action('complete');});
  var pending=false;
  new MutationObserver(function(){if(!pending){pending=true;requestAnimationFrame(function(){pending=false;scan();});}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-step','data-phase','data-quiz-step','data-quiz-phase']});
  setInterval(function(){
    if(!document.hidden&&current&&Date.now()-session.last<1800000&&Date.now()-lastHeartbeat>15000){enqueue('heartbeat');lastHeartbeat=Date.now();}
    flush(false);
  },2000);
  // Only user interaction extends session activity; background heartbeats cannot keep it alive forever.
  ['pointerdown','keydown','scroll'].forEach(function(type){addEventListener(type,function(){if(current){touch();if(!lastView)step(current,phase);}},{passive:true});});
  scan();
})();
