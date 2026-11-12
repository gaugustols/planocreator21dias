# GAL Pulse — Analytics de quizzes e funis

**Inteligência de dados para funis de alta conversão.** Painel da GAL NEGOCIOS DIGITAIS LTDA.

Um único painel em português, com cadastro de várias ofertas, domínios e fluxos. O idioma do quiz não muda o idioma da interface. Cada oferta tem seu próprio ID; não existe divisão fixa entre Brasil e Itália.

## Instalações deste projeto

O arquivo `content/analytics-sites.json` configura as duas instalações atuais, na raiz `/` e em `/br/`, com IDs estáveis, 19 etapas e o painel central em **https://planocreator21dias.vercel.app/painel/**. São duas ofertas dentro do mesmo painel, que continua aceitando qualquer oferta adicional.

O build injeta o script apenas no HTML gerado de `dist/`; os HTMLs originais de `site/` e `recovered/` permanecem preservados. Na primeira conexão de produção, as ofertas são cadastradas automaticamente no Postgres. Novas conexões/deploys não sobrescrevem nomes, domínios, etapas ou histórico editados pelo proprietário. Não troque IDs/chaves deste arquivo depois de começar a coleta sem uma migração explícita.

Para um domínio novo de quiz, autorize a origem na oferta pelo painel e mantenha o endpoint apontando ao painel central. As instalações da configuração são carregadas somente em produção; `ANALYTICS_LOAD_INSTALLATIONS=1` permite reproduzi-las conscientemente num banco local de teste.

## Prévia e estado atual

```powershell
npm ci
npm run painel
```

Abra **http://127.0.0.1:4174/painel/**. O servidor escuta somente em `127.0.0.1`. Nesta prévia, o acesso não pede senha e o SQLite persiste em `.data/analytics.sqlite`, ignorado pelo Git. A oferta de demonstração contém **864 sessões fictícias**, está sinalizada e só é criada no modo local. As ofertas locais não são transferidas automaticamente para a produção.

