import { readFile,readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { analyzeJavaScript } from '../lib/assets.mjs';
export async function runtimeInstallation(installation) {
  const root=path.join('site',installation.path.slice(1)),files=await readdir(path.join(root,'assets'));
  const file=files.find(f=>/^index-.*\.js$/.test(f));if(!file)throw Error('Quiz entry point not found');
  const source=await readFile(path.join(root,'assets',file),'utf8'),info=analyzeJavaScript(source);
  const content=info.objects.find(o=>o.data?.landing?.firstQuestion&&o.data?.steps)?.data;
  if(!content)throw Error('Quiz content not found for analytics structure');
  const labels=new Map(installation.offer.steps.map(s=>[s.id,s.label]));
  const plain=s=>String(s||'').replace(/\*\*/g,'');
  const item=(s,id=s.id)=>({id,label:labels.get(id)||plain(s.title)||id,kind:id==='landing'?'landing':s.kind,answerKey:s.kind==='analysis'?s.id+'.mid':s.id,options:(s.options||s.midQuestion?.options||[]).map(o=>({id:o.id,label:plain(o.label)})),phases:s.kind==='brief'?['notification','brief','hook',...(s.storyboard?['storyboard']:[]),'record',...(s.closing?['closing']:[]),'delivery']:[]});
  return {...installation,flow:[item(content.landing.firstQuestion,'landing'),...content.steps.map(s=>item(s))],version:createHash('sha256').update(source).digest('hex').slice(0,12),leadStorageKey:installation.path==='/br/'?'ugc-br-email-v1':'ugc-email-v1',funnelStorageKey:installation.path==='/br/'?'ugc-br-funnel-v1':'ugc-funnel-v1',abStorageKey:installation.path==='/br/'?'ugc-br-ab-v1':'ugc-ab-v1'};
}
