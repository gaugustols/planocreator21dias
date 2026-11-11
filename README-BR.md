# Trilha UGC 21 Dias — versão brasileira em /br/

Oferta recuperada de **https://trilha-ugc.pages.dev/** em **11/11/2026**. O frontend usa português brasileiro e valores em reais. A versão italiana continua na raiz `/`; a brasileira é servida em `/br/`. O caminho `/br` redireciona para `/br/` e preserva os parâmetros de campanha.

## Abrir e restaurar

```powershell
npm ci
npx playwright install chromium
npm start
```

Abra **http://127.0.0.1:4173/br/** para português ou **http://127.0.0.1:4173/** para italiano. O servidor foi mantido ativo para a prévia. Os navegadores/dependências já estão instalados neste computador. Para os testes adicionais em WebKit: `npx playwright install webkit`.

## Arquivos e scripts

| Caminho/comando | Conteúdo/função |
|---|---|
| `recovered/br/` | Os **182 arquivos brasileiros originais**, com **1.657.681 bytes**, preservados sem alteração. |
| `site/br/` | Os mesmos arquivos adaptados para execução em `/br/`. |
| `reports/br/` | Rede observada, termos/privacidade, inventários, auditoria, análise dos bundles e relatórios de teste. |
| `capture_br_<idade>_<camera>/` | Etapas verificadas em Chromium mobile com toque; HTML, texto, JSON, estado e screenshots. |
| `capture_br_webkit_18-29_volto/` | Percurso completo adicional em WebKit com configuração de dispositivo móvel. |
| `npm run recon:br` | Reconhecimento público da landing, variante com fotos e oferta, sem responder ao quiz vivo ou comprar. |
| `npm run mirror:br` | Espelho recursivo para `recovered/br`; reutiliza os arquivos existentes. |
| `npm run audit:br` | Auditoria de referências contra os originais em disco. |
| `npm run inspect:br` | Extrai configuração e conteúdo brasileiros e as evidências de integrações. |
| `npm run mount:br` | Regera `site/br/` a partir dos originais, com mudanças de caminho e chaves de armazenamento. |
| `npm run crawl:br` | Percorre 12 combinações locais; para antes de qualquer compra e bloqueia saídas de `/br/` e rede externa. |
| `npm run verify:locales` | Verifica integridade, larguras, rotas profundas, imagens, links internos e independência dos idiomas na mesma aba. |
| `npm run verify:offers:br` | Confere destino dos links brasileiros e simula a segunda proposta e a mensagem de promoção expirada, sem visitar o checkout. |
| `npm run verify:original:br` | Confere os arquivos atuais da oferta original e compara textos, imagens e SVGs em 44 telas locais; requer internet e `npm start` ativo. |
| `npm run build` | Regera a adaptação e prepara as duas versões em `dist/`. Não publica e não cria APIs. |

Todos os comandos de reconhecimento/espelho/auditoria/inspeção também aceitam `--locale=br` diretamente. Sem a opção, esses scripts continuam usando a versão italiana. Exemplos: `node audit_assets.mjs --locale=br --verify-remote`, `node crawl.mjs --locale=br --resume` e `node crawl.mjs --locale=br --browser=webkit --pilot`. Requer servidor local ativo para os testes. Os scripts usam Node.js/Playwright/Acorn; não dependem de Python.

## O que foi adaptado

As adaptações reproduzíveis ficam em `mount_br.mjs`. O inventário `reports/br/mount-manifest.json` registra SHA-256 de cada original e de cada arquivo gerado, mais cada alteração. Foram modificados **quatro arquivos**, com **42 substituições/inserções**, incluindo a copy de entrada aprovada. As imagens, fontes, CSS externo e os demais módulos mantêm os bytes originais.

A headline e a subheadline aprovadas estão em `content/br-landing.json` e aparecem em todas as variantes brasileiras, inclusive no HTML pré-renderizado. A variante C usa a mesma copy da principal. A conferência está em `reports/br/landing-copy-verification.json`, com prévias em `reports/br/landing-copy-485.png` e `reports/br/landing-copy-390.png`. As capturas completas da recuperação registram o conteúdo anterior a esse ajuste; o relatório de copy registra a alteração atual.

