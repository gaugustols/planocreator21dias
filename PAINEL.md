# GAL Pulse — Analytics de quizzes e funis

**Inteligência de dados para funis de alta conversão.** GAL NEGOCIOS DIGITAIS LTDA.

Painel: https://planocreator21dias.vercel.app/painel/ . A senha continua sendo a cadastrada em `PAINEL_PASSWORD` na Vercel. Não há senha ou URL de banco no código público. Os modos claro/escuro continuam disponíveis.

Um único painel em português recebe várias ofertas, domínios e idiomas. As instalações atuais são `/` (italiano) e `/br/` (português), cada uma com 19 etapas principais e suas subfases. O build injeta o coletor apenas em `dist/`. Os arquivos recuperados, textos e design do quiz permanecem preservados.

## Como usar

1. Escolha oferta, período de início das visitas, origem/campanha e aparelho. As datas são em **UTC**; a coorte inclui o avanço posterior das visitas que começaram no período.
2. Abra **Estrutura do quiz e filtros detalhados** para escolher estrutura, conjunto (`utm_medium`), anúncio (`utm_content`), posicionamento (`utm_term`), aplicativo, país, versão, variante e tráfego real/QA.
3. No topo: **Visitas → Começaram → Resultado → Preço → Clique em comprar → Compras**, com percentuais sobre todas as visitas filtradas. Começaram = responderam a entrada ou viram uma etapa posterior. Preço = bloco `price` entrou na área visível.
4. **Gargalos para testar primeiro** apresenta apenas alertas com evidência. A tabela de etapas mostra chegaram, avanço à próxima etapa, retenção sobre todas as visitas, última etapa de saída e mediana do tempo com aba visível. As subfases ficam abaixo.
5. **Cliques e respostas** mostra escolhas por pergunta, taxa de clique em comprar de cada resposta, blocos vistos, marcos de rolagem e os diferentes CTAs. Múltipla escolha pode somar mais de 100%; a última seleção da visita prevalece.
6. **Comparar** apresenta o mesmo funil por anúncio, dia UTC, aparelho, aplicativo e país. Variantes são comparadas pelo clique em comprar por visita, com intervalos de Wilson de 95%.
7. **Leads** permite buscar nome/e-mail, selecionar uma ou todas as ofertas, ver campanha/origem de captura e última etapa e exportar CSV. Filtros de leads: data de captura, oferta, origem, campanha, aparelho e QA. Filtros de estrutura/versão/anúncio são dos eventos anônimos.

## Como o gargalo é calculado

Referências fornecidas para esta implementação: entrada 65%, pergunta/explicação 95%, e-mail 80%, resultado → clique 15%, clique → compra 30%. São parâmetros de referência, não benchmarks comprovados do mercado.

Uma tela só acende quando:

- Há pelo menos **20 visitas avaliáveis**. Uma visita é avaliável se avançou, comprou ou está inativa há 30 minutos. Quem ainda está lendo não é classificado como desistência.
- O limite superior do intervalo de Wilson de **95%** está abaixo da referência, ou abaixo do limite inferior do conjunto de telas do mesmo tipo (também com amostra mínima).
- A diferença para a referência representa ao menos **10 perdas estimadas por 1.000 visitas** ao quiz.

Prioridade = diferença de avanço × alcance da tela × taxa observada de clique entre quem chegou à próxima tela. É uma projeção para orientar testes, sem garantia de ganho. Sem avanço observado, não há base para projetar cliques. A tabela também mostra amostra e intervalo.

A comparação A/B usa um critério conservador: mínimo de 20 visitas por variante e intervalos de 95% sem sobreposição. Isso não prova causalidade nem substitui distribuição aleatória, tamanho de amostra planejado ou controle de múltiplas comparações. Não há vencedora antes da evidência.

## Coleta própria e privacidade

`site/quiz-analytics.js` envia lotes de até 20 eventos a `/api/q/`, usando `sendBeacon`; há fallback `fetch` com `keepalive` e `credentials: omit`. Não cria ou consulta cookies de rastreamento, não faz fingerprint e não registra IP, endereço completo da página, texto digitado nem user-agent bruto nas tabelas de visitas/eventos.

Cada oferta usa um ID aleatório em `sessionStorage`, renovado após 30 minutos sem interação ou mudança na estrutura. É uma visita por aba, não uma pessoa identificada entre dispositivos. O país vem somente de `x-vercel-ip-country`, sem salvar o IP. Sem informação geográfica, aparece `ZZ`. Aplicativo/aparelho são categorias derivadas no navegador; as cinco UTMs são de primeira chegada.

O cookie de autenticação do proprietário é separado: assinado, HttpOnly, SameSite=Lax, Secure em produção, oito horas e restrito a `/api/analytics`. A próxima autenticação remove o cookie antigo de caminho `/`. `sendBeacon` pode transportar cookies de domínio definidos por outros serviços; o coletor não usa esses cookies. A configuração das integrações herdadas do quiz não é modificada por este trabalho. O login armazena apenas um HMAC do endereço para limitar tentativas, separado da telemetria dos visitantes.

O coletor respeita Global Privacy Control. Robôs, navegadores automatizados e origens `utm_source` começando com `qa` são ignorados, exceto quando o modo de teste explícito está ativo. Bloqueadores, falta de JavaScript, falhas de rede e fechamento da aba podem reduzir a cobertura; `sendBeacon` confirma enfileiramento, não entrega no servidor.

### Leads

