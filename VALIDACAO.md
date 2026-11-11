# Validação da recuperação

Data: 11/11/2026. Origem: https://piano-ugc.pages.dev/.

1. **Frontend local:** zero erros JavaScript, zero pedidos locais falhados e zero pedidos externos nos 12 percursos aprovados. Os pixels estão desativados somente na resposta da prévia local.
2. **Arquivos:** 182 originais preservados por SHA-256. Auditoria: 182 referências, 181 presentes, 0 pendências. Uma referência é um rótulo de vídeo fictício, confirmado 404 no original; não foi contado como arquivo recuperável.
3. **Percurso:** 19 etapas principais em cada combinação; 17 fases internas dos briefs (33 posições de fluxo ao expandi-los), com 753 capturas documentadas de estados/feedbacks. Todos chegam à oferta; nenhum compra.
4. **Ramos:** quatro idades × três preferências de câmera = 12 combinações; todas as opções das perguntas principais foram exercitadas. As seis combinações A/B de landing/resultado foram cobertas. Não há pergunta de gênero no build encontrado. Consentimento sim/não e nome informado/omitido são alternados. Isso não é a enumeração de todas as combinações de todas as respostas.
5. **Rotas:** raiz, /0/0, /paywall/, /recesso/ e oferta direta respondem 200. As duas rotas de teste profundas usam fallback de SPA e resolvem os assets. /0/0 e /paywall/ são testes de infraestrutura, não etapas originalmente publicadas com esses URLs. Arquivo JS ausente responde 404; API ausente responde 503 explícito. Recarga/retomada e voltar aprovados.
6. **Documentação:** README descreve o backend ausente, emails que não serão enviados, ausência do banco/credenciais, conta e entrega Hotmart não validadas e limites dos arquivos compilados. A build estática foi gerada; os testes não executam deploy, commit ou push.
7. **Evidências:** endpoints, IDs e preços vêm do build em reports/bundle-analysis.json e reports/recovered-data.json; menções a Cloudflare/Resend nos termos são identificadas como evidência documental. Nada aqui comprova a recuperação do código privado dos serviços. Segunda proposta e promoção expirada foram testadas por simulação local, sem pagamento.

| Percurso idade/câmera | Capturas | A/B landing/resultado | Etapas | Erros |
|---|---:|---|---:|---:|
| 18-29_volto | 62 | a/a | 19/19 | 0 |
| 18-29_mani_voce | 61 | b/b | 19/19 | 0 |
| 18-29_senza_volto | 62 | c/a | 19/19 | 0 |
| 30-39_volto | 63 | b/b | 19/19 | 0 |
| 30-39_mani_voce | 65 | c/a | 19/19 | 0 |
| 30-39_senza_volto | 63 | a/b | 19/19 | 0 |
| 40-49_volto | 62 | c/a | 19/19 | 0 |
| 40-49_mani_voce | 61 | a/b | 19/19 | 0 |
| 40-49_senza_volto | 64 | b/a | 19/19 | 0 |
| 50plus_volto | 63 | a/b | 19/19 | 0 |
| 50plus_mani_voce | 64 | b/a | 19/19 | 0 |
| 50plus_senza_volto | 63 | c/b | 19/19 | 0 |

Relatórios: reports/crawl-summary.json, reports/asset-audit.json, reports/local-verification.json e reports/offer-variants.json. Cada capture_* tem HTML, texto, estado, opções e screenshots.
