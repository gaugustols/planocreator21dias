import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { discover, fileForUrl, textExtension } from './lib/assets.mjs';
import { getProfile } from './lib/profiles.mjs';

const profile = getProfile();
const ORIGIN = profile.origin;
const report = file => path.join(profile.reportDir, file);

await mkdir(profile.sourceRoot, { recursive: true });
await mkdir(profile.reportDir, { recursive: true });
const previous = await readFile(report('mirror-manifest.json'), 'utf8').then(JSON.parse).catch(() => ({ files: [], unavailable: [] }));
const records = new Map(previous.files.map(r => [r.url, r]));
const unavailable = new Map(previous.unavailable.map(r => [r.url, r]));
const queue = [ORIGIN, new URL('robots.txt', ORIGIN).href, new URL('sitemap.xml', ORIGIN).href];
try {
  const network = JSON.parse(await readFile(report('reconnaissance.json'), 'utf8'));
  for (const r of network.requests) if (r.method === 'GET' && new URL(r.url).origin === new URL(ORIGIN).origin && !/^\/api\//.test(new URL(r.url).pathname)) { const u = new URL(r.url); u.search = ''; queue.push(u.href); }
} catch {}
const seen = new Set();
let downloaded = 0, reused = 0;
while (queue.length) {
  const batch = [...new Set(queue.splice(0, 8))].filter(url => !seen.has(url));
  batch.forEach(url => seen.add(url));
  await Promise.all(batch.map(async url => {
    const file = fileForUrl(url, profile.sourceRoot);
    let buffer;
    if (!process.argv.includes('--refresh') && await access(file).then(() => true).catch(() => false)) {
      buffer = await readFile(file); reused++;
    } else {
      if (!process.argv.includes('--retry-unavailable') && unavailable.has(url)) return;
      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'follow' }); break; }
        catch (error) { if (attempt === 2) { unavailable.set(url, { url, status: 'network-error', reason: error.message }); return; } }
      }
      const type = response.headers.get('content-type') || '';
      buffer = Buffer.from(await response.arrayBuffer());
      const ext = path.extname(new URL(url).pathname);
      const wrongHtml = ext && ext !== '.html' && /text\/html/i.test(type);
      if (!response.ok || wrongHtml) {
        unavailable.set(url, { url, status: response.status, contentType: type, reason: wrongHtml ? 'SPA fallback: HTML returned instead of the requested asset' : 'HTTP error' });
        return;
      }
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, buffer);
      downloaded++;
      records.set(url, { url, file: path.relative('.', file).split(path.sep).join('/'), bytes: buffer.length, contentType: type, sha256: createHash('sha256').update(buffer).digest('hex') });
      unavailable.delete(url);
    }
    if (textExtension.test(file)) queue.push(...discover(buffer.toString('utf8'), url, profile).refs.map(r => r.url));
  }));
  if (batch.length) console.log(`Processed ${seen.size}: ${downloaded} downloaded, ${reused} reused, ${unavailable.size} unavailable; ${queue.length} queued`);
}
const result = { origin: ORIGIN, updatedAt: new Date().toISOString(), files: [...records.values()], unavailable: [...unavailable.values()] };
await writeFile(report('mirror-manifest.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ downloaded, reused, files: records.size, unavailable: unavailable.size }));
