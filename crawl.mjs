import { chromium, webkit, devices } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getProfile } from './lib/profiles.mjs';

const profile = getProfile();
const engine = process.argv.find(a=>a.startsWith('--browser='))?.split('=')[1] || 'chromium';
if (!['chromium','webkit'].includes(engine)) throw new Error(`Unsupported browser: ${engine}`);
const base = process.env.CRAWL_URL || `http://127.0.0.1:4173${profile.basePath}`;
const stateKey = profile.storagePrefix + 'funnel-v1';
const reportFile = `${profile.reportDir}/crawl-summary${engine==='chromium'?'':'-'+engine}.json`;
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw new Error('The crawler only runs on the local mirror.');
const { config, content } = JSON.parse(await readFile(`${profile.reportDir}/recovered-data.json`, 'utf8'));
const ages = content.landing.firstQuestion.options.map(o => o.id);
const cameras = content.steps.find(s => s.id === 'camera').options.map(o => o.id);
const allBranches = ages.flatMap((age, a) => cameras.map((camera, c) => ({ index: a * cameras.length + c, name: `${age.replace('+','plus')}_${camera}`, age, camera, landing: ['a','b','c'][(a+c)%3], result: ['a','b'][(a+c)%2] })));
const branches = process.argv.includes('--pilot') ? allBranches.slice(0, 1) : allBranches;
const browser = await ({chromium,webkit}[engine]).launch({ headless: true });

// Read candidate controls in the page and tag them before clicking. The
// fallback cascades through the app pattern, grids, semantic controls and
// outermost pointer elements; fixed Continue controls are read globally.
async function candidates(page) {
  return page.evaluate(() => {
    const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
    const patterns = ['[data-testid="option"], [data-testid="task-option"], [data-testid="scene"]', 'main div[class*="grid"] > *', 'main button, main [role="button"], main label'];
    let options = [];
    for (const selector of patterns) { options = [...document.querySelectorAll(selector)].filter(visible); if (options.length) break; }
    if (!options.length) {
      options = [...document.querySelectorAll('main *')].filter(e => visible(e) && getComputedStyle(e).cursor === 'pointer');
      options = options.filter(e => !options.some(p => p !== e && p.contains(e)));
    }
    while (options.length === 1) {
      let children = [...options[0].children].filter(visible);
      while (children.length === 1 && children[0].children.length) children = [...children[0].children].filter(visible);
      if (children.length < 2 || options[0].matches('button, [role="button"], label')) break;
      options = children;
    }
    const globalControls = [...document.querySelectorAll('button, [role="button"], a[data-testid]')].filter(visible);
    return [...new Set([...options, ...globalControls])].map((e, i) => {
      e.setAttribute('data-crawl-i', String(i));
      return { index:i, tag:e.tagName, testid:e.getAttribute('data-testid'), option:e.getAttribute('data-option-id'), order:e.getAttribute('data-order'), correct:e.getAttribute('data-correct'), checked:e.getAttribute('aria-checked'), disabled:!!e.disabled || e.getAttribute('aria-disabled') === 'true', text:(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0,900) };
    });
  });
}

