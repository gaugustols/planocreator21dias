import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { analyzeJavaScript, filesBelow } from './lib/assets.mjs';
import { profiles } from './lib/profiles.mjs';

const profile = profiles.br;
const sourceOrigin = new URL(profile.origin).origin;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const mappedPath = pathname => profile.basePath.slice(0, -1) + pathname;
const files = [], storageKeys = new Map();
const landingCopy = JSON.parse(await readFile('content/br-landing.json', 'utf8'));
const keyOf = property => property.key?.name ?? property.key?.value;

function relocateCss(source, name) {
  const edits=[];
  source=source.replace(/url\(\s*(["']?)(\/(?!\/)[^)'"\s]+)\1\s*\)/gi,(whole,quote,value)=>{
    const replacement=mappedPath(value); edits.push({original:value,replacement,reason:'Prefix CSS root asset URL',file:name}); return `url(${quote}${replacement}${quote})`;
  });
  return {source,edits};
}

function relocateJavaScript(source, name) {
  const info = analyzeJavaScript(source);
  const redirectFunctions = info.nodes.filter(n => n.type === 'FunctionDeclaration' && /window\.location\.assign/.test(source.slice(n.start, n.end)));
  const edits = [];
  const content = info.nodes.find(n => n.type === 'VariableDeclarator' && n.init?.type === 'ObjectExpression' && n.init.properties.some(p => keyOf(p) === 'landing'));
  const landing = content?.init.properties.find(p => keyOf(p) === 'landing')?.value;
  if (landing?.type === 'ObjectExpression') {
    const variants = landing.properties.find(p => keyOf(p) === 'variants')?.value;
    const targets = [landing, ...(variants?.properties || []).map(p => p.value)].filter(n => n.type === 'ObjectExpression');
    for (const target of targets) for (const property of target.properties) {
      const key = keyOf(property);
      if (!Object.hasOwn(landingCopy, key)) continue;
      const original = property.value.type === 'Literal' ? property.value.value : property.value.type === 'TemplateLiteral' && !property.value.expressions.length ? property.value.quasis[0].value.cooked : undefined;
      if (original !== undefined && original !== landingCopy[key]) edits.push({ start:property.value.start, end:property.value.end, original, replacement:JSON.stringify(landingCopy[key]), reason:'Apply the approved Brazilian landing copy to every variant', file:name });
    }
  }
  for (const node of info.nodes) {
    const value = node.type === 'Literal' && typeof node.value === 'string' ? node.value : node.type === 'TemplateLiteral' && !node.expressions.length ? node.quasis[0].value.cooked : null;
    if (value === null) continue;
    let replacement, reason;
    if (/^ugc-(?!br-)[a-z0-9-]+$/.test(value)) {
      const next = value.replace(/^ugc-/, profile.storagePrefix);
      replacement = JSON.stringify(next); reason = 'Separate Brazilian browser storage'; storageKeys.set(value, next);
    } else if (value === sourceOrigin || value === profile.origin) {
      replacement = `(globalThis.location.origin+${JSON.stringify(profile.basePath)})`; reason = 'Use the current host and /br/ for the market URL';
    } else if (value.startsWith(sourceOrigin + '/')) {
      const target = new URL(value);
      replacement = `(globalThis.location.origin+${JSON.stringify(mappedPath(target.pathname) + target.search + target.hash)})`; reason = 'Keep own links under /br/';
    } else if (/^\/(?:api|arrependimento|assets|fonts|emoji|ab|img)(?:\/|$)/.test(value)) {
      replacement = JSON.stringify(mappedPath(value)); reason = 'Prefix the Brazilian route, API or asset path';
    } else if (value === '/' && redirectFunctions.some(f => node.start >= f.start && node.end <= f.end)) {
      replacement = JSON.stringify(profile.basePath); reason = 'Return to the Brazilian quiz';
    }
    if (replacement !== undefined) edits.push({ start:node.start, end:node.end, original:value, replacement, reason, file:name });
  }
  edits.sort((a,b) => b.start-a.start);
  for (const edit of edits) source = source.slice(0,edit.start) + edit.replacement + source.slice(edit.end);
  return { source, edits };
}

