import { access, readFile, writeFile } from 'node:fs/promises';
import { scanSite, fileForUrl } from './lib/assets.mjs';
import { getProfile } from './lib/profiles.mjs';
import path from 'node:path';

const profile = getProfile();
const { refs, dynamic } = await scanSite(profile.sourceRoot, profile);
const manifest = JSON.parse(await readFile(path.join(profile.reportDir, 'mirror-manifest.json'), 'utf8'));
const unavailable = new Map(manifest.unavailable.map(r => [r.url, r]));
const present = [], absentOnOrigin = [], missing = [];
for (const ref of refs) {
  if (await access(fileForUrl(ref.url, profile.sourceRoot)).then(() => true).catch(() => false)) present.push(ref);
  else {
    let reason = unavailable.get(ref.url);
    if (process.argv.includes('--verify-remote')) {
      try {
        const response = await fetch(ref.url, { signal: AbortSignal.timeout(15000) });
        const contentType = response.headers.get('content-type') || '';
        reason = !response.ok || /text\/html/.test(contentType) && /\.[a-z0-9]+$/i.test(new URL(ref.url).pathname) ? { status: response.status, contentType, reason: 'Verified HTTP error or SPA HTML fallback' } : undefined;
        await response.body?.cancel();
      } catch (e) { reason = undefined; }
    }
    if (reason && reason.status !== 'network-error') absentOnOrigin.push({ ...ref, ...reason });
    else missing.push(ref);
  }
}
const result = { checkedAt: new Date().toISOString(), referenced: refs.length, present: present.length, missing: missing.length, absentOnOrigin: absentOnOrigin.length, dynamicExpressions: dynamic, missingFiles: missing, originUnavailableFiles: absentOnOrigin };
await writeFile(path.join(profile.reportDir, 'asset-audit.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (missing.length) process.exitCode = 1;
