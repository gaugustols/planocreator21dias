import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';

if (await access('recovered/br/index.html').then(()=>true).catch(()=>false)) await import('./mount_br.mjs');
await mkdir('dist',{recursive:true});
await cp('site','dist',{recursive:true});
const original=await readFile('site/index.html','utf8');
const html=original.replace('<head>','<head><base href="/">');
await writeFile('dist/index.html',html);
console.log('Quizzes and dashboard prepared in dist/. Analytics API: api/ for Vercel. Original lead/email backends are not included.');
