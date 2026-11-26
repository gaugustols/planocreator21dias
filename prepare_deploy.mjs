import { cp, mkdir, readFile, writeFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { analyticsSetup, injectCollector } from './analytics/installations.mjs';
import { runtimeInstallation } from './analytics/build-installations.mjs';

if (await access('recovered/br/index.html').then(()=>true).catch(()=>false)) await import('./mount_br.mjs');
await import('./mount_tiktok_shop.mjs');
// Update only the Brazilian checkout after building the independent shop offer.
for (const name of (await readdir('site/br/assets')).filter(name => /^index-.*\.js$/.test(name))) {
  const file = path.join('site/br/assets', name);
  const source = await readFile(file, 'utf8');
  await writeFile(file, source.replaceAll('https://pay.hotmart.com/K108118162G?checkoutMode=10', 'https://pay.cakto.com.br/3c54edj_1376461'));
}
await (await import('./lib/remove-br-tracking.mjs')).removeBrTracking();
await mkdir('dist',{recursive:true});
await cp('site','dist',{recursive:true});
const original=await readFile('site/index.html','utf8');
const html=original.replace('<head>','<head><base href="/">');
await writeFile('dist/index.html',html);
for(const installation of analyticsSetup.installations) {
  if (/^\/br\/?$/.test(installation.path)) continue;
  const file=path.join('dist',installation.path.slice(1),'index.html');
  await writeFile(file,injectCollector(await readFile(file,'utf8'),await runtimeInstallation(installation)));
}
console.log('Quizzes and dashboard prepared in dist/. Analytics API: api/ for Vercel. Original lead/email backends are not included.');

