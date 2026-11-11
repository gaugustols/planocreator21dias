import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.argv[2] || 'https://piano-ugc.pages.dev/';
await mkdir('reports', { recursive: true });
const browser = await chromium.launch({ headless: true });
const requests = [], responses = [], errors = [], pages = [];
try {
  for (const [name, suffix] of [['landing', ''], ['landing-b', '?ab=landing1:b'], ['offer', '?ver=oferta']]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('request', r => requests.push({ page: name, method: r.method(), type: r.resourceType(), url: r.url() }));
    page.on('response', r => responses.push({ page: name, status: r.status(), type: r.request().resourceType(), url: r.url() }));
    page.on('requestfailed', r => errors.push({ page: name, type: 'network', url: r.url(), error: r.failure()?.errorText }));
    page.on('pageerror', e => errors.push({ page: name, type: 'javascript', error: e.message }));
    await page.goto(new URL(suffix, origin).href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3500);
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += innerHeight) { scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); } scrollTo(0, 0); });
    await page.waitForTimeout(1000);
    const data = { name, url: page.url(), title: await page.title(), text: await page.locator('body').innerText(), links: await page.locator('a').evaluateAll(es => es.map(e => ({ text: e.innerText, href: e.href }))) };
    pages.push(data);
    await writeFile(`reports/live-${name}.html`, await page.content());
    await writeFile(`reports/live-${name}.txt`, data.text);
    await page.screenshot({ path: `reports/live-${name}.png`, fullPage: true });
    if (name === 'landing') {
      for (const [label, hash] of [['privacy', '#privacy'], ['terms', '#termini']]) {
        await page.locator(`a[href="${hash}"]`).click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        await writeFile(`reports/live-${label}.txt`, await dialog.innerText());
        await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
      }
    }
    await context.close();
  }
} finally { await browser.close(); }
const domains = Object.entries(Object.groupBy(requests, r => new URL(r.url).hostname)).map(([domain, entries]) => ({ domain, requests: entries.length, types: [...new Set(entries.map(e => e.type))] }));
await writeFile('reports/reconnaissance.json', JSON.stringify({ origin, capturedAt: new Date().toISOString(), domains, requests, responses, errors, pages }, null, 2));
console.log(JSON.stringify({ domains, errors, pages: pages.map(p => ({ name: p.name, title: p.title, characters: p.text.length })) }, null, 2));
