import { randomBytes } from 'node:crypto';
import { store,localMode } from './store.mjs';

export async function seedDemo() {
  if(!localMode())throw Error('Demo data is local-only.');
  const db=await store();
  if((await db.query('SELECT id FROM qa_offers WHERE id=$1',['demo-workspace'])).length)return;
  const now=Date.now(),steps=[{id:'entrada',label:'Entrada do quiz'},{id:'perfil',label:'Perfil e experiência'},{id:'objetivo',label:'Objetivo principal'},{id:'rotina',label:'Rotina e disponibilidade'},{id:'prova',label:'Simulação prática'},{id:'cadastro',label:'Cadastro'},{id:'resultado',label:'Resultado e oferta'}];
  const sql=`INSERT INTO qa_events(id,offer_id,session_id,type,step_id,phase,button_id,label,occurred_at,received_at,device,source,campaign,path,dwell_ms) VALUES(${Array.from({length:15},(_,i)=>'$'+(i+1)).join(',')})`;
  await db.transaction(async q=>{
    await q('INSERT INTO qa_offers(id,name,origins,steps,public_key,created_at,demo) VALUES($1,$2,$3,$4,$5,$6,$7)',['demo-workspace','Oferta de demonstração',JSON.stringify(['http://127.0.0.1:4174']),JSON.stringify(steps),randomBytes(24).toString('base64url'),now,1]);
    for(let i=0;i<864;i++) {
      const day=i%7,at=now-day*86400000-((i*1327)%18000)*1000-3600000;
      const sid='demo-session-'+String(i).padStart(8,'0'),limit=i%100<31?7:i%100<58?4:i%100<77?5:i%100<87?3:i%100<94?2:1;
      const source=['instagram','facebook','google',''][i%4],campaign=source?['Criativos · campanha A','Criativos · campanha B'][i%2]:'';
      const device=i%11===0?'desktop':i%23===0?'tablet':'mobile';
      const add=async(type,step,seq,button='',label='',dwell=0)=>q(sql,[`demo-event-${i}-${seq}`,'demo-workspace',sid,type,step,'',button,label,at+seq*14000,at+seq*14000,device,source,campaign,'/oferta/',dwell]);
      for(let s=0;s<limit;s++){await add('view',steps[s].id,s*3);await add('click',steps[s].id,s*3+1,s===0?'comecar':'continuar',s===0?'Começar meu quiz':'Continuar',9000+(i%30)*1200);await add('heartbeat',steps[s].id,s*3+2,'','',18000+(i%30)*1200);}
      if(limit===7){await add('complete','resultado',24);if(i%3!==0)await add('checkout','resultado',25,'ver-oferta','Conhecer o plano');await add('lead','cadastro',26);}
    }
  });
  console.log('Analytics demo: 864 synthetic sessions in an explicitly labeled local offer.');
}
