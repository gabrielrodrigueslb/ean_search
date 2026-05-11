# Relatorio FarmaIndex vs PT Products - Recuperado

Data da rodada valida: 2026-05-11

Observacao importante:
Este arquivo foi reconstruido a partir dos dados que permaneceram registrados na conversa apos a rodada valida original.
O JSON completo dessa primeira rodada foi sobrescrito depois por uma segunda execucao, quando o PT Products passou a responder com status 402.
Por isso, este relatorio recuperado preserva o resumo consolidado e os exemplos que ainda estavam disponiveis, mas nao todos os 99 itens individualmente.

## Resumo recuperado da rodada valida

- Amostra planejada: 99
- Amostra processada: 99
- Encontrados no FarmaIndex: 98
- Consultados no PT Products: 98
- Encontrados no PT Products: 98
- Exact match: 1
- Strong match: 4
- Likely match: 27
- Weak match: 39
- Mismatch: 27
- Erros: 1

## Leitura pratica

- O PT Products respondeu para praticamente tudo que o FarmaIndex encontrou nessa rodada.
- A correspondencia teve qualidade heterogenea.
- Houve casos muito bons de alinhamento.
- Houve tambem divergencias fortes, inclusive alguns casos aparentemente incorretos no PT Products.

## Exemplos recuperados de mismatch

### EAN `7891058000172`
- FarmaIndex: `Novalgina 500mg/ml Solucao 10 ml`
- PT Products: `Novalgina 10ml`
- Score: `0.2`

### EAN `7891058002008`
- FarmaIndex: `Profenid 20mg/ml Solucao 20 ml + Conta-gotas`
- PT Products: `Profenid Bisnaga Gotejadora 20ml`
- Score: `0.14285714285714285`

### EAN `7891058004347`
- FarmaIndex: `Allegra 6mg/ml Suspensao 60 ml + Seringa Dosadora`
- PT Products: `Felps Professionnel Condicionador Felps Profissional X-blond Silver 300ml`
- Score: `0`

### EAN `7891058004354`
- FarmaIndex: `Allegra 6mg/ml Suspensao 150 ml + Seringa Dosadora`
- PT Products: `Keune Professionnel Condicionador Concentrado Keune Sleek & Shine 200ml`
- Score: `0`

### EAN `7891058006716`
- FarmaIndex: `Allegra D (60,0 + 120,0)mg 10 Comprimidos Revestidos de Liberacao Prolongada`
- PT Products: `Condicionador Antiqueda Clareador Tio Nacho 415ml`
- Score: `0`

### EAN `7891058009458`
- FarmaIndex: `Dorflex 35mg/ml + 300mg/ml + 50mg/ml Solucao`
- PT Products: `Dorflex Gotas Com 20ml`
- Score: `0.16666666666666666`

### EAN `7891058021528`
- FarmaIndex: `Dulcolax 5MG 20 Comprimidos Revestidos de Liberacao Retardada`
- PT Products: `Dulcolax Boehringer 20 Drageas`
- Score: `0.25`

### EAN `7891058021580`
- FarmaIndex: `Anador 500mg/ml Solucao 20 ml`
- PT Products: `Anador Boehringer 20ml`
- Score: `0.2`

### EAN `7891058021603`
- FarmaIndex: `Anador 500mg 512 Comprimidos`
- PT Products: `10 Unidades De Cano Injetor Serve 1 Ao 6 Cil. 4570701033 Mercedes`
- Score: `0`

### EAN `7891058021627`
- FarmaIndex: `Bisolvon 0,8mg/ml Xarope 120 ml`
- PT Products: `Xarope Pediatrico Bisolvon Sabor Morango Boehringer 120ml Solucao`
- Score: `0.25`

## Exemplos recuperados de correspondencia forte

### EAN `7891010256388`
- FarmaIndex: `Motilium 10mg 30 Comprimidos`
- PT Products: `Motilium 10mg 30 Comprimidos`
- Status: `exact_match`

### EAN `7891058003890`
- FarmaIndex: `Anador 1G 10 Comprimidos`
- PT Products: `Anador 1g 10 comprimidos 10 comprimidos`
- Status: `strong_match`

### EAN `7891142115126`
- FarmaIndex: `Alivium 600mg 10 Capsulas Moles`
- PT Products: `Alivium 600mg 10 Capsulas`
- Status: `strong_match`

### EAN `7891158000942`
- FarmaIndex: `Depakene 250mg 25 Capsulas Moles`
- PT Products: `Depakene 250mg 25 Capsulas`
- Status: `strong_match`

### EAN `7891158106408`
- FarmaIndex: `Alivetore 90mg 7 Comprimidos Revestidos`
- PT Products: `Abbott Alivetore 90mg 7 Comprimidos Revestidos`
- Status: `strong_match`

## Erro recuperado da rodada valida

### EAN `7891142128546`
- FarmaIndex: erro `502`
- PT Products: nao consultado nessa linha, seguindo a regra do teste

## Limites desta recuperacao

- O detalhamento completo dos 99 itens da rodada valida nao esta mais disponivel em arquivo.
- Este documento registra apenas o que permaneceu recuperavel: resumo consolidado, exemplos de divergencia, exemplos de boa correspondencia e o erro isolado observado.
