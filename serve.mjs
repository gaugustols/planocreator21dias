import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { analyzeJavaScript } from './lib/assets.mjs';
import { profiles } from './lib/profiles.mjs';
import { analyticsHandler } from './analytics/handler.mjs';

const root = path.resolve('site');
const port = Number(process.env.PORT || 4173);
const originalIntegrations = process.argv.includes('--original-integrations');
const contentTypes = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.mjs':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.ico':'image/x-icon', '.woff2':'font/woff2', '.woff':'font/woff', '.txt':'text/plain; charset=utf-8', '.xml':'application/xml', '.mp4':'video/mp4' };
const cache = new Map();
async function serve(request, response) {
  response.setHeader('X-Recovery-Server', 'planocreator21dias-v1');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  const url = new URL(request.url, 'http://127.0.0.1');
  if (/^\/api\/analytics\/?$/.test(url.pathname)) { await analyticsHandler(request, response); return; }
  if (url.pathname === '/painel') { response.writeHead(308,{Location:'/painel/'}); response.end(); return; }
  if (url.pathname.startsWith('/painel/')) {
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    response.setHeader('Referrer-Policy', 'no-referrer');
  }
  if (url.pathname === '/__recovery/status') {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ root, port, pid:process.pid, originalIntegrations, backendRecovered: false, locales:{it:'/',br:'/br/'} })); return;
  }
  if (url.pathname === '/br') { response.writeHead(308,{Location:'/br/'+url.search}); response.end(); return; }
  const profile = url.pathname.startsWith('/br/') ? profiles.br : profiles.it;
  if (url.pathname.startsWith(profile.basePath+'api/')) {
    response.writeHead(503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Backend not included in the recovered public files', endpoint: url.pathname })); return;
  }
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { response.writeHead(400); response.end(); return; }
  let file = path.resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
  let info = await stat(file).catch(() => null);
  if (info?.isDirectory()) { file = path.join(file, 'index.html'); info = await stat(file).catch(() => null); }
  let fallback = false;
  if (!info?.isFile()) {
    if (path.extname(pathname)) { response.writeHead(404); response.end('Asset not found'); return; }
    file = path.join(root, profile.basePath.slice(1), 'index.html'); fallback = true;
  }
  let buffer = await readFile(file);
  if (!originalIntegrations && /[/\\]assets[/\\]index-[^/\\]+\.js$/.test(file)) {
    if (!cache.has(file)) {
      let source = buffer.toString('utf8');
      const info = analyzeJavaScript(source);
      const declaration = info.nodes.find(n => n.type === 'VariableDeclarator' && n.init?.type === 'ObjectExpression' && n.init.properties.some(p => p.key?.name === 'brandName'));
      const replacements = (declaration?.init.properties || []).filter(p => ['metaPixelId','utmify'].includes(p.key?.name)).map(p => ({ start: p.value.start, end: p.value.end, text: p.key.name === 'utmify' ? '{pixelId:"",utmsScript:false,metaPixelIds:[]}' : '""' })).sort((a,b) => b.start-a.start);
      for (const r of replacements) source = source.slice(0, r.start) + r.text + source.slice(r.end);
      cache.set(file, Buffer.from(source));
    }
    buffer = cache.get(file);
    response.setHeader('X-Recovery-Integrations', 'pixels-disabled-for-local-preview');
  }
  if (fallback && !/<base\b/i.test(buffer.toString('utf8'))) buffer = Buffer.from(buffer.toString('utf8').replace('<head>', `<head><base href="${profile.basePath}">`));
  response.setHeader('Content-Type', contentTypes[path.extname(file).toLowerCase()] || 'application/octet-stream');
  response.setHeader('Content-Length', buffer.length);
  if (fallback) response.setHeader('X-Recovery-SPA-Fallback', 'index.html');
  response.writeHead(200);
  response.end(request.method === 'HEAD' ? undefined : buffer);
}
const server = createServer((req, res) => serve(req, res).catch(error => { console.error(error); if (!res.headersSent) res.writeHead(500); res.end('Internal server error'); }));
server.listen(port, '127.0.0.1', () => console.log(`Recovered funnel: http://127.0.0.1:${port} (pixels ${originalIntegrations ? 'original' : 'disabled'}; backend not recovered)`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
