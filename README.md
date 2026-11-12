# Piano UGC 21 Giorni — recuperação da oferta

O projeto inclui o **Ponto**, painel privado em português para analisar qualquer oferta/idioma, preparado para Vercel e Postgres. A prévia `npm run painel` fica em **http://127.0.0.1:4174/painel/** e tem uma oferta com dados fictícios. A coleta real depende de conectar o banco e instalar o script. Consulte **[PAINEL.md](PAINEL.md)**.

O projeto também contém a versão brasileira **Trilha UGC 21 Dias** em **`/br/`**. A italiana permanece em **`/`**. Consulte [README-BR.md](README-BR.md) para a recuperação brasileira, os scripts com `--locale=br`, a separação de dados no navegador e as validações entre idiomas. A documentação abaixo descreve a recuperação italiana.

Cópia dos arquivos públicos de **https://piano-ugc.pages.dev/** recuperada em **11/11/2026**. O domínio canônico declarado no HTML é `https://piano-ugc.com/`. O remoto Git desta pasta é `https://github.com/gaugustols/planocreator21dias.git`.

## Estado da recuperação

O frontend publicado foi recuperado em `site/`, mantendo os nomes, diretórios e bytes dos arquivos originais. São **182 arquivos, 1.659.927 bytes**, incluindo cinco módulos JavaScript, CSS, fontes, quatro fotografias das faixas etárias, 162 imagens de emoji, ícones, imagem de compartilhamento e a página `/recesso/`. A auditoria por SHA-256 está em `reports/local-verification.json` e o inventário individual em `reports/mirror-manifest.json`.

**O código privado do backend, as credenciais, o banco de leads, os modelos de email, os webhooks e os arquivos do produto pago não foram recuperados.** Eles não fazem parte dos arquivos públicos encontrados. Esta entrega recupera a interface e os scripts de recuperação; não constitui uma restauração integral da operação comercial. Também não há source maps publicados referenciados: o código recuperado é o build compilado, não o projeto TypeScript/TSX original.

## Abrir no computador

Node.js 24. Neste computador foi validado Node.js 24.21.0, Playwright 1.65.0 e Chromium 158.0.8127.18.

```powershell
npm ci
npx playwright install chromium
npm start
```

Abra **http://127.0.0.1:4173/**. O Playwright e o Chromium já foram instalados neste computador; os dois primeiros comandos são para restaurar o ambiente em outro computador. Para outro terminal/porta: `$env:PORT=4174; npm start`.

O servidor serve arquivos existentes e aplica fallback de SPA nas rotas sem extensão. Um arquivo `.js` inexistente retorna 404; `/api/*`, exceto a nova API `/api/analytics/`, retorna 503 explícito, pois o backend original não foi recuperado. O cabeçalho `X-Recovery-Server: planocreator21dias-v1` identifica este processo. `GET /__recovery/status` informa a pasta e o modo do servidor. Encerre com Ctrl+C.

Por padrão, **somente na resposta do servidor local**, a configuração de Meta/Utmify é desativada. Nenhum arquivo de `site/` é reescrito. O próprio código original desativa métricas e envio de leads em localhost/127.0.0.1 e em navegadores automatizados. Para reproduzir os pixels originais conscientemente, há `node serve.mjs --original-integrations`; isso volta a carregar serviços externos. Os links de pagamento mantêm o destino original.

## Scripts entregues