Nome/e-mail ficam em `qa_leads`, separados dos eventos e acessíveis só após autenticação. Nos quizzes atuais, o adaptador lê os registros **já enviados** em `ugc[-br]-email-v1`; não captura teclas nem campos incompletos. O nome e a autorização são atualizados quando o próprio quiz salva suas escolhas. `qa_lead_sessions` relaciona o cadastro à visita, permitindo acompanhar a última etapa sem repetir os dados pessoais em cada evento.

Um e-mail é deduplicado por oferta, preservando a primeira campanha. Atualizações atrasadas não fazem regredir nome/última etapa. CSV é autenticado, usa busca por POST, neutraliza fórmulas e limita a exportação a 10 mil leads/3 MB; reduza período/filtros se necessário. A indicação de marketing reflete a autorização registrada, não uma confirmação de compra. Nenhum e-mail é enviado por este sistema.

## Estruturas e outras ofertas

IDs são fixos. A estrutura é um hash da ordem dos IDs, tipos e subfases. Acrescentar, remover ou reordenar telas gera uma nova estrutura, nunca somada às anteriores. Alteração de texto sem trocar IDs mantém a estrutura e pode ser isolada por **Versão do código**. O histórico anterior à atualização aparece separado como “Histórico anterior · sem estrutura”; não inventamos respostas ou blocos que não foram coletados.

O build extrai a sequência real dos bundles dos quizzes atuais com Acorn e injeta `data-flow`, versão e chaves dos adaptadores. Para outra oferta, cadastre domínios e etapas, copie o script da aba **Instalação** e mantenha `data-flow` atualizado com IDs, labels, `kind`, opções e subfases. Use um único marcador de tela ativa no DOM:

```html
<section data-quiz-step="pergunta-1">
  <button data-track-id="sim" data-track-label="Sim">Yes</button>
</section>
<section data-quiz-step="resultado" data-quiz-result>
  <div data-quiz-section="price">Preço</div>
  <a data-quiz-checkout data-track-id="comprar-preco" href="https://seu-checkout.com">Comprar</a>
</section>
```

Use `QuizAnalytics.answer('pergunta-1', ['sim'])` com IDs de opções. Depois de validar e enviar o cadastro, use `QuizAnalytics.identify({email, name, marketingConsent})`. A API `QuizAnalytics.lead()` marca somente o objetivo, sem guardar um contato. Não envie texto livre pela API de respostas. `step`, `click`, `complete`, `checkout` são alternativas aos marcadores automáticos; evite duplicar o mesmo clique.

## Banco e Vercel

O banco continua **Neon PostgreSQL**, já conectado à Vercel. Não é necessário migrar para Cloudflare/D1. Variáveis: `DATABASE_URL` (ou `POSTGRES_URL`), `PAINEL_URL`, `PAINEL_PASSWORD` (12+), `PAINEL_SESSION_SECRET` (32+). Use valores secretos no servidor. Build `npm run build`, Node 24, saída `dist`, funções `api/analytics.mjs` e `api/q.mjs`.

Tabelas: ofertas, estruturas, visitas, eventos, detalhes de eventos, leads, vínculo de leads/visitas, compras e tentativas de login. Migração inicial é transacional, com advisory lock no Postgres. Campos e índices são criados automaticamente sem apagar o histórico. Consultas acima de 20 mil visitas ou 100 mil eventos solicitam um período menor; não apresentam totais truncados como completos.

### Compras: ainda não conectado

O checkout deste projeto **ainda não está configurado**. O painel mostra “não conectado”, nunca zero vendas como se houvesse integração. Os links antigos recuperados não foram alterados nem utilizados para comprar.

Há um receptor genérico em `POST /api/analytics/?action=purchase`, desativado por padrão. Depois de escolher o provedor, um adaptador de servidor deve validar pagamento aprovado e enviar o envelope `{offer, transaction, email, at}` (nessa ordem, e-mail normalizado e `at` em milissegundos), assinado com HMAC-SHA256 do JSON no header `x-gal-signature`. Configure `CHECKOUT_WEBHOOK_SECRET` (32+ caracteres) e `CHECKOUT_ENABLED=1` somente após ligar o adaptador. IDs de transação são deduplicados; o e-mail é ligado à visita mais recente do lead naquela oferta. Pagamentos sem correspondência são guardados sem atribuir uma visita; não aparecem como conversão de uma visita aleatória. Um evento de navegador/página de obrigado não confirma pagamento.

## Testes e limpeza

```powershell
npm run test:analytics
npm run test:analytics:browser
node tests/full-quiz-analytics.mjs
npm run build
```

Os testes usam bancos temporários e passam pelos quizzes até o resultado, incluindo cadastros fictícios, preço, rolagem e clique sem navegar ao checkout. Conferem exatamente um `view` por etapa principal no banco, subfases separadas, envio em lote, ausência de e-mail em eventos e exclusão posterior dos testes.

Para validar em produção: `node tests/full-quiz-analytics.mjs --live`. Isso usa `gal_qa=1&utm_source=qa_percurso`; **não cria tráfego real**. No painel autenticado, escolha “Somente testes QA”, veja a contagem no banco e apague as visitas pelo botão dedicado após conferir. `purge-tests` exige autenticação e tem predicado fixo `qa=1`; contatos compartilhados com visitas reais são preservados. A limpeza também reconhece as duas campanhas exatas de ativação anteriores a esta atualização.

Evidências em `reports/analytics/`: testes de navegador, percurso completo local/produção e verificações de publicação. Screenshots privadas ficam em `.data/`, fora do Git. O relatório `validation.json` resume a rodada concluída; relatórios históricos mais antigos não representam a validação desta atualização.
