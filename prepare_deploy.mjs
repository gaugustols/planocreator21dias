import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { analyticsSetup, injectCollector } from './analytics/installations.mjs';

if (await access('recovered/br/index.html').then(()=>true).catch(()=>false)) await import('./mount_br.mjs');
await mkdir('dist',{recursive:true});
await cp('site','dist',{recursive:true});
const original=await readFile('site/index.html','utf8');
const html=original.replace('<head>','<head><base href="/">');
await writeFile('dist/index.html',html);
for(const installation of analyticsSetup.installations) {
  const file=path.join('dist',installation.path.slice(1),'index.html');
  await writeFile(file,injectCollector(await readFile(file,'utf8'),installation));
}
console.log('Quizzes and dashboard prepared in dist/. Analytics API: api/ for Vercel. Original lead/email backends are not included.');