async function run(branch) {
  const dir = `${profile.capturePrefix}${engine==='chromium'?'':engine+'_'}${branch.name}`;
  await mkdir(dir, { recursive:true });
  const previous = process.argv.includes('--resume') ? await readFile(`${dir}/summary.json`, 'utf8').then(JSON.parse).catch(()=>null) : null;
  if (previous?.success) { console.log(`${branch.name}: reusing verified complete capture`); return previous; }
  const previousSteps = previous ? await readFile(`${dir}/steps.json`, 'utf8').then(JSON.parse).catch(()=>[]) : [];
  const mobile = profile.id === 'br';
  const viewport = mobile ? [{width:360,height:800},{width:390,height:844},{width:430,height:932}][branch.index%3] : {width:390,height:844};
  const device = devices[engine==='webkit'?'iPhone 13':'Pixel 7'];
  const context = await browser.newContext({ viewport, reducedMotion:'reduce', ...(mobile?{isMobile:true,hasTouch:true,userAgent:device.userAgent}: {}) });
  const page = await context.newPage();
  const errors = [], requests = [], blocked = [], captures = [], actions = [], choices = {};
  if (previousSteps.length) { captures.push(...previousSteps); Object.assign(choices, previous.choices); }
  const wrongAttempts = new Set();
  page.setDefaultTimeout(8000);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['http:','https:'].includes(url.protocol) && url.origin !== new URL(base).origin) { blocked.push({ method:route.request().method(), url:url.href }); return route.abort('blockedbyclient'); }
    if (profile.id === 'br' && ['http:','https:'].includes(url.protocol) && !url.pathname.startsWith(profile.basePath)) { blocked.push({url:url.href,reason:'Brazilian request escaped /br/'}); return route.abort('blockedbyclient'); }
    return route.continue();
  });
  page.on('request', r => requests.push({ method:r.method(), type:r.resourceType(), url:r.url() }));
  page.on('pageerror', e => errors.push({ type:'javascript', message:e.message }));
  page.on('requestfailed', r => errors.push({ type:'network', url:r.url(), error:r.failure()?.errorText }));
  page.on('response', r => { if (r.status() >= 400) errors.push({ type:'http', status:r.status(), url:r.url() }); });
  let success = false, failure = null, lastSignature = '', idleSince = Date.now();
  try {
    await context.addInitScript(({landing,result,resumeState,storagePrefix}) => {
      sessionStorage.setItem(storagePrefix+'ab-v1', JSON.stringify({landing1:landing+'!', result1:result+'!'}));
      if (resumeState) sessionStorage.setItem(storagePrefix+'funnel-v1', JSON.stringify(resumeState));
      localStorage.setItem(storagePrefix+'muted-v1', 'true');
      localStorage.setItem(storagePrefix+'m-off', '1');
    }, { ...branch, resumeState:previousSteps.at(-1)?.state, storagePrefix:profile.storagePrefix });
    await page.goto(base, { waitUntil:'networkidle', timeout:30000 });
    for (let iteration = 0; iteration < 180; iteration++) {
      await page.waitForTimeout(600);
      const state = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key) || 'null'), stateKey);
      const section = page.locator('main [data-step]').first();
      const step = await section.getAttribute('data-step');
      const phase = await section.getAttribute('data-phase') || '';
      const kind = await section.getAttribute('data-kind') || (step === 'landing' ? 'landing' : '');
      const options = await candidates(page);
      const signature = JSON.stringify([step,phase,state?.stepIndex,options.map(o=>[o.testid,o.option,o.correct,o.checked,o.disabled,o.order]), await page.locator('[data-stage]').evaluateAll(es=>es.map(e=>e.getAttribute('data-stage')))]);
      if (signature === lastSignature && Date.now()-idleSince>18000) throw new Error(`No progress at ${step}:${phase}; controls: ${JSON.stringify(options)}`);
      if (signature !== lastSignature) {
        idleSince = Date.now(); lastSignature = signature;
        const sequence = String(captures.length+1).padStart(3,'0'), id = `${sequence}_${step}_${phase || kind}`.replace(/[^a-z0-9_-]/gi,'_');
        const text = await page.locator('body').innerText();
        const data = { sequence:Number(sequence), id, url:page.url(), step, phase, kind, title:await page.locator('main h1, main h2').first().innerText().catch(()=>''), options, state, textSha256:createHash('sha256').update(text).digest('hex') };
        await writeFile(`${dir}/${id}.html`, await page.content());
        await writeFile(`${dir}/${id}.txt`, text);
        await writeFile(`${dir}/${id}.json`, JSON.stringify(data,null,2));
        await page.screenshot({ path:`${dir}/${id}.png`, fullPage:true, timeout:30000 });
        captures.push(data);
        console.log(`${branch.name}: ${captures.length} ${step}${phase?':'+phase:''}`);
      }
      if (kind === 'result' || step === 'risultato' || await page.getByTestId('checkout').count()) { success = true; break; }
      const entry = step === 'landing' ? content.landing.firstQuestion : content.steps.find(s=>s.id===step);
      const click = async candidate => {
        if (!candidate || candidate.disabled) return false;
        const current = page.locator('main [data-step]').first();
        if (await current.getAttribute('data-step') !== step || (await current.getAttribute('data-phase') || '') !== phase) return false;
        const target = page.locator(`[data-crawl-i="${candidate.index}"]`);
        // Timed screens can replace their DOM while a screenshot is written.
        // Re-tag on the next loop if the captured control was replaced. Do not
        // reconstruct a text selector: innerText inserts line breaks between
        // inline spans that are absent from the DOM text used by selectors.
        try { if (mobile) await target.tap({timeout:1500}); else await target.click({timeout:1500}); }
        catch (error) { if (/Timeout|detached|not attached/.test(error.message)) return false; throw error; }
        actions.push({ step, phase, target:candidate });
        return true;
      };
      const enabled = options.filter(o=>!o.disabled);
      const primary = enabled.find(o=>o.testid==='primary');
      if (kind === 'email') {
        const input = page.locator('main input[type="email"], main input[inputmode="email"]').first();
        if (await input.inputValue() !== 'recuperacao.teste@example.com') await input.fill('recuperacao.teste@example.com');
        await click(primary); continue;
      }
      if (kind === 'name') {
        if (branch.index % 2) await click(enabled.find(o=>o.testid==='name-skip'));
        else { await page.getByTestId('name-input').fill('Recuperacao'); await click(primary); }
        continue;
      }
      if (kind === 'optin') { await click(branch.index % 2 ? enabled.find(o=>o.testid==='optin-no') : primary); continue; }
      if (kind === 'scratch') { await click(enabled.find(o=>o.testid==='scratch-reveal') || primary); continue; }
      if (kind === 'analysis' && phase === 'question') {
        const id = entry.midQuestion.options[branch.index % entry.midQuestion.options.length].id;
        choices[`${entry.id}:midQuestion`] = [id];
        await click(enabled.find(o=>o.testid==='option'&&o.option===id)); continue;
      }
      if (kind === 'question' || kind === 'landing') {
        const optionsHere = enabled.filter(o=>o.testid==='option');
        if (entry.multi) {
          const targets = [entry.options[branch.index%entry.options.length].id, entry.options[(branch.index+1)%entry.options.length].id];
          const next = optionsHere.find(o=>targets.includes(o.option)&&o.checked!=='true');
          if (next) { await click(next); continue; }
          choices[entry.id] = targets; await click(primary); continue;
        }
        const id = step === 'landing' ? branch.age : step === 'camera' ? branch.camera : entry.options[branch.index%entry.options.length].id;
        choices[entry.id] = [id];
        await click(optionsHere.find(o=>o.option===id)); continue;
      }
      if (kind === 'brief') {
        if (primary) { await click(primary); continue; }
        if (phase === 'hook' || phase === 'closing') {
          const key = step+':'+phase;
          const tasks = enabled.filter(o=>o.testid==='task-option');
          if (tasks.length) {
            const incorrect = tasks.filter(o=>o.correct==='false');
            if (!wrongAttempts.has(key) && incorrect.length) { wrongAttempts.add(key); await click(incorrect[branch.index%incorrect.length]); }
            else await click(tasks.find(o=>o.correct==='true'));
            continue;
          }
        }
        if (phase === 'storyboard') { await click(enabled.filter(o=>o.testid==='scene').sort((a,b)=>Number(a.order)-Number(b.order))[0]); continue; }
        if (phase === 'record') { const record=enabled.find(o=>o.testid==='record'); if(record) {await click(record); continue;} }
      }
      if (primary) { await click(primary); continue; }
      if (Date.now()-idleSince>18000) throw new Error(`No progress at ${step}:${phase}; controls: ${JSON.stringify(options)}`);
    }
    if (!success) throw new Error('The action limit was reached before the offer.');
    await page.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=innerHeight){scrollTo(0,y);await new Promise(r=>setTimeout(r,40));}scrollTo(0,0)});
    await page.screenshot({path:`${dir}/offer-full.png`,fullPage:true,timeout:30000});
    await writeFile(`${dir}/final-state.json`, JSON.stringify(await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),stateKey),null,2));
  } catch(error) {
    failure=error.stack; console.error(`${branch.name}: FAILED ${error.message}`);
    await page.screenshot({path:`${dir}/failure.png`,fullPage:true,timeout:30000}).catch(()=>{});
    await writeFile(`${dir}/failure.html`,await page.content()).catch(()=>{});
  } finally { await context.close(); }
  const summary={branch,locale:profile.id,browser:engine,viewport,touch:mobile,success:success&&!errors.length&&!blocked.length,funnelReachedOffer:success,failure,captures:captures.length,steps:[...new Set(captures.map(c=>c.step))],phases:[...new Set(captures.filter(c=>c.phase).map(c=>`${c.step}:${c.phase}`))],choices,errors,blocked,requests,actions};
  await writeFile(`${dir}/summary.json`,JSON.stringify(summary,null,2));
  await writeFile(`${dir}/steps.json`,JSON.stringify(captures,null,2));
  return summary;
}

const results=[];
try {
  for(let i=0;i<branches.length;i+=3) results.push(...await Promise.all(branches.slice(i,i+3).map(run)));
} finally { await browser.close(); }
const coverage={};
for(const result of results) for(const[key,values]of Object.entries(result.choices)) coverage[key]=[...new Set([...(coverage[key]||[]),...values])];
const report={checkedAt:new Date().toISOString(),base,locale:profile.id,browser:engine,branches:results.length,passed:results.filter(r=>r.success).length,captures:results.reduce((n,r)=>n+r.captures,0),coverage,results};
await writeFile(reportFile,JSON.stringify(report,null,2));
console.log(JSON.stringify({branches:report.branches,passed:report.passed,captures:report.captures,coverage},null,2));
if(report.passed!==report.branches)process.exitCode=1;