O HTML recebe `<base href="/br/">`. Links internos, página de arrependimento, URLs próprias, metadados e retorno ao início passam a usar `/br/`. As fontes referenciadas no CSS embutido da página de arrependimento também recebem o prefixo. Os imports dinâmicos mantêm a árvore relativa `assets/`, sob `/br/assets/`.

As **16 chaves próprias** de navegador passam de `ugc-*` para `ugc-br-*`, inclusive as usadas no bootstrap HTML, na captura de lead, no quiz, no nome, nas UTMs, no A/B e no contador. A versão italiana mantém suas chaves originais. Os endpoints próprios brasileiros passam a `/br/api/*`. O domínio lógico usado pelo app é o domínio atual com `/br/`. As imagens, preços, identificadores Hotmart e pixels da oferta foram preservados; a copy de entrada segue a aprovação descrita acima.

Não edite somente a cópia gerada se quiser manter uma alteração: `npm run mount:br`/`npm run build` podem regravá-la. A recuperação mantém os originais como evidência; mudanças futuras de conteúdo devem ser feitas conscientemente no processo de geração ou em uma nova fonte editável. O site público não disponibiliza o projeto TSX/TypeScript nem source maps referenciados; foi recuperado o build compilado.

## Fluxo e auditoria

São **19 etapas principais** e **17 fases internas** dos três briefings de simulação, totalizando **33 posições de fluxo** ao expandir os briefings. A idade oferece quatro opções; a preferência de câmera oferece três. Não há pergunta de gênero no conteúdo encontrado. Os testes exercitam as 12 combinações de idade/câmera e distribuem as demais respostas para cobrir todas as opções individuais e as seis combinações A/B de landing/resultado. Isso não enumera todas as combinações possíveis de todas as perguntas.

Consulte **[VALIDACAO-BR.md](VALIDACAO-BR.md)** para o resultado consolidado e os relatórios JSON associados. As capturas incluem as opções encontradas, estado do quiz e títulos extraídos da área principal. O teste usa `recuperacao.teste@example.com`, sem dados reais e sem cartão.

A comparação atual de conteúdo com a oferta original está em **[COMPARACAO-BR.md](COMPARACAO-BR.md)**: 182 arquivos conferidos contra o site no ar e 44 comparações renderizadas aprovadas, preservando a headline e a subheadline autorizadas.

A auditoria encontra **182 referências**, sendo **181 presentes, zero pendências recuperáveis e um rótulo de vídeo fictício**: `video_final.mp4`. O candidato `/assets/video_final.mp4` foi confirmado como 404 no servidor original; a simulação só exibe esse nome, não carrega um vídeo com ele. A semente extra `sitemap.xml` também retornou 404. As duas expressões dinâmicas de imagens foram resolvidas pelas quatro idades e pelas 162 chaves de emoji, incluindo imagens que não aparecem no primeiro percurso.

O reconhecimento identificou os domínios `trilha-ugc.pages.dev`, `connect.facebook.net`, `cdn.utmify.com.br`, `tracking.utmify.com.br`, `api.ipify.org` e `api6.ipify.org`. A consulta ao último falhou por DNS no site original. Isso está documentado em `reports/br/reconnaissance.json` e não foi atribuído ao espelho.

## Backend e operação que não foram recuperados

O frontend publicado não inclui código privado das funções, banco de leads, chaves, modelos de email, webhooks ou arquivos do produto pago. O build expõe o identificador lógico `trilha-ugc-metricas`, mas isso não fornece schema, credenciais nem dados desse banco. A política menciona Cloudflare e Resend; esses serviços não foram restaurados nem presumidos a partir dessa menção.

Os seguintes endpoints aparecem literalmente no bundle original. A função `kt` tenta `sendBeacon` e depois `fetch` com método POST, corpo JSON serializado e credenciais omitidas. Os nomes das funções e corpos completos estão em `reports/br/bundle-analysis.json`.