**Produção ativada e verificada em 12/11/2026:** [abrir painel](https://planocreator21dias.vercel.app/painel/). O banco Neon `ponto-analytics`, plano Free, está conectado ao ambiente Production da Vercel. O login foi conferido após o proprietário preencher os segredos diretamente na plataforma. Os relatórios usam Postgres real, sem fallback para um banco descartável.

O redeploy `7kiGvoTaPV9pPDk9g46Hz6ZKg4jj` ficou Ready com os segredos atualizados. As verificações públicas passaram e as sessões de teste persistiram no banco após a implantação. No navegador, um percurso identificado pela origem `ponto_validacao` e campanha `teste_navegador` registrou uma sessão, três etapas e dois cliques, cada botão com uma sessão única. O avanço nas duas transições percorridas foi 100% ao filtrar essa campanha. Isso valida a coleta inicial; não é uma compra ou uma execução completa de todas as etapas em produção.

As primeiras sessões de validação usam a origem `ponto_validacao`; a campanha `ativacao_painel` identifica os dois eventos iniciais da API. Esses registros de teste foram preservados e podem ser distinguidos pelos filtros. As saídas continuam estimadas após 30 minutos sem atividade, conforme a regra documentada abaixo.

## Ativar na Vercel

1. No projeto Vercel deste repositório, conecte um banco **Postgres**, por exemplo Neon, pelo Marketplace/Storage. Novos bancos usam integrações de provedores: [documentação oficial](https://vercel.com/docs/postgres). Confira o plano e a região e use a URL de conexão com pool fornecida pelo provedor.
2. Em **Settings → Environment Variables**, configure:

| Variável | Conteúdo |
|---|---|
| `DATABASE_URL` | URL Postgres com SSL fornecida pela integração. `POSTGRES_URL` também é aceito. |
| `PAINEL_PASSWORD` | Senha exclusiva, com pelo menos 12 caracteres. |
| `PAINEL_SESSION_SECRET` | Segredo aleatório com pelo menos 32 caracteres. |
| `PAINEL_URL` | URL HTTPS definitiva do painel, sem barra final. |

3. Faça o deploy/redeploy: **Node.js 24**, build `npm run build`, saída `dist`. A função `api/analytics.mjs` é implantada separadamente pela Vercel. As tabelas `qa_*` e seus índices são criados na primeira conexão; o usuário do banco precisa dessa permissão. No Postgres, um bloqueio de transação serializa a inicialização.
4. Abra `https://seu-dominio/painel/`, entre com sua senha e cadastre uma oferta com seus domínios HTTPS e etapas em ordem. Use IDs técnicos e nomes livres em português.
5. Em **Instalação**, copie o script para o HTML do quiz. Depois percorra o quiz com um navegador normal e confira os eventos no painel.

Cadastre os domínios de preview que quiser usar; não há autorização curinga. Se usar proteção de deployment da Vercel, o script e a coleta precisam ser acessíveis aos visitantes do quiz. A senha própria continua protegendo os relatórios.

Configure segredos diretamente na Vercel; não coloque senhas no HTML, no Git ou em screenshots. A chave pública do script identifica a oferta e não permite ler relatórios nem administrar o painel.

## Conectar qualquer quiz

O painel gera um script com os valores corretos da oferta:

```html
<script defer src="https://seu-painel.com/quiz-analytics.js"
  data-offer="ID-DA-OFERTA" data-key="CHAVE-PUBLICA"></script>
```

Marque a tela atual com **um único** `data-quiz-step` no DOM, usando os IDs cadastrados. Remova o marcador das telas inativas. Os quizzes recuperados já usam `main [data-step]`, também reconhecido. `data-quiz-phase` e `data-phase` identificam subfases.

```html
<section data-quiz-step="pergunta-1">
  <button data-track-id="sim" data-track-label="Sim">Oui</button>
</section>
```

Botões, links e elementos com `role="button"` são observados automaticamente. `data-track-id` mantém a identidade estável ao editar o layout; `data-track-label` permite nomes em português. `data-analytics-ignore` exclui um elemento e seus filhos da coleta de cliques.

Marque o resultado efetivamente exibido com `data-quiz-result` e o link de compra com `data-quiz-checkout`. O script também reconhece `data-kind="result"` e links Hotmart dos quizzes recuperados. Em aplicações que controlam o fluxo por JavaScript:

```javascript
QuizAnalytics.step('pergunta-1', 'subfase-opcional');
QuizAnalytics.click('continuar', 'Continuar');
QuizAnalytics.complete();        // Resultado efetivamente exibido.
QuizAnalytics.lead();            // Depois de confirmar o cadastro.
QuizAnalytics.checkout('comprar', 'Comprar');
```

Evite duplicar cliques já observados automaticamente. O evento `lead` não salva email/nome e não restaura as APIs antigas de lead/email. Cliques no checkout não confirmam visita externa nem venda. As instruções e o código de instalação ficam disponíveis dentro do próprio painel.

## Métricas

| Métrica | Regra |
|---|---|
| Sessões iniciadas | Sessões únicas cujo primeiro evento ocorreu no período. Datas do filtro e gráfico usam UTC. |
| Chegaram | Sessões únicas que visualizaram a etapa; voltas não multiplicam o total. |
| Retenção total | Chegaram à etapa / todas as sessões da coorte. |
| Avançaram | Visitaram a próxima etapa cadastrada depois da atual; pular uma etapa não conta como avanço para ela. |
| Taxa de avanço | Avançaram / chegaram à etapa. |
| Saídas estimadas | Última etapa de sessões com 30 minutos sem atividade, sem conclusão e sem checkout. |
| Em andamento | Sessões recentes sem conclusão/checkout; heartbeats não renovam sozinhos o prazo. |
| Conclusão / checkout | Sessões com o respectivo evento, contado uma vez por sessão. |
| Cliques por botão | Total de cliques e sessões únicas; percentual sobre quem chegou à etapa. |
| Tempo por etapa | Mediana entre sessões do tempo acumulado com aba visível; ausência de amostra não vira zero. |
| Subfases | Sessões únicas por subfase, como percentual de quem chegou à etapa principal. |

O período seleciona **início de sessão**, incluindo o avanço posterior dessa coorte. Uma sessão que começou ontem e concluiu hoje pertence à coorte de ontem. Sessões iniciadas no meio do fluxo podem produzir um funil não monotônico. O ID é por oferta e por aba, sem identificar pessoas entre dispositivos; novas interações após 30 minutos iniciam outra sessão.

Origem/campanha usam `utm_source` e `utm_campaign` do início da sessão. Há filtros de dispositivo, origem e campanha, atualização manual e exportação CSV do resumo de etapas. Ofertas reais nunca recebem números de demonstração.

## Proteção e limites

- Login único do proprietário, cookie assinado de oito horas, `HttpOnly`, `Secure` em produção e `SameSite=Lax`. Trocar senha/segredo invalida sessões. Há limitação de tentativas e verificação de origem nas operações administrativas.
- Relatórios exigem autenticação. Coleta exige oferta/chave e domínio autorizado. A chave é pública e a origem pode ser falsificada fora de um navegador: telemetria não constitui antifraude. Lotes são limitados e IDs de eventos são deduplicados.
- Eventos guardam sessão, etapa/subfase, botão/rótulo público, duração, dispositivo, UTMs e caminho sem query. O script não lê valores de campos, não envia cookies do painel e não cria fingerprint. Use rótulos sem dados pessoais. Login usa hash de IP para limitar tentativas; eventos não têm coluna de IP.
- O script respeita Global Privacy Control e desativa por padrão em navegadores automatizados. Bloqueadores, rede e fechamento antes do envio podem reduzir a cobertura. A fila limitada permanece em memória; `fetch` com `keepalive` e credenciais omitidas ajuda no fechamento, sem garantir entrega. O histórico começa na instalação.
- Até 100 etapas/oferta, 20 domínios e 20 eventos/lote. Consultas acima de 100 mil eventos pedem um período menor, sem apresentar totais parciais. Não há exclusão automática de eventos; acompanhe o armazenamento do banco.
- Sem gravação de sessão, heatmap ou confirmação de pagamento. O painel não restaura o backend privado original.

## Arquivos e validação

Interface: `site/painel/`; script: `site/quiz-analytics.js`; função Vercel: `api/analytics.mjs`; coleta/autenticação: `analytics/handler.mjs`; banco: `analytics/store.mjs`; cálculos: `analytics/metrics.mjs`; demonstração local: `analytics/demo.mjs`.

Validação local em **12/11/2026**:

- `npm run test:analytics`: seis testes com autenticação, bloqueio de origem, isolamento de ofertas, repetição de eventos, coortes, cálculos, query não coletada, cadastro inicial e preservação de IDs/ordem.
- `npm run test:analytics:browser`: cinco verificações Chromium com cadastro pelo painel, quiz de teste em francês, coleta real no banco de teste, objetivos, filtros, CSV, telas de 320/390 px e adaptação ao quiz recuperado. Rede externa bloqueada; nenhuma compra realizada.
- `npm run build`: preparação das duas ofertas e dos arquivos do painel. Os arquivos originais recuperados e sua copy permanecem preservados.
- [Relatório de navegador](reports/analytics/browser-verification.json).

Os testes locais usam banco temporário e não contaminam ofertas do proprietário. A validação adicional em produção usa somente sessões anônimas identificadas como teste. Evidências: [API e instalação publicadas](reports/analytics/production-verification.json), [gravação inicial no Postgres](reports/analytics/production-collection-test.json) e [conferência no painel autenticado](reports/analytics/production-ui-verification.json). Senhas, cookies de login e imagens da área autenticada não são incluídos nesses relatórios públicos.