| Arquivo/comando | Função |
|---|---|
| `reconnaissance.mjs` / `npm run recon` | Abre landing, variante com fotos e oferta; registra pedidos/respostas de rede, erros, termos, privacidade, HTML, texto e imagens. Não responde ao quiz vivo nem clica em compra. |
| `mirror.mjs` / `npm run mirror` | Usa os pedidos como sementes, descobre referências em HTML/CSS e analisa a AST de cada módulo JS recursivamente; mantém a árvore de diretórios. |
| `audit_assets.mjs` / `npm run audit` | Compara referências e arquivos em disco e separa ausências confirmadas no original de pendências reais. |
| `inspect_bundle.mjs` / `npm run inspect` | Extrai configuração/conteúdo e evidências de integrações, endpoints e funções do build. |
| `serve.mjs` / `npm start` | Servidor local com fallback SPA, pixels desligados na prévia e APIs ausentes identificadas. |
| `crawl.mjs` / `npm run crawl` | Percorre 12 combinações locais de idade/câmera; salva cada tela, estado, opções, HTML, texto e screenshot. Para na oferta e bloqueia rede externa. |
| `verify_local.mjs` / `npm run verify` | Verifica hashes, rotas profundas, recarga/retomada, voltar, oferta direta e página de reembolso. Requer servidor local ativo. |
| `verify_offers.mjs` / `npm run verify:offers` | Simula localmente o retorno do checkout para verificar a segunda proposta e a mensagem de promoção expirada, sem abrir pagamento. |
| `prepare_deploy.mjs` / `npm run build` | Copia o frontend para `dist/` e insere base `/` no HTML gerado, preservando os originais em `site/`. Não cria backend. |

Os scripts usam JavaScript/Node.js em vez dos nomes `.py` do roteiro porque este ambiente não tem Python funcional. Playwright está declarado como dependência local e Acorn analisa os bundles sem executar seu código no processo do auditor.

O espelho reutiliza arquivos existentes. `node mirror.mjs --refresh` baixa novamente; `--retry-unavailable` repete URLs classificadas como indisponíveis. Sem essas opções, é possível executá-lo novamente sem baixar os arquivos já salvos. `node audit_assets.mjs --verify-remote` confirma no servidor as referências ausentes. `node crawl.mjs --resume` reutiliza percursos aprovados e retoma capturas interrompidas. O crawler só aceita localhost/127.0.0.1.

## Forma do funil e provas

Existem **19 etapas principais**: landing/idade, objetivo, despesa, tempo, explicação UGC, brief Velù, preferência de câmera, explicação sobre seguidores/rosto, categorias, brief Gorgoglio, regra de segurança, brief Bronzetto, primeiro vídeo, análise, email, consentimento, nome, raspadinha e resultado/oferta.

Os briefs têm **17 fases internas** no total (7 + 5 + 5). Expandindo esses três briefs, há **33 posições de fluxo**, além dos estados de feedback, carregamento, gravação, análise e revelação. O total de screenshots por percurso é maior e consta em `capture_<idade>_<camera>/steps.json`.

As quatro idades são `18-29`, `30-39`, `40-49`, `50+`; as preferências são `volto`, `mani_voce`, `senza_volto`. Não foi encontrada pergunta de gênero no conteúdo publicado. As 12 combinações dessas escolhas são verificadas; as demais opções são distribuídas entre os percursos para cobrir todos os IDs. Isso não representa uma enumeração do produto cartesiano de todas as respostas possíveis. Os três testes de landing (`a/b/c`) e os dois de resultado (`a/b`) também são exercitados, além de consentir/recusar emails e informar/omitir nome.

`reports/crawl-summary.json` é o resultado consolidado do teste completo. Cada diretório `capture_*` contém `summary.json`, `steps.json`, `final-state.json`, HTML/texto/JSON/PNG de cada estado e `offer-full.png`. Os emails de teste são `recuperacao.teste@example.com`; nenhum dado real ou cartão foi usado. Nenhum botão de compra é clicado.

Auditoria de referências: **182 referências únicas, 181 presentes e zero pendências reais**. A referência remanescente, `video_finale.mp4`, é o rótulo de um arquivo fictício na simulação de entrega, não um vídeo carregado pelo browser. Seu URL candidato `/assets/video_finale.mp4` foi verificado e retorna **404** no original. `sitemap.xml`, consultado como semente adicional, também não existe. As duas construções dinâmicas de imagens foram resolvidas por enumeração das quatro idades e das 162 chaves de emoji; não se dependeu apenas do primeiro percurso visitado.

