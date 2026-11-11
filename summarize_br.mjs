import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const read=async file=>JSON.parse(await readFile(file,'utf8'));
const crawl=await read('reports/br/crawl-summary.json');
const webkit=await read('reports/br/crawl-summary-webkit.json');
const audit=await read('reports/br/asset-audit.json');
const local=await read('reports/br/local-verification.json');
const offers=await read('reports/br/offer-variants.json');
const mount=await read('reports/br/mount-manifest.json');
const {content}=await read('reports/br/recovered-data.json');
assert.equal(crawl.branches,12); assert.equal(crawl.passed,12);
assert.equal(webkit.branches,1); assert.equal(webkit.passed,1);
assert.equal(audit.missing,0);
assert.equal(local.originalFilesVerified,364); assert.equal(local.mountedFilesVerified,182);
assert.equal(local.storageIsolation,true);
assert.equal(local.errors.length,0); assert.equal(local.externalRequests.length,0); assert.equal(local.crossLocaleRequests.length,0);
assert.equal(offers.errors.length,0); assert.equal(offers.purchasesSubmitted,0);
const expected=['landing',...content.steps.map(s=>s.id)].sort();
for(const result of [...crawl.results,...webkit.results]){
  assert.equal(result.errors.length,0); assert.equal(result.blocked.length,0);
  assert.deepEqual([...result.steps].sort(),expected,result.branch.name);
  const dir=`capture_br_${result.browser==='webkit'?'webkit_':''}${result.branch.name}`;
  const steps=await read(`${dir}/steps.json`);
  const allowed=new Set(['summary.json','steps.json','final-state.json','offer-full.png',...steps.flatMap(s=>['html','txt','json','png'].map(ext=>`${s.id}.${ext}`))]);
  const absolute=path.resolve(dir);
  assert(absolute.startsWith(path.resolve('.')+path.sep));
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(entry.isFile()&&!allowed.has(entry.name)&&(/^[0-9]{3}_.+\.(?:html|txt|json|png)$/.test(entry.name)||/^failure\.(?:html|png)$/.test(entry.name)))await unlink(path.join(absolute,entry.name));
  }
}
for(const question of [content.landing.firstQuestion,...content.steps.filter(s=>s.kind==='question')])assert.deepEqual([...(crawl.coverage[question.id]||[])].sort(),question.options.map(o=>o.id).sort(),question.id);
const ab=new Set(crawl.results.map(r=>r.branch.landing+':'+r.branch.result)); assert.equal(ab.size,6);
const phases=new Set(crawl.results.flatMap(r=>r.phases).filter(p=>p.startsWith('brief-'))); assert.equal(phases.size,17);
const rows=crawl.results.map(r=>`| ${r.branch.name} | ${r.viewport.width} × ${r.viewport.height} | ${r.captures} | ${r.branch.landing}/${r.branch.result} | 19/19 | 0 |`).join('\n');
const text=`# Validação da versão brasileira em /br/\n\nRecuperação de https://trilha-ugc.pages.dev/, verificada em 11/11/2026.\n\n1. **Fluxo:** 12/12 combinações brasileiras aprovadas em Chromium com toque e configuração móvel; 19 etapas principais e 17 fases dos briefings em cada percurso. São 33 posições de fluxo ao expandir os três briefings. Foram registradas **${crawl.captures} capturas de estados** nesses 12 percursos.\n2. **WebKit:** um percurso completo adicional aprovado com configuração móvel, 19 etapas, ${webkit.captures} capturas. Isso testa o motor WebKit em automação no Windows; não é um teste em Safari/iPhone físico.\n3. **Recursos:** zero erros de JavaScript, zero pedidos locais falhados e zero pedidos externos nos percursos aprovados. Auditoria original: ${audit.referenced} referências, ${audit.present} presentes, zero pendências recuperáveis. O rótulo video_final.mp4 foi confirmado 404 no original e não é carregado pela simulação.\n4. **Integridade:** 364 arquivos originais conferidos por SHA-256 (182 italianos + 182 brasileiros). A cópia brasileira adaptada tem 182 arquivos; quatro foram modificados por ${mount.files.reduce((n,f)=>n+f.edits.length,0)} substituições/inserções documentadas. Os 182 originais italianos mantiveram seus bytes.\n5. **Ramos e telas:** quatro idades × três preferências de câmera, todas as opções individuais das perguntas principais, seis combinações A/B, consentimento sim/não e nome informado/omitido. Não há pergunta de gênero no build. Isso não enumera o produto cartesiano de todas as respostas possíveis. A página inicial também passou sem rolagem horizontal em 320, 360, 390 e 430 px.\n6. **Separação:** na mesma aba/origem, respostas, nome, UTMs e contador próprios permaneceram separados entre italiano e português. Recarga, voltar e função de retorno ao quiz brasileiro foram aprovados. Nenhum recurso da navegação brasileira testada escapou de /br/, incluindo as fontes da página de arrependimento. As 16 chaves próprias usam ugc-br-*.\n7. **Rotas e ofertas:** /br redireciona para /br/ preservando query; /br/0/0 e /br/paywall/ respondem 200 com fallback brasileiro e assets sob /br/. São rotas de teste de infraestrutura, não etapas originalmente publicadas nesses URLs. /br/arrependimento/ e oferta direta funcionam; arquivos ausentes respondem 404 e /br/api/* retorna 503 explícito. Links Hotmart usam o produto brasileiro K108118162G. A segunda proposta de R$ 24,90 e a mensagem de promoção expirada foram verificadas por simulação local. Nenhum botão de pagamento foi acionado.\n8. **Limites:** o backend privado, banco de leads, Resend, webhooks, arquivos pagos e entrega/validação de compra não foram recuperados. Os valores e IDs comerciais são os encontrados nos arquivos públicos. A build das duas versões foi gerada e as regras de publicação verificadas localmente; isso não é um deploy.\n\n| Percurso idade/câmera | Viewport mobile | Capturas | A/B landing/resultado | Etapas | Erros |\n|---|---|---:|---|---:|---:|\n${rows}\n\nRelatórios: reports/br/crawl-summary.json, reports/br/crawl-summary-webkit.json, reports/br/asset-audit.json, reports/br/local-verification.json, reports/br/storage-isolation.json, reports/br/offer-variants.json e reports/br/mount-manifest.json.\n`;
await writeFile('VALIDACAO-BR.md',text);
console.log(JSON.stringify({chromiumPassed:12,webkitPassed:1,captures:crawl.captures,webkitCaptures:webkit.captures,originalHashes:local.originalFilesVerified,mountedFiles:mount.files.length,missingAssets:0,storageIsolation:true},null,2));
