import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {analyzeJavaScript} from '../lib/assets.mjs';
const read=async f=>JSON.parse(await readFile(f,'utf8'));
const sha=x=>createHash('sha256').update(x).digest('hex');
const manifest=await read('reports/tiktok-shop/clone-manifest.json');
assert.equal(manifest.files.length,182);assert.equal(manifest.unchangedRenderers,4);assert.equal(manifest.stages,19);
assert.deepEqual(manifest.files.filter(f=>f.rendererUnchanged===false).map(f=>f.file),['site/tiktok-shop/assets/ResultScreen-CbSB5OWy.js']);
let originalFiles=0;
for(const file of ['reports/mirror-manifest.json','reports/br/mirror-manifest.json'])for(const entry of (await read(file)).files){assert.equal(sha(await readFile(entry.file)),entry.sha256,entry.file);originalFiles++;}
for(const entry of manifest.files){const source=await readFile(entry.source),target=await readFile(entry.file);assert.equal(sha(source),entry.originalSha256,entry.source);assert.equal(sha(target),entry.sha256,entry.file);if(!/\.(?:html|m?js)$/.test(entry.file)&&!source.equals(target))assert.equal(target.toString('utf8'),source.toString('utf8').replaceAll('/br/','/tiktok-shop/').replaceAll('ugc-br-','ugc-shop-'),entry.file);}
const source=await readFile('site/br/assets/index-CsqgZ4_P.js','utf8'),content=analyzeJavaScript(source).objects.find(o=>o.data?.landing?.firstQuestion&&o.data?.steps).data;
const next=(await read('reports/tiktok-shop/adapted-data.json'));
const question=s=>s?{ids:s.options?.map(o=>[o.id,o.correct??null,o.emoji??null]),multi:s.multi??null,minSelect:s.minSelect??null}:null;
const contract=s=>({id:s.id,kind:s.kind,chapter:s.chapter,layout:s.layout??null,question:question(s),hook:question(s.hook),closing:question(s.closing),scenes:s.storyboard?.scenes.map(o=>[o.id,o.order,o.image])??null,phases:['notification','briefCard','hook','storyboard','record','closing','delivery'].filter(k=>s[k])});
assert.deepEqual([content.landing.firstQuestion,...content.steps].map(contract),[next.content.landing.firstQuestion,...next.content.steps].map(contract));
assert.equal(next.config.price,29.9);assert.equal(next.config.checkoutUrl,'/tiktok-shop/inscricoes/');assert.equal(next.config.scratch.revealPlan,true);assert.equal(next.config.showAnchor,false);assert.equal(next.config.testimonials.length,0);
assert.equal(next.config.countdown.enabled,false);assert.equal(next.config.countdown.mode,'endOfDay');
assert.deepEqual(next.content.offer.stickyBar,{countdown:true,countdownLabel:'A oferta termina em',label:'Quero vender vídeos'});
assert.match(next.content.steps.find(s=>s.id==='camera').options[2].label,/IA/);assert.match(next.content.offer.finalCta.cta,/21 dias/);assert.ok(!/cachê|Trilha UGC|800|4.000/.test(next.content.legal.simulationDisclaimer));
await writeFile('reports/tiktok-shop/parity-verification.json',JSON.stringify({source:'/br/',route:'/tiktok-shop/',originalFilesUnchanged:originalFiles,copiedFiles:182,renderersPreserved:4,customizedRenderer:'ResultScreen: fixed offer bar only',stylesPreserved:true,mediaPreserved:true,stageOrderAndTaskCorrectnessPreserved:true,stages:19,price:29.9,scratchRevealAvailable:true,scratchDiscountPercent:next.content.steps.find(s=>s.id==='sconto').discountPercent},null,2));
console.log('PASS original files, shared layout, media, 19 stages and task mechanics');
if(!process.argv.includes('--static-only')){const child=spawn(process.execPath,['tests/full-quiz-analytics.mjs','--shop-only'],{stdio:'inherit',windowsHide:true});process.exitCode=await new Promise(r=>child.on('exit',r));}