## Backend ausente: bloqueios para republicar

Todos os cinco endpoints abaixo aparecem literalmente em `site/assets/index-By7_X_Iq.js`. A função `Dt` tenta `navigator.sendBeacon` e depois `fetch` com `method: POST`, corpo JSON serializado e `credentials: omit`. As funções completas e trechos de evidência estão em `reports/bundle-analysis.json`.

| Método e endpoint | Função/corpo observado | Sem o backend |
|---|---|---|
| `POST /api/lead` | `Yn`: identificador, email, optin falso, versão, perfil do quiz, UTM e sessão de métricas | O email não é gravado no servidor e nenhum plano é enviado. |
| `POST /api/lead/optin` | `Xn`: identificador e texto do consentimento | O consentimento não é persistido nem dispara a sequência de emails. |
| `POST /api/lead/nome` | `Zn`: identificador e nome | O nome só permanece localmente; não atualiza a lead no servidor. |
| `POST /api/lead/checkout` | `Qn`: identificador | O backend não recebe a intenção de checkout para recuperação de compra. |
| `POST /api/q` | `Et`: sessão, metadados e lote de eventos | As métricas internas não são gravadas. |

O primeiro ponto dependente do backend é **o envio do email**, não a renderização do quiz. Pelo código, essas chamadas são feitas sem aguardar sucesso: o frontend continua avançando. No teste local, a lead de teste chegou à oferta mesmo com os envios desativados pelo próprio build. Isso **não prova entrega de email ou gravação de lead**. Em produção, uma API ausente pode falhar silenciosamente enquanto o visitante continua vendo as telas.

A política pública menciona Cloudflare para hospedagem/métricas, Resend para email e Hotmart para pedidos. Isso é evidência documental, não código recuperado desses serviços. O tipo de banco, os workers/functions, as chaves, os modelos, os contratos de retorno dos endpoints e os webhooks não foram determinados pelos arquivos públicos. Não há um servidor simulado que finja salvar leads ou enviar mensagens.

## Pagamento e ofertas

O checkout configurado no build é `https://pay.hotmart.com/S108075670L?checkoutMode=10`. A função `Er` monta a URL, `Dr` aplica o código `off`, `jr` registra intenção e redireciona; `$n` pode acrescentar o email para preenchimento. Não foi encontrada criação de sessão de pagamento por uma API própria nos módulos recuperados.

Configuração encontrada: preço principal **27 €**, referência **97 €**, pagamento único, garantia declarada de 15 dias; códigos de oferta `y1gwfwn1`, `aibqj33v`, `2roohjnz`. A segunda proposta tem preço **19 €** (`aibqj33v`), e a promoção por email **14,90 €**, 48 horas (`2roohjnz`). Os produtos adicionais listados são `8768460` (Kit Proposte) e `8755932` (Lista das 67 marcas).

Os IDs e preços foram recuperados do código. A existência/atividade das ofertas na conta Hotmart, entrega do PDF, aprovação de pagamento e telas posteriores à compra **não foram verificadas**. O teste para antes de sair para o checkout. Os termos mencionam produtos adicionais após pagamento, mas seus destinos e a integração do lado do servidor não foram recuperados. A promoção por email depende de lógica privada não entregue nesta cópia.

A segunda proposta de 19 € foi exibida e validada no espelho por simulação explícita da sessão de retorno, sem visitar o checkout. Também foi verificado que ela aparece uma vez por sessão e que a mensagem de promoção expirada renderiza com uma query local. Evidências em `reports/offer-variants.json` e `reports/local-downsell.png`. Isso não valida a cobrança nem a emissão de links privados de promoção.

## Pixels, configurações e textos legais

