import { parse } from 'acorn';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const ORIGIN = 'https://piano-ugc.pages.dev/';
export const assetExtension = /\.(?:m?js|css|woff2?|ttf|otf|png|jpe?g|webp|avif|svg|gif|json|mp4|webm|mp3|wav|ogg|ico|pdf)(?:[?#].*)?$/i;
export const textExtension = /\.(?:html|m?js|css|json|svg)$/i;

export function walkAst(ast) {
  const nodes = [], stack = [ast];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || !node.type) continue;
    nodes.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) stack.push(...value);
      else if (value && typeof value === 'object' && value.type) stack.push(value);
    }
  }
  return nodes;
}

export function literal(node) {
  if (!node) return undefined;
  if (node.type === 'Literal' && !node.regex) return node.value;
  if (node.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked;
  if (node.type === 'ArrayExpression') return node.elements.map(literal);
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.filter(p => p.type === 'Property').map(p => [p.computed ? literal(p.key) : p.key.name ?? p.key.value, literal(p.value)]));
  if (node.type === 'UnaryExpression') {
    const value = literal(node.argument);
    if (node.operator === '!') return !value;
    if (node.operator === '-') return -value;
    if (node.operator === '+') return +value;
  }
  if (node.type === 'BinaryExpression') {
    const a = literal(node.left), b = literal(node.right);
    if (node.operator === '+') return a + b;
    if (node.operator === '*') return a * b;
    if (node.operator === '-') return a - b;
    if (node.operator === '/') return a / b;
  }
  return undefined;
}

export function analyzeJavaScript(source) {
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const nodes = walkAst(ast);
  const strings = nodes.flatMap(n => {
    if (n.type === 'Literal' && typeof n.value === 'string') return [n.value];
    if (n.type === 'TemplateLiteral' && !n.expressions.length) return [n.quasis[0].value.cooked];
    return [];
  });
  const templates = nodes.filter(n => n.type === 'TemplateLiteral' && n.expressions.length).map(n => source.slice(n.start, n.end)).filter(s => /\.(?:webp|png|jpe?g|js|css|mp4|mp3)|\/api\//.test(s));
  const objects = [];
  for (const statement of ast.body) if (statement.type === 'VariableDeclaration') for (const d of statement.declarations) if (d.init?.type === 'ObjectExpression') objects.push({ name: d.id.name, data: literal(d.init), start: d.start });
  return { strings, templates, objects, ast, nodes };
}

export function discover(source, sourceUrl, options = {}) {
  const origin = options.origin || ORIGIN;
  const aliases = options.aliases || (origin === ORIGIN ? ['piano-ugc.com'] : []);
  const url = new URL(sourceUrl), refs = [], dynamic = [];
  function add(ref, kind = 'asset', base = sourceUrl) {
    if (typeof ref !== 'string' || !ref || /^(?:data:|blob:|mailto:|tel:|javascript:|#)/i.test(ref) || /\$\{|[<>\s{}]/.test(ref)) return;
    try {
      const target = new URL(ref.replaceAll('&amp;', '&'), base);
      // The HTML declares piano-ugc.com as its canonical address, while this
      // recovery uses the public Pages deployment of the same site.
      if (aliases.includes(target.hostname) && assetExtension.test(ref)) target.host = new URL(origin).host;
      if (target.origin !== new URL(origin).origin || /^\/api\//.test(target.pathname)) return;
      target.hash = '';
      if (kind === 'asset') target.search = '';
      refs.push({ url: target.href, source: sourceUrl, reference: ref, kind });
    } catch {}
  }
  if (/\.m?js$/i.test(url.pathname)) {
    const info = analyzeJavaScript(source);
    for (const ref of info.strings) {
      if (assetExtension.test(ref) && !ref.startsWith('.')) add(ref, 'asset', /^(?:assets|img|ab|emoji)\//.test(ref) ? origin : sourceUrl);
      else if (/^\.{1,2}\//.test(ref) && assetExtension.test(ref)) add(ref);
      if (/^\/(?!api\/)[a-z0-9_/-]+\/$/i.test(ref)) add(ref, 'page', origin);
    }
    dynamic.push(...info.templates);
    // This build constructs the photo names from the age choices. Recover the
    // values from the configuration instead of guessing a single tested branch.
    const photo = info.objects.find(o => o.data?.exp === 'landing1' && o.data?.dir);
    const content = info.objects.find(o => o.data?.landing?.firstQuestion?.options);
    if (photo && content) for (const option of content.data.landing.firstQuestion.options) add(`${photo.data.dir}/${option.id.replace(/[^a-z0-9-]/gi, '')}.webp`, 'asset', origin);
    const emoji = info.objects.find(o => o.data?.mobile_phone && o.data?.selfie);
    if (emoji) for (const key of Object.keys(emoji.data)) add(`emoji/${key}.webp`, 'asset', origin);
  } else {
    if (/\.html$/i.test(url.pathname) || !path.posix.extname(url.pathname)) {
      for (const match of source.matchAll(/\b(src|href|poster)\s*=\s*(["'])(.*?)\2/gi)) {
        const ref = match[3];
        if (assetExtension.test(ref)) add(ref);
        else if (match[1].toLowerCase() === 'href' && !ref.includes('?')) add(ref, 'page');
      }
      for (const match of source.matchAll(/\bsrcset\s*=\s*(["'])(.*?)\1/gi)) for (const item of match[2].split(',')) add(item.trim().split(/\s+/)[0]);
      for (const match of source.matchAll(/<meta\b[^>]*\bcontent\s*=\s*(["'])(.*?)\1[^>]*>/gi)) if (assetExtension.test(match[2])) add(match[2]);
    }
    for (const match of source.matchAll(/url\(\s*["']?([^\s)'";]+)["']?\s*\)/gi)) add(match[1]);
    for (const match of source.matchAll(/@import\s+["']([^"']+)["']/gi)) add(match[1]);
  }
  return { refs: [...new Map(refs.map(r => [r.url, r])).values()], dynamic };
}

export function fileForUrl(url, root = 'site') {
  let pathname = decodeURIComponent(new URL(url).pathname);
  if (pathname.endsWith('/') || !path.posix.extname(pathname)) pathname = pathname.replace(/\/?$/, '/index.html');
  const base = path.resolve(root), result = path.resolve(base, '.' + pathname);
  if (result !== base && !result.startsWith(base + path.sep)) throw new Error(`Unsafe path: ${url}`);
  return result;
}

export async function filesBelow(dir, options = {}, root = dir) {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    const relative = path.relative(root, target).split(path.sep).join('/');
    if ((options.exclude || []).some(p => relative === p || relative.startsWith(p + '/'))) continue;
    if (entry.isDirectory()) output.push(...await filesBelow(target, options, root));
    else output.push(target);
  }
  return output;
}

export async function scanSite(root = 'site', options = {}) {
  const origin = options.origin || ORIGIN;
  const refs = [], dynamic = [];
  for (const file of await filesBelow(root, options)) {
    if (!textExtension.test(file)) continue;
    const relative = path.relative(root, file).split(path.sep).join('/');
    const sourceUrl = new URL(relative.endsWith('index.html') ? relative.slice(0, -10) : relative, origin).href;
    const found = discover(await readFile(file, 'utf8'), sourceUrl, options);
    refs.push(...found.refs);
    dynamic.push(...found.dynamic.map(expression => ({ file: relative, expression })));
  }
  return { refs: [...new Map(refs.map(r => [r.url, r])).values()], dynamic };
}
