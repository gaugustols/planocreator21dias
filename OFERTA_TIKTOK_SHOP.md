# Trilha Shop — cópia adaptada do funil brasileiro

Página: **/tiktok-shop/**. A página brasileira UGC em **/br/** e a italiana em **/** permanecem intactas.

Esta versão usa os 182 arquivos do brasileiro, com o mesmo CSS, fontes, imagens, componentes, ordem de 19 etapas, opções, acertos das atividades, sons, animações, carteira, confetes e raspadinha. O build aplica a adaptação de textos em content/tiktok-shop-adaptation.mjs sobre a cópia, sem substituir o funil por uma experiência nova. O progresso usa ugc-shop-, separado do brasileiro.

## Entrada e percurso

“Seu celular pode render **comissões no TikTok Shop**”. Subheadline: “Um plano de 21 dias para começar do zero, aparecendo ou com apoio de IA.”

Mantém idade, objetivo, conquista desejada, disponibilidade, explicação, missão 1, preferência de câmera, explicação dos formatos, categorias, missão 2, regra sobre comissão, missão 3, primeiro passo, análise, e-mail, consentimento, nome, raspadinha e resultado. A escolha de formato oferece rosto, mãos e voz e apoio de IA. O resultado personaliza o perfil de acordo com essa escolha.

## As três missões existentes

1. **Caracolê — sua primeira ideia de vídeo começa aqui.** A mesma atividade de gancho, quatro cenas, prévia e fechamento passa a ensinar uma demonstração de produto para TikTok Shop. A conquista conclui o primeiro roteiro e mostra R$ 9 de comissão fictícia em uma venda hipotética.
2. **Pingô — descubra seu caminho sem precisar aparecer.** A mesma missão do café ensina abertura, narração própria ou com IA e demonstração fiel. A conquista mostra o cenário de duas vendas hipotéticas de R$ 9, totalizando R$ 18.
3. **Lata Cheia — transforme um detalhe em curiosidade.** O mesmo produto e a mesma atividade ensinam texto de abertura e apresentação dos detalhes. A conquista mostra três vendas hipotéticas de R$ 9, totalizando R$ 27.

As mensagens de conclusão destacam as conquistas do percurso: a estrutura de um roteiro, um formato sem aparecer e três exemplos como ponto de partida. A introdução de cada missão utiliza o campo de texto já existente no cartão, identificado como “Seu desafio”.

A carteira conserva o mecanismo de recompensa e fica identificada como **Comissões da simulação**. O total R$ 54 é fictício. Criar ou concluir a atividade não gera comissão real. A raspadinha conserva seu canvas e interação para revelar o plano; uma pequena condição de seleção de etapas permite exibi-la sem inventar desconto ou preço anterior.

## Oferta final

Headline: “Você já tem o celular. **Agora, tenha um passo a passo para começar a vender no TikTok Shop.**”

**Plano TikTok Shop 21 Dias — R$ 29,90.** Entrega confirmada: plano digital com passo a passo para começar a vender no TikTok Shop.

- Semana 1: preparar a conta, conferir elegibilidade, escolher categorias e estudar produtos.
- Semana 2: trabalhar abertura, demonstração e convite; criar com rosto, mãos e voz ou apoio de IA.
- Semana 3: publicar quando habilitado, acompanhar resultados e ajustar o próximo conteúdo.

Mantém a composição da oferta brasileira, seus cartões, projeção, perguntas frequentes e CTAs. Os textos distinguem exemplos de comissão de resultados reais. Não foram acrescentados depoimentos ou resultados não fornecidos.

O bloco de 20 minutos é sugerido para executar uma tarefa; a preparação pode exigir mais tempo. O acesso ao programa depende dos critérios da plataforma. Material com IA exige revisão e representação fiel do produto.

O checkout exclusivo ainda não foi informado. Os botões levam a **/tiktok-shop/inscricoes/**, que informa inscrições ainda fechadas. Nunca direcionam ao pagamento do UGC.

## GAL Pulse e verificação

Oferta independente **Trilha Shop · TikTok Shop**, com suas 19 etapas e armazenamento próprio. Captura nome e e-mail informados no percurso, campanha e última etapa no painel privado. A escolha de consentimento fica registrada; não há envio automático de mensagens.

**npm run build** monta a cópia e injeta o coletor. **npm run test:shop** verifica fontes, estilos, estrutura e percorre os três perfis até o resultado em navegadores de teste, validando 19 eventos de tela, captura e limpeza dos dados de teste em banco local isolado. Relatórios: reports/tiktok-shop/.
