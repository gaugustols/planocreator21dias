# Comparação de conteúdo — versão brasileira

Concluída em **11/11/2026, às 17:25 (America/Sao_Paulo)**. Referência: [oferta brasileira original](https://trilha-ugc.pages.dev/).

**Resultado: 44 de 44 comparações renderizadas iguais, sem divergências de texto, imagens ou SVGs.** Nenhuma alteração adicional no funil foi necessária.

## Integridade da referência e do conteúdo

- Os **182 arquivos** foram consultados novamente no servidor original. Todos os SHA-256 coincidem com os originais recuperados.
- Os **175 arquivos de apoio** da adaptação, incluindo imagens, fontes e CSS, conservam exatamente os bytes originais.
- Os **cinco módulos JavaScript** foram comparados por árvore sintática. O conteúdo e a lógica coincidem após considerar as adaptações autorizadas de caminhos, domínio, armazenamento por idioma e copy de entrada.
- O objeto de conteúdo original contém **731 valores de texto**, incluindo títulos, opções, dicas e identificadores. Sua preservação é coberta pela comparação dos módulos.
- A headline e a subheadline aprovadas permanecem em todas as variantes de entrada. A exceção intencional são os dois campos da variante C, que passam a usar a copy principal. Consulte [a configuração aprovada](content/br-landing.json) e [sua verificação](reports/br/landing-copy-verification.json).

## Etapas comparadas

As 18 etapas seguintes à entrada estão cobertas. Os três briefings expandem-se em 17 subfases. O resultado final foi comparado nas 12 combinações de idade/preferência de câmera.

| Ordem após a entrada | Etapa | Comparações | Textos, imagens e SVGs |
|---|---|---:|---|
| 1 | O que mudaria na sua vida com um dinheiro a mais todo mês? | 1 | Iguais |
| 2 | Se os seus vídeos virassem renda, qual seria a primeira conquista? | 1 | Iguais |
| 3 | Onde essa nova atividade cabe no seu dia? | 1 | Iguais |
| 4 | O vídeo sai do seu celular. Quem compra é a marca. | 1 | Iguais |
| 5 | Briefing Caracolê | 7 | Iguais |
| 6 | Você prefere gravar com ou sem aparecer? | 1 | Iguais |
| 7 | Não precisa de seguidores. Nem de mostrar o rosto. | 1 | Iguais |
| 8 | Que produtos da sua rotina podem virar vídeos? | 1 | Iguais |
| 9 | Briefing Pingô | 5 | Iguais |
| 10 | Na vida real, quem paga é a marca. Nunca você. | 1 | Iguais |
| 11 | Briefing Lata Cheia | 5 | Iguais |
| 12 | Quando você quer gravar o primeiro vídeo do seu portfólio? | 1 | Iguais |
| 13 | Estamos montando o seu plano para começar a vender vídeos | 1 | Iguais |
| 14 | Seu próximo passo está pronto. Onde você quer receber? | 1 | Iguais |
| 15 | Quer receber as nossas dicas para começar no UGC? | 1 | Iguais |
| 16 | Como você se chama? | 1 | Iguais |
| 17 | Raspe para descobrir o seu desconto exclusivo! | 1 | Iguais |
| 18 | Resultado e oferta personalizados | 12 | Iguais |
| — | Página de arrependimento | 1 | Iguais |
| **Total** | | **44** | **Aprovadas** |

## Método e limites

Após conferir os hashes atuais, o original verificado foi servido localmente e comparado com a adaptação em `/br/`, usando Chromium com emulação móvel. Cada par recebeu o mesmo estado de quiz, perfil, variante A/B, tamanho de tela, horário e semente aleatória. Foram comparados o texto visível completo, referências e dimensões naturais das imagens, carregamento e marcação dos SVGs. Prefixos de rota, espaços e IDs gerados de SVG foram normalizados; nenhuma das 44 telas precisou de normalização de horários ou ordem de cartões para coincidir.

Esta conferência reproduz estados capturados de todas as etapas e dos 12 resultados. Os percursos completos, cliques e validação adicional em WebKit estão documentados em [VALIDACAO-BR.md](VALIDACAO-BR.md). Não é uma enumeração de todas as combinações possíveis de respostas nem um teste em aparelhos físicos. Não houve envio de respostas ao quiz público, compra ou teste de serviços privados de backend nesta comparação.

## Evidências e reprodução

- [Comparações renderizadas](reports/br/original-parity/comparison.json).
- [Hashes conferidos no site original](reports/br/original-parity/live-files.json).
- [Comparação dos módulos e arquivos de apoio](reports/br/original-parity/static-parity.json).
- Exemplos de screenshots: [primeira etapa original](reports/br/original-parity/18-29_volto_obiettivo_-original.png), [primeira etapa local](reports/br/original-parity/18-29_volto_obiettivo_-local.png), [resultado original](reports/br/original-parity/18-29_volto_risultato_-original.png) e [resultado local](reports/br/original-parity/18-29_volto_risultato_-local.png).

Com `npm start` ativo em outro terminal, execute `npm run verify:original:br`. Requer internet, dependências instaladas e Chromium do Playwright. O comando padrão refaz a consulta dos 182 arquivos e as 44 comparações; diferenças geram evidências e código de saída 1. Os relatórios são sobrescritos pela nova execução.
