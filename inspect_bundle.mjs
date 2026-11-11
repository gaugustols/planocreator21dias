import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { analyzeJavaScript, filesBelow } from './lib/assets.mjs';

const details = [];
let config, content;
for (const file of await filesBelow('site')) {
  if (!/\.m?js$/.test(file)) continue;
  const source = await readFile(file, 'utf8');
  const info = analyzeJavaScript(source);
  config ||= info.objects.find(o => o.data?.brandName && o.data?.checkoutUrl)?.data;
  content ||= info.objects.find(o => o.data?.landing?.firstQuestion && o.data?.steps)?.data;
  const endpoints = [...new Set(info.strings.filter(s => /^\/api\//.test(s)))];
  const externalUrls = [...new Set(info.strings.filter(s => /^https?:\/\//.test(s)))];
  const routes = [...new Set(info.strings.filter(s => /^\/(?!api\/)[a-z0-9_/-]+\/$/i.test(s)))];
  const evidence = [];
  for (const term of [...endpoints, 'sendDefaultPii', 'Sentry', 'sessionReplay', 'LaunchDarkly', 'firebase', 'remoteConfig', 'hotmart', 'pay.hotmart', 'ugc-m-off', 'localhost']) {
    let index = source.indexOf(term);
    if (index >= 0) evidence.push({ term, characterOffset: index, snippet: source.slice(Math.max(0, index - 240), index + 650) });
  }
  const requestFunctions = info.nodes.filter(n => n.type === 'FunctionDeclaration' && n.id && /(?:fetch\(|sendBeacon|XMLHttpRequest|\/api\/)/.test(source.slice(n.start, n.end))).map(n => ({ name: n.id.name, start: n.start, source: source.slice(n.start, n.end) }));
  details.push({ file: path.relative('.', file).split(path.sep).join('/'), endpoints, externalUrls, routes, templates: info.templates, evidence, requestFunctions });
}
await writeFile('reports/recovered-data.json', JSON.stringify({ config, content }, null, 2));
await writeFile('reports/bundle-analysis.json', JSON.stringify(details, null, 2));
console.log(JSON.stringify({ config, steps: content?.steps?.map(s => ({ id: s.id, kind: s.kind, title: s.title, options: s.options?.map(o => o.id), phases: s.kind === 'brief' ? ['notification','brief','hook', ...(s.storyboard?.scenes?.length > 1 ? ['storyboard'] : []), 'record', ...(s.closing?.options?.length ? ['closing'] : []), 'delivery'] : undefined })), files: details.map(d => ({ file: d.file, endpoints: d.endpoints, routes: d.routes })) }, null, 2));
