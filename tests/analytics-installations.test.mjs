import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyticsSetup, injectCollector, seedInstalledOffers } from '../analytics/installations.mjs';
import { readFile } from 'node:fs/promises';

test('the same central panel installs two current offers with stable IDs and all real quiz steps',async()=>{
  assert.equal(analyticsSetup.panelOrigin,'https://planocreator21dias.vercel.app');
  assert.deepEqual(analyticsSetup.installations.map(i=>i.path),['/','/br/']);
  assert.equal(new Set(analyticsSetup.installations.map(i=>i.offer.id)).size,2);
  for(const item of analyticsSetup.installations){
    assert.equal(item.offer.steps.length,19);
    const original=await readFile(item.path==='/br/'?'site/br/index.html':'site/index.html','utf8');
    const installed=injectCollector(original,item);
    assert.equal((installed.match(/data-ponto-installation=/g)||[]).length,1);
    assert.ok(installed.includes('data-offer="'+item.offer.id+'"'));
    assert.equal(installed.replace(/<script defer src="https:\/\/planocreator21dias\.vercel\.app\/quiz-analytics\.js"[^>]*><\/script>\n/,''),original);
    assert.throws(()=>injectCollector(installed,item),/already installed/);
  }
});

test('bootstrap is opt-in locally and never overwrites owner edits or event history',async()=>{
  const calls=[];
  await seedInstalledOffers(async(...args)=>calls.push(args),{enabled:false});assert.equal(calls.length,0);
  await seedInstalledOffers(async(...args)=>calls.push(args),{enabled:true,now:123});assert.equal(calls.length,2);
  for(const [sql,values] of calls){assert.match(sql,/ON CONFLICT\(id\) DO NOTHING/);assert.equal(values[5],123);assert.equal(values[6],0);assert.equal(values.length,7);}
});
