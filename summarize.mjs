import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const read=async file=>JSON.parse(await readFile(file,'utf8'));
const crawl=await read('reports/crawl-summary.json');
const audit=await read('reports/asset-audit.json');
const local=await read('reports/local-verification.json');
const offers=await read('reports/offer-variants.json');
const {content}=await read('reports/recovered-data.json');
assert.equal(crawl.branches,12);
assert.equal(crawl.passed,12);
assert.equal(audit.missing,0);
assert.equal(local.originalFilesVerified,182);
assert.equal(local.errors.length,0);
assert.equal(local.externalRequests.length,0);
const expected=['landing',...content.steps.map(s=>s.id)];
for(const result of crawl.results){
  assert.equal(result.errors.length,0);
  assert.equal(result.blocked.length,0);
  assert.deepEqual([...result.steps].sort(),[...expected].sort(),result.branch.name);
}
for(const question of [content.landing.firstQuestion,...content.steps.filter(s=>s.kind==='question')]){
  assert.deepEqual([...(crawl.coverage[question.id]||[])].sort(),question.options.map(o=>o.id).sort(),question.id);
}
assert.equal(new Set(crawl.results.map(r=>r.branch.landing+':'+r.branch.result)).size,6);
const phaseCoverage=[...new Set(crawl.results.flatMap(r=>r.phases).filter(p=>p.startsWith('brief-')))];
assert.equal(phaseCoverage.length,17);
assert.equal(offers.errors.length,0);
assert.equal(offers.externalRequests.length,0);
const rows=crawl.results.map(r=>`| ${r.branch.name} | ${r.captures} | ${r.branch.landing}/${r.branch.result} | 19/19 | 0 |`).join('\n');
const text=`# Validação da recuperação\n\nData: 11/11/2026. Origem: https://piano-ugc.pages.dev/.\n\n1. **Frontend local:** zero erros JavaScript, zero pedidos locais falhados e zero pedidos externos nos 12 percursos aprovados. Os pixels estão desativados somente na resposta da prévia local.\n2. **Arquivos:** 182 originais preservados por SHA-256. Auditoria: ${audit.referenced} referências, ${audit.present} presentes, ${audit.missing} pendências. Uma referência é um rótulo de vídeo fictício, confirmado 404 no original; não foi contado como arquivo recuperável.\n3. **Percurso:** 19 etapas principais em cada combinação; 17 fases internas dos briefs (33 posições de fluxo ao expandi-los), com ${crawl.captures} capturas documentadas de estados/feedbacks. Todos chegam à oferta; nenhum compra.\n4. **Ramos:** quatro idades × três preferências de câmera = 12 combinações; todas as opções das perguntas principais foram exercitadas. As seis combinações A/B de landing/resultado foram cobertas. Não há pergunta de gênero no build encontrado. Consentimento sim/não e nome informado/omitido são alternados. Isso não é a enumeração de todas as combinações de todas as respostas.\n5. **Rotas:** raiz, /0/0, /paywall/, /recesso/ e oferta direta respondem 200. As duas rotas de teste profundas usam fallback de SPA e resolvem os assets. /0/0 e /paywall/ são testes de infraestrutura, não etapas originalmente publicadas com esses URLs. Arquivo JS ausente responde 404; API ausente responde 503 explícito. Recarga/retomada e voltar aprovados.\n6. **Documentação:** README descreve o backend ausente, emails que não serão enviados, ausência do banco/credenciais, conta e entrega Hotmart não validadas e limites dos arquivos compilados. A build estática foi gerada; os testes não executam deploy, commit ou push.\n7. **Evidências:** endpoints, IDs e preços vêm do build em reports/bundle-analysis.json e reports/recovered-data.json; menções a Cloudflare/Resend nos termos são identificadas como evidência documental. Nada aqui comprova a recuperação do código privado dos serviços. Segunda proposta e promoção expirada foram testadas por simulação local, sem pagamento.\n\n| Percurso idade/câmera | Capturas | A/B landing/resultado | Etapas | Erros |\n|---|---:|---|---:|---:|\n${rows}\n\nRelatórios: reports/crawl-summary.json, reports/asset-audit.json, reports/local-verification.json e reports/offer-variants.json. Cada capture_* tem HTML, texto, estado, opções e screenshots.\n`;
await writeFile('VALIDACAO.md',text);
console.log(JSON.stringify({passed:12,captures:crawl.captures,mainSteps:19,briefPhases:17,missingAssets:0,originalHashes:182,abCombinations:6},null,2));
