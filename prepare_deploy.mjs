import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';

if (await access('recovered/br/index.html').then(()=>true).catch(()=>false)) await import('./mount_br.mjs');
await mkdir('dist',{recursive:true});
await cp('site','dist',{recursive:true});
const original=await readFile('site/index.html','utf8');
const html=original.replace('<head>','<head><base href="/">');
await writeFile('dist/index.html',html);
console.log('Static frontend prepared in dist/ with a root base URL. Original integrations retained; backend functions are not included.');
