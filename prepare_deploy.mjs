import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('dist',{recursive:true});
await cp('site','dist',{recursive:true});
const original=await readFile('site/index.html','utf8');
const html=original.replace('<head>','<head><base href="/">');
await writeFile('dist/index.html',html);
console.log('Static frontend prepared in dist/ with a root base URL. Original integrations retained; backend functions are not included.');
