# Validação da versão brasileira em /br/

Recuperação de https://trilha-ugc.pages.dev/, verificada em 11/11/2026.

1. **Fluxo:** 12/12 combinações brasileiras aprovadas em Chromium com toque e configuração móvel; 19 etapas principais e 17 fases dos briefings em cada percurso. São 33 posições de fluxo ao expandir os três briefings. Foram registradas **740 capturas de estados** nesses 12 percursos.
2. **WebKit:** um percurso completo adicional aprovado com configuração móvel, 19 etapas, 62 capturas. Isso testa o motor WebKit em automação no Windows; não é um teste em Safari/iPhone físico.
3. **Recursos:** zero erros de JavaScript, zero pedidos locais falhados e zero pedidos externos nos percursos aprovados. Auditoria original: 182 referências, 181 presentes, zero pendências recuperáveis. O rótulo video_final.mp4 foi confirmado 404 no original e não é carregado pela simulação.
4. **Integridade:** 364 arquivos originais conferidos por SHA-256 (182 italianos + 182 brasileiros). A cópia brasileira adaptada tem 182 arquivos; quatro foram modificados por 38 substituições/inserções documentadas. Os 182 originais italianos mantiveram seus bytes.
5. **Ramos e telas:** quatro idades × três preferências de câmera, todas as opções individuais das perguntas principais, seis combinações A/B, consentimento sim/não e nome informado/omitido. Não há pergunta de gênero no build. Isso não enumera o produto cartesiano de todas as respostas possíveis. A página inicial também passou sem rolagem horizontal em 320, 360, 390 e 430 px.
6. **Separação:** na mesma aba/origem, respostas, nome, UTMs e contador próprios permaneceram separados entre italiano e português. Recarga, voltar e função de retorno ao quiz brasileiro foram aprovados. Nenhum recurso da navegação brasileira testada escapou de /br/, incluindo as fontes da página de arrependimento. As 16 chaves próprias usam ugc-br-*.
7. **Rotas e ofertas:** /br redireciona para /br/ preservando query; /br/0/0 e /br/paywall/ respondem 200 com fallback brasileiro e assets sob /br/. São rotas de teste de infraestrutura, não etapas originalmente publicadas nesses URLs. /br/arrependimento/ e oferta direta funcionam; arquivos ausentes respondem 404 e /br/api/* retorna 503 explícito. Links Hotmart usam o produto brasileiro K108118162G. A segunda proposta de R$ 24,90 e a mensagem de promoção expirada foram verificadas por simulação local. Nenhum botão de pagamento foi acionado.
8. **Limites:** o backend privado, banco de leads, Resend, webhooks, arquivos pagos e entrega/validação de compra não foram recuperados. Os valores e IDs comerciais são os encontrados nos arquivos públicos. A build das duas versões foi gerada e as regras de publicação verificadas localmente; isso não é um deploy.

| Percurso idade/câmera | Viewport mobile | Capturas | A/B landing/resultado | Etapas | Erros |
|---|---|---:|---|---:|---:|
| 18-29_volto | 360 × 800 | 62 | a/a | 19/19 | 0 |
| 18-29_mani_voce | 390 × 844 | 61 | b/b | 19/19 | 0 |
| 18-29_senza_volto | 430 × 932 | 62 | c/a | 19/19 | 0 |
| 30-39_volto | 360 × 800 | 61 | b/b | 19/19 | 0 |
| 30-39_mani_voce | 390 × 844 | 62 | c/a | 19/19 | 0 |
| 30-39_senza_volto | 430 × 932 | 61 | a/b | 19/19 | 0 |
| 40-49_volto | 360 × 800 | 62 | c/a | 19/19 | 0 |
| 40-49_mani_voce | 390 × 844 | 62 | a/b | 19/19 | 0 |
| 40-49_senza_volto | 430 × 932 | 63 | b/a | 19/19 | 0 |
| 50plus_volto | 360 × 800 | 61 | a/b | 19/19 | 0 |
| 50plus_mani_voce | 390 × 844 | 62 | b/a | 19/19 | 0 |
| 50plus_senza_volto | 430 × 932 | 61 | c/b | 19/19 | 0 |

Relatórios: reports/br/crawl-summary.json, reports/br/crawl-summary-webkit.json, reports/br/asset-audit.json, reports/br/local-verification.json, reports/br/storage-isolation.json, reports/br/offer-variants.json e reports/br/mount-manifest.json.
