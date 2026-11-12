import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash,randomUUID } from 'node:crypto';
import { analyticsSetup } from './analytics/installations.mjs';

const origin=analyticsSetup.panelOrigin;
const request=async(path,init)=>{
  const response=await fetch(new URL(path,origin),{...init,signal:AbortSignal.timeout(25000)});
  return {status:response.status,body:await response.text()};
};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={checkedAt:new Date().toISOString(),origin,checks:[],testCollections:[],errors:[]};
function check(name,passed,detail){report.checks.push({name,passed,...detail});if(!passed)report.errors.push(name);}
const session=await request('/api/analytics/?action=session');
report.session=JSON.parse(session.body);
check('Public session status',session.status===200);
check('Production Postgres is configured',report.session.database===true&&report.session.local===false);
check('Owner login configuration is ready',report.session.configured===true,{setup:report.session.setup});
const denied=await request('/api/analytics/?action=offers');check('Anonymous report access denied',denied.status===401);
for(const installation of analyticsSetup.installations){
  const page=await request(installation.path),marker=page.body.match(/<script[^>]*data-ponto-installation[^>]*><\/script>/g)||[];
  check('Collector installed once: '+installation.path,page.status===200&&marker.length===1&&marker[0].includes('data-offer="'+installation.offer.id+'"'));
  if(process.argv.includes('--collect-test')){
    const endpoint='/api/analytics/?action=collect&offer='+encodeURIComponent(installation.offer.id)+'&key='+encodeURIComponent(installation.offer.publicKey);
    const id=randomUUID(),at=Date.now();
    const payload={session:'qa-'+randomUUID(),device:'desktop',source:'ponto_validacao',campaign:'ativacao_painel',path:installation.path,events:[{id,type:'view',step:'landing',at,dwell:0}]};
    const refused=await request(endpoint,{method:'POST',headers:{Origin:'https://nao-autorizado.invalid','Content-Type':'text/plain'},body:JSON.stringify(payload)});
    check('Other origins rejected: '+installation.path,refused.status===403);
    const accepted=await request(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'text/plain'},body:JSON.stringify(payload)});
    check('Production database accepted labeled QA event: '+installation.path,accepted.status===202);
    report.testCollections.push({path:installation.path,offerId:installation.offer.id,status:accepted.status,eventId:id,source:payload.source,body:accepted.body});
  }
}
const sdk=await request('/quiz-analytics.js');check('Published collector matches source',sdk.status===200&&sha(sdk.body)===sha(await readFile('site/quiz-analytics.js')));
await mkdir('reports/analytics',{recursive:true});await writeFile('reports/analytics/production-verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({session:report.session,checks:report.checks,testCollections:report.testCollections.map(c=>({path:c.path,status:c.status})),errors:report.errors},null,2));
if(report.errors.length)process.exitCode=1;