No código: Utmify **`6ad3d977f9f1c8c2e0347272`** e Meta **`2346168272822517`**, este na lista `utmify.metaPixelIds`; o campo independente `metaPixelId` está vazio. Scripts: `cdn.utmify.com.br/scripts/pixel/pixel.js`, `cdn.utmify.com.br/scripts/utms/latest.js` e `connect.facebook.net/en_US/fbevents.js`. A rede observada também inclui `tracking.utmify.com.br`, `api.ipify.org` e `api6.ipify.org`. O último apresentou falha de DNS no reconhecimento do site vivo. Não se atribuiu ao espelho esse erro externo original.

Esses identificadores foram preservados em `site/` e precisam corresponder à sua conta antes de publicar. A prévia local os desativa sem alterar o espelho. Não foram encontradas referências a Sentry, `sendDefaultPii`, Session Replay, rrweb, Hotjar, Clarity, Firebase Remote Config ou LaunchDarkly nos cinco módulos próprios recuperados. Isso não audita o comportamento interno futuro dos scripts de terceiros. Os testes A/B e os valores de configuração encontrados estão compilados no próprio JavaScript.

Os textos legais identificam **GLE DIGITAL LTDA**, CNPJ **58.857.150/0001-04**, Avenida Mafra, 453, Quadra 211, Lote 16, Setor 02, Piçarras, Guaratuba-PR, CEP 83280-000, Brasil; **supporto@piano-ugc.com**. Foram preservados. Consulte as capturas `reports/live-privacy.txt`, `reports/live-terms.txt` e a página `site/recesso/index.html`. O link externo de reembolso aponta para a área de compras da Hotmart. As declarações legais são as do site original, não uma revisão jurídica desta recuperação.

## Caminho base e publicação

O projeto foi publicado na raiz `/`. No bundle principal, há quatro pontos funcionais independentes a considerar ao trocar o caminho base: prefixo relativo dos emojis (`ne`, offset 229672), prefixo relativo das fotos (`Ei`, 368339), retorno ao quiz (`ft`, literais `/` em 302462/302570) e URL de reembolso (`S.withdrawalUrl`, 225829). Os offsets são UTF-16, base zero, do arquivo original. Os imports dinâmicos e a lista `__vite__mapDeps` também dependem da árvore `assets/`; a recuperação manteve seus caminhos relativos intactos. HTML/CSS ainda referenciam fontes, ícones e imagens por caminhos próprios. Mudar apenas o `index.html` para hospedar em uma subpasta não basta.

`npm run build` gera `dist/` com `<base href="/">`, para que o fallback de uma rota profunda resolva os assets a partir da raiz. O servidor local faz o mesmo somente na resposta de fallback. Use publicação na raiz. `vercel.json` define a saída `dist`, a página de reembolso e fallback sem capturar `/api/*` ou arquivos com extensão. A configuração está preparada, mas **não foi feito deploy**. A precedência de arquivos e rewrites está descrita na [documentação da Vercel](https://vercel.com/docs/project-configuration/vercel-json).

No Cloudflare Pages, a saída estática também pode ser `dist/`, com build `npm run build`; mantenha a regra de SPA. O comportamento de fallback sem `404.html` na raiz está documentado em [Serving Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/). Essa configuração não reconstitui as funções privadas. Para reativar a operação completa, é necessário recuperar ou reimplementar as APIs listadas e validar Resend, conta/ofertas Hotmart, entrega do produto, métricas e destinos posteriores à compra.

## Backup e Git

O backup no Git inclui o frontend recuperado, os scripts, os relatórios e os diretórios `capture_*/` com todas as capturas de validação. `package-lock.json` registra as dependências. `node_modules/`, `dist/`, arquivos ZIP, logs e arquivos de ambiente ficam fora do Git; dependências e build podem ser restauradas pelos comandos acima. O ZIP completo também está disponível localmente. Nenhum commit/push ou deploy é executado pelos scripts de recuperação. O espelho e os relatórios não incluem o backup das contas, banco de dados ou produtos externos.