function relocateHtml(source, name) {
  const edits = [];
  source = source.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (whole, attrs, body) => {
    if (!body.trim() || /\btype\s*=\s*["']application\/ld\+json/i.test(attrs)) return whole;
    const result = relocateJavaScript(body, `${name}:inline-script`);
    edits.push(...result.edits);
    return `<script${attrs}>${result.source}</script>`;
  });
  source = source.replace(/\b(href|src|poster|content)\s*=\s*(["'])(.*?)\2/gi, (whole, attr, quote, value) => {
    let next = value;
    if (value === sourceOrigin || value.startsWith(sourceOrigin + '/')) {
      const target = new URL(value); next = mappedPath(target.pathname) + target.search + target.hash;
    } else if (value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/br/')) next = mappedPath(value);
    if (next !== value) edits.push({ original:value, replacement:next, reason:`Relocate HTML ${attr}`, file:name });
    return `${attr}=${quote}${next}${quote}`;
  });
  source = source.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi,(whole,attrs,body)=>{
    const result=relocateCss(body,name+':inline-style'); edits.push(...result.edits); return `<style${attrs}>${result.source}</style>`;
  });
  if (name === 'index.html') {
    // Copy the existing primary markup, including its highlight, into the
    // alternate text spans. Count nested spans to preserve the rest of the HTML.
    const replacements=[];
    let primary;
    for (const opening of source.matchAll(/<span\b[^>]*\bdata-landing1="(a b|c)"[^>]*>/g)) {
      const start=opening.index+opening[0].length;
      const tags=/<\/?span\b[^>]*>/g; tags.lastIndex=start;
      let depth=1,closing;
      while ((closing=tags.exec(source))) { depth+=closing[0].startsWith('</')?-1:1; if(!depth)break; }
      if(depth)throw new Error('Unbalanced landing text span');
      if(opening[1]==='a b')primary=source.slice(start,closing.index);
      else if(primary!==undefined&&source.slice(start,closing.index)!==primary)replacements.push({start,end:closing.index,replacement:primary,reason:'Match the prerendered Brazilian headline/subheadline to the approved primary copy',file:name});
    }
    for(const edit of replacements.sort((a,b)=>b.start-a.start)){source=source.slice(0,edit.start)+edit.replacement+source.slice(edit.end);edits.push(edit);}
  }
  if (!/<base\b/i.test(source)) { source = source.replace(/<head>/i, `<head><base href="${profile.basePath}">`); edits.push({reason:'Set the Brazilian document base',replacement:profile.basePath,file:name}); }
  return { source, edits };
}

for (const file of await filesBelow(profile.sourceRoot)) {
  const relative = path.relative(profile.sourceRoot,file).split(path.sep).join('/');
  const target = path.join(profile.siteRoot,relative);
  const original = await readFile(file);
  let bytes = original, edits = [];
  if (/\.m?js$/i.test(file)) { const result=relocateJavaScript(original.toString('utf8'),relative); bytes=Buffer.from(result.source); edits=result.edits; }
  else if (/\.html$/i.test(file)) { const result=relocateHtml(original.toString('utf8'),relative); bytes=Buffer.from(result.source); edits=result.edits; }
  else if (/\.css$/i.test(file)) {
    const result=relocateCss(original.toString('utf8'),relative); bytes=Buffer.from(result.source); edits=result.edits;
  }
  await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,bytes);
  files.push({source:file.split(path.sep).join('/'),file:target.split(path.sep).join('/'),bytes:bytes.length,originalSha256:sha(original),sha256:sha(bytes),edits});
}
const report={origin:profile.origin,basePath:profile.basePath,createdAt:new Date().toISOString(),landingCopy,storageKeys:Object.fromEntries(storageKeys),files};
await writeFile(path.join(profile.reportDir,'mount-manifest.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({files:files.length,changed:files.filter(f=>f.edits.length).length,edits:files.reduce((n,f)=>n+f.edits.length,0),storageKeys:storageKeys.size,basePath:profile.basePath}));
