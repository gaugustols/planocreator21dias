import { cp, mkdir, readFile, writeFile, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { analyticsSetup, injectCollector } from './analytics/installations.mjs';
import { runtimeInstallation } from './analytics/build-installations.mjs';

if (await access('recovered/br/index.html').then(()=>true).catch(()=>false)) await import('./mount_br.mjs');
await import('./mount_tiktok_shop.mjs');
function caktoCopy(source) { return source.replaceAll('Hotmart','Cakto').replaceAll('consumer.hotmart.com','reembolso.cakto.com.br').replaceAll('Pela sua área de compras da Cakto','Pelo portal de reembolso da Cakto').replaceAll('pela sua área de compras da Cakto','pelo portal de reembolso da Cakto').replaceAll('entre na sua área de compras da Cakto','acesse o portal de reembolso da Cakto').replaceAll('Ir para a área de compras da Cakto','Ir para o portal de reembolso da Cakto').replaceAll(' (começa com HP)','').replaceAll('%20%28come%C3%A7a%20com%20HP%2C%20se%20tiver%29','%20%28se%20tiver%29').replace(/(<li><strong>Pelo portal de reembolso da Cakto\.<\/strong>)[\s\S]*?(<\/li>)/,'$1 Informe o e-mail ou telefone usado na compra, confirme o código recebido e, em “Minhas compras”, solicite o reembolso. Se o portal indicar prazo expirado, use o e-mail abaixo dentro da garantia de 30 dias.$2'); }
// Update only the Brazilian checkout after building the independent shop offer.
for (const name of (await readdir('site/br/assets')).filter(name => /^index-.*\.js$/.test(name))) {
  const file = path.join('site/br/assets', name);
  const source = await readFile(file, 'utf8');
  await writeFile(file, caktoCopy(source).replaceAll('https://pay.hotmart.com/K108118162G?checkoutMode=10', 'https://pay.cakto.com.br/3c54edj_1376461').replace('function Ar(e,t){', 'function Ar(e,t){if(t===`z752258y`)return `https://pay.cakto.com.br/37tqm8i`;'));
}
for (const file of ['site/br/index.html', 'site/br/arrependimento/index.html']) {
  await writeFile(file, caktoCopy(await readFile(file, 'utf8')));
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