| Original → adaptação | Função e finalidade | Sem o backend |
|---|---|---|
| `POST /api/lead` → `/br/api/lead` | `Qn`: registra email, perfil do quiz, versão, UTMs e sessão | A lead não é salva e a trilha não é enviada. |
| `POST /api/lead/optin` → `/br/api/lead/optin` | `$n`: registra identificador e texto do consentimento | O consentimento não é persistido nem a sequência disparada. |
| `POST /api/lead/nome` → `/br/api/lead/nome` | `er`: atualiza o nome da lead | O nome permanece somente no navegador. |
| `POST /api/lead/checkout` → `/br/api/lead/checkout` | `tr`: registra intenção de checkout | Não há registro no backend para recuperação do checkout. |
| `POST /api/q` → `/br/api/q` | Métricas de sessão e eventos em lote | Não há gravação das métricas internas. |

O primeiro ponto dependente do backend é o envio de email. O próprio build desativa esses envios em localhost e em navegadores automatizados; fora disso, as chamadas são feitas sem aguardar sucesso. Assim, a interface pode continuar até a oferta mesmo sem salvar a lead ou enviar mensagem. Não foi criado um backend fictício: o servidor local retorna **503** para APIs ausentes.

Para restaurar a operação completa, é preciso recuperar ou reimplementar as cinco APIs brasileiras, mantendo a separação das italianas, e validar banco, Resend, webhooks e entrega dos arquivos pagos.

## Pagamento, preços e pixels encontrados

O build brasileiro configura `https://pay.hotmart.com/K108118162G?checkoutMode=10`, preço principal **R$ 29,90**, referência **R$ 97,00**, garantia declarada de **30 dias** e métodos listados como Visa, Mastercard, Pix, boleto e Apple Pay. Os códigos de oferta são `3yxg2jx6`, `z752258y` e `9mz7egf0`. A segunda proposta é **R$ 24,90** (`z752258y`); a promoção por email é **R$ 19,90**, 48 horas (`9mz7egf0`). Produtos adicionais: `8772483` (Kit Propostas) e `8772494` (Lista das 60 marcas). Há outros valores de configuração expostos em `market.prices`; eles são evidência de configuração, não verificação de cobrança.

Os testes conferem o destino brasileiro dos links e exibem a segunda proposta por simulação explícita da sessão local. Nenhuma compra, criação de pedido, cobrança ou entrega foi realizada. A atividade das ofertas na conta Hotmart, promoções emitidas pelo backend, webhooks, acesso à área de membros e páginas posteriores à compra não foram determinados pelos arquivos públicos.

Os pixels presentes no próprio build brasileiro são **Utmify `6ad3d977f9f1c8c2e0347272`** e **Meta `2346168272822517`**, este em `utmify.metaPixelIds`; `metaPixelId` independente está vazio. Esses valores são os do site brasileiro original. A prévia local desativa os scripts por transformação apenas da resposta servida; `site/br/` e a build de produção conservam a configuração original. Scripts externos podem manter seu próprio armazenamento compartilhado por domínio: a separação implementada aqui cobre as chaves próprias do funil.

## Textos legais e publicação

Os termos e a privacidade identificam **GLE DIGITAL LTDA**, CNPJ **58.857.150/0001-04**, Avenida Mafra, 453, Quadra 211, Lote 16, Setor 02, Piçarras, Guaratuba–PR, CEP 83280-000, Brasil, contato **supporto@piano-ugc.com**. Foram preservados sem revisão jurídica. A página brasileira de desistência fica em **`/br/arrependimento/`**, com links para os textos brasileiros e para a área de compras Hotmart. As capturas dos termos e da política estão em `reports/br/live-terms.txt` e `reports/br/live-privacy.txt`.

`vercel.json` contempla o caminho `/br/`, o fallback brasileiro e as páginas legais de cada idioma. APIs e arquivos com extensão não entram no fallback. A build inclui ambas as versões, com a italiana em `/` e a brasileira em `/br/`. A configuração foi verificada localmente; nenhum deploy foi feito nesta recuperação. Para publicação, confira o domínio definitivo nos metadados e restaure as APIs de produção. Uma publicação apenas do frontend não restaura os serviços privados.

O Git inclui originais, versão adaptada, scripts, relatórios e capturas. Dependências, `dist/`, logs, arquivos de ambiente e ZIPs ficam ignorados. O servidor de prévia não executa automaticamente commits, pushes ou deploys.
