# EAN Search MVP

Documentacao tecnica completa do MVP de saneamento, enriquecimento e revisao de produtos por EAN.

Este documento foi escrito para explicar:

- o problema que o projeto tenta resolver;
- a logica de negocio pensada para o MVP;
- as decisoes de arquitetura adotadas;
- o fluxo de dados ponta a ponta;
- a estrutura do banco;
- o papel de cada pasta e de cada arquivo principal;
- como executar, testar e evoluir o projeto.

---

## 1. Visao geral

### 1.1 Problema de negocio

O projeto existe para melhorar a qualidade de cadastro de produtos de farmacia.

Hoje, muitos produtos chegam ao sistema a partir de ERPs ou bases operacionais com nomes ruins, abreviados ou inconsistentes. Exemplos:

- `SH Dove`
- `DIP 500 CP`
- `Dorflex gts`

Isso atrapalha:

- busca por estoque;
- atendimento automatizado;
- enriquecimento de catalogo;
- comparacao entre produtos equivalentes;
- consolidacao de informacao confiavel por EAN.

O objetivo do sistema nao e simplesmente armazenar dados. O objetivo e **receber entradas imperfeitas**, **enriquecer com fontes externas**, **comparar com a base interna** e **encaminhar incertezas para revisao humana**.

### 1.2 Ideia central do MVP

O MVP foi pensado para funcionar assim:

1. o sistema recebe EANs e nomes por CSV ou JSON;
2. valida o EAN;
3. procura esse EAN na base local;
4. consulta fontes externas para enriquecer o item;
5. se o item for novo, cria cadastro completo ou parcial;
6. se o item ja existir, compara o registro atual com o enriquecido;
7. usa IA para decidir se vale abrir uma proposta de atualizacao;
8. nunca altera automaticamente um cadastro incerto;
9. toda alteracao relevante vira uma solicitacao de revisao humana.

### 1.3 Fontes externas escolhidas

No MVP atual, as fontes foram pensadas assim:

- `PT.ProductSearch`
  - fonte preferida para o **nome comercial amigavel** do produto;
  - especialmente util quando o nome que veio da operacao esta ruim.

- `FarmaIndex`
  - fonte principal para **metadados estruturados de medicamentos**;
  - usado para laboratorio, classe, apresentacao, tarja, registro, forma farmaceutica e sinais de composicao.

### 1.4 Regras mais importantes

- O `EAN` vive na tabela de `apresentacoes`, nao em `produtos`.
- Um `produto` pode ter mais de uma `apresentacao`.
- Produtos de perfumaria podem nao existir no `FarmaIndex`.
- Nao exigimos campos clinicos para perfumaria.
- Divergencia nao gera update automatico; gera revisao.
- O humano continua sendo a autoridade final.

---

## 2. O que foi pensado para construir

### 2.1 Contrato de entrada desacoplado da origem

Uma decisao importante foi **nao acoplar o sistema ao CSV**.

Mesmo que o MVP hoje aceite principalmente CSV, o restante da aplicacao foi pensado para trabalhar com um **contrato interno de item importado**. Isso evita que o pipeline precise ser reescrito quando no futuro a entrada vier por:

- JSON;
- ERP;
- API;
- fila;
- integracao direta com banco.

Em vez de deixar o sistema dependente do formato bruto, a ideia e:

1. cada origem possui um adapter;
2. o adapter transforma o dado bruto para um formato interno comum;
3. o pipeline processa apenas esse formato comum.

Isso traz alguns beneficios de arquitetura:

- separa responsabilidade de parsing da regra de negocio;
- facilita testes;
- abre espaco para novas origens sem mexer no fluxo principal;
- aproxima a implementacao de principios como `SRP`, `OCP` e `DIP`.

### 2.2 Separacao em camadas

O projeto foi estruturado em camadas com papeis claros:

- `routes`
  - mapeiam endpoints HTTP;
- `controllers`
  - traduzem request/response para chamadas de negocio;
- `services`
  - concentram a regra de negocio;
- `repositories`
  - encapsulam acesso a dados;
- `integrations`
  - encapsulam APIs externas;
- `utils`
  - funcoes auxiliares puras;
- `lib`
  - infraestrutura compartilhada;
- `adapters`
  - transformam entradas externas para o formato interno.

Essa divisao foi pensada para manter o sistema evolutivo e para impedir que regras de negocio fiquem espalhadas por controllers ou rotas.

### 2.3 Banco em portugues

As tabelas e campos principais do dominio foram definidos em portugues para manter alinhamento com o contexto do produto e com a equipe.

As entidades centrais escolhidas foram:

- `produtos`
- `apresentacoes`
- `farmacos`
- `produto_farmacos`
- `importacoes`
- `itens_importacao`
- `solicitacoes_revisao`
- `eans_nao_encontrados`
- `historico_alteracoes`

### 2.4 IA como analista, nao como autora final

Outra decisao importante: a IA nao atualiza o banco diretamente.

Ela entra para:

- comparar cadastro atual com dados enriquecidos;
- dizer se os registros parecem o mesmo produto;
- dizer se ha motivo real para sugerir alteracao;
- montar a sugestao final;
- explicar o diff.

Mas a decisao final continua humana.

---

## 3. Logica de negocio ponta a ponta

### 3.1 Fluxo geral

O fluxo principal do sistema e:

1. entrada de itens
2. validacao do EAN
3. consulta na base local
4. enriquecimento com fontes externas
5. criacao de cadastro novo ou revisao
6. persistencia do historico do processamento

### 3.2 Fluxo detalhado

#### Caso A: item novo

1. Recebe o item importado.
2. Normaliza e valida o EAN.
3. Busca o EAN em `apresentacoes`.
4. Se nao existir:
   - consulta `PT.ProductSearch`;
   - consulta `FarmaIndex` por EAN;
   - se houver resultado no `FarmaIndex`, consulta o detalhe do medicamento;
   - monta um snapshot consolidado.

5. Se o snapshot consolidado tiver dados suficientes:
   - cria `produto`;
   - cria `apresentacao`;
   - cria relacao com `farmacos`, se houver.

6. Se o snapshot existir, mas estiver parcial:
   - ainda cria o cadastro minimo;
   - cria uma `solicitacao_revisao`.

7. Se nenhuma fonte encontrar o item:
   - registra em `eans_nao_encontrados`;
   - marca o item da importacao como `not_found`.

#### Caso B: item ja existente

1. Recebe o item importado.
2. Valida o EAN.
3. Encontra registro local.
4. Enriquece com as fontes externas.
5. Monta dois snapshots:
   - `atual`
   - `sugerido`
6. Envia ambos para o servico de IA.
7. Se a IA concluir que nao vale alterar:
   - marca o item como processado.
8. Se a IA concluir que vale sugerir alteracao:
   - cria uma `solicitacao_revisao`;
   - guarda diff, resumo, score e payload sugerido;
   - nao atualiza o produto automaticamente.

### 3.3 Heuristica atual para tipo do produto

Hoje a heuristica no MVP e simples:

- se encontrou no `FarmaIndex`, trata como `medicamento`;
- se nao encontrou no `FarmaIndex`, mas encontrou no `PT.ProductSearch`, trata como `perfumaria`;
- caso contrario, `outro`.

Isso e pragmatico para o MVP, mas nao e definitivo.

### 3.4 Cadastro parcial

Cadastro parcial significa:

- o sistema conseguiu obter dados minimos suficientes para criar um produto;
- mas nao conseguiu montar toda a estrutura desejada.

Exemplos:

- produto encontrado so no `PT.ProductSearch`;
- produto de perfumaria sem detalhe clinico;
- medicamento sem detalhe estruturado suficiente.

Nesses casos:

- o produto e criado;
- a operacao nao fica travada;
- uma revisao pode ser aberta para completar depois.

---

## 4. Estrutura do banco

## 4.1 Tabela `produtos`

Representa a entidade comercial principal.

Campos principais:

- `id`
- `nome`
- `nome_normalizado`
- `slug`
- `tipo`
- `laboratorio`
- `laboratorio_slug`
- `classe`
- `classe_slug`
- `categoria`
- `origem_nome`
- `created_at`
- `updated_at`

Uso:

- guarda a identidade principal do produto;
- nao guarda o EAN;
- serve como pai de uma ou mais apresentacoes.

## 4.2 Tabela `apresentacoes`

Representa a apresentacao comercial ligada ao produto.

Campos principais:

- `id`
- `produto_id`
- `ean`
- `descricao`
- `dose`
- `unidade`
- `forma_farmaceutica`
- `via_administracao`
- `quantidade`
- `volume`
- `registro_ms`
- `tarja`
- `origem_dados`
- `created_at`
- `updated_at`

Uso:

- guarda o `EAN`;
- concentra atributos da apresentacao;
- permite multiplas apresentacoes para o mesmo produto.

## 4.3 Tabela `farmacos`

Representa substancias ativas associadas ao produto.

Campos principais:

- `id`
- `nome`
- `nome_normalizado`
- `slug`
- `created_at`
- `updated_at`

Uso:

- evita duplicidade de principio ativo;
- permite reuso entre produtos;
- serve de base para relacao N:N.

## 4.4 Tabela `produto_farmacos`

Tabela de associacao entre produto e farmaco.

Campos principais:

- `id`
- `produto_id`
- `farmaco_id`
- `created_at`

Uso:

- modela a relacao N:N;
- permite que um produto tenha varios farmacos;
- permite que um farmaco apareca em varios produtos.

## 4.5 Tabela `importacoes`

Representa um lote de processamento.

Campos principais:

- `id`
- `fonte`
- `status`
- `total_itens`
- `itens_processados`
- `itens_sucesso`
- `itens_falha`
- `itens_revisao`
- `created_at`
- `finished_at`

Uso:

- auditoria do processamento;
- monitoramento do lote;
- consolidacao de estatisticas.

## 4.6 Tabela `itens_importacao`

Representa cada item individual de um lote.

Campos principais:

- `id`
- `importacao_id`
- `ean`
- `nome_recebido`
- `dados_brutos`
- `status`
- `mensagem_erro`
- `fontes_consultadas`
- `created_at`
- `updated_at`

Uso:

- rastrear o status de cada item;
- preservar o payload original;
- registrar erro por item;
- ajudar em reprocessamento futuro.

## 4.7 Tabela `solicitacoes_revisao`

Fila de revisao humana.

Campos principais:

- `id`
- `entity_type`
- `entity_id`
- `ean`
- `dados_atuais`
- `dados_sugeridos`
- `diff_campos`
- `motivo`
- `resumo_ia`
- `confidence_score`
- `fonte`
- `status`
- `reviewed_by`
- `reviewed_at`
- `created_at`
- `updated_at`

Uso:

- registrar propostas de alteracao;
- guardar diff completo;
- manter historico de aprovacao/rejeicao;
- desacoplar IA da escrita direta no produto.

## 4.8 Tabela `eans_nao_encontrados`

Fila de itens nao resolvidos pelas fontes.

Campos principais:

- `id`
- `ean`
- `nome_recebido`
- `dados_brutos`
- `fontes_tentadas`
- `motivo_nao_encontrado`
- `status`
- `created_at`
- `updated_at`

Uso:

- registrar falhas de enriquecimento;
- alimentar revisao humana;
- impedir perda silenciosa de dados.

## 4.9 Tabela `historico_alteracoes`

Auditoria da aplicacao de revisoes aprovadas.

Campos principais:

- `id`
- `solicitacao_revisao_id`
- `entity_type`
- `entity_id`
- `antes`
- `depois`
- `aplicado_por`
- `created_at`

Uso:

- rastreabilidade;
- auditoria;
- suporte a investigacao futura.

---

## 5. Estrutura tecnica do projeto

```text
src/
  app.js
  server.js
  adapters/
  config/
  controllers/
  integrations/
  lib/
  middleware/
  repositories/
  routes/
  services/
  utils/

prisma/
  schema.prisma

tests/
  validateEAN.test.js
```

### 5.1 Filosofia da estrutura

Essa estrutura foi pensada para que:

- HTTP fique separado da regra de negocio;
- regra de negocio fique separada de persistencia;
- persistencia fique separada de APIs externas;
- entrada fique separada do processamento;
- utilitarios puros nao dependam da infraestrutura.

---

## 6. O que cada arquivo faz

Esta secao descreve o papel de cada arquivo relevante do projeto atual.

## 6.1 Arquivos de entrada da aplicacao

### `src/app.js`

Responsavel por montar a aplicacao Express.

Faz:

- cria a instancia do `express`;
- registra middlewares de JSON e URL encoding;
- expõe o endpoint `/health`;
- conecta as rotas de imports, products e reviews;
- registra o middleware global de erro.

Nao faz:

- nao sobe o servidor;
- nao conecta no banco;
- nao executa bootstrap.

### `src/server.js`

Ponto de inicializacao do backend.

Faz:

- carrega configuracoes;
- chama `initDatabase()` para garantir a estrutura do SQLite;
- conecta o Prisma;
- sobe o servidor HTTP;
- trata falha de bootstrap.

Esse arquivo e a “porta de entrada” do processo Node.

## 6.2 Configuracao

### `src/config/env.js`

Centraliza leitura de variaveis de ambiente.

Responsabilidades:

- carregar `.env` com `dotenv`;
- expor `PORT`;
- expor `DATABASE_URL`;
- expor `OPENAI_API_KEY`;
- expor `OPENAI_MODEL`;
- expor timeout padrao de requests.

Ele evita que `process.env` fique espalhado pelo projeto inteiro.

## 6.3 Infraestrutura

### `src/lib/prisma.js`

Cria uma instancia unica de `PrismaClient`.

Papel:

- encapsular a conexao principal do app com o banco via Prisma;
- servir de dependencia para os repositories.

### `src/lib/initDatabase.js`

Bootstrap manual do banco SQLite usando `better-sqlite3`.

Esse arquivo existe por um motivo importante:

- o schema Prisma foi mantido como fonte de modelagem;
- mas o ambiente atual teve problema com os comandos de migracao do Prisma;
- para nao travar o MVP, a estrutura fisica do SQLite e criada manualmente no startup.

Responsabilidades:

- resolver o caminho do arquivo SQLite;
- garantir que o diretorio exista;
- criar tabelas se ainda nao existirem;
- criar indices necessarios;
- ativar `foreign_keys`.

Importante:

- ele nao substitui o schema Prisma como documentacao do dominio;
- ele e uma solucao de bootstrap operacional para o MVP atual.

## 6.4 Adapters

### `src/adapters/base-import.adapter.js`

Classe base para adaptadores de importacao.

Objetivo:

- definir a ideia de que cada origem deve converter seus dados para um contrato interno comum.

Responsabilidades:

- guardar a `source`;
- fornecer `normalizeItem()`;
- exigir implementacao de `parse()` nas subclasses.

### `src/adapters/csv-import.adapter.js`

Primeiro adapter concreto do sistema.

Responsabilidades:

- receber o arquivo CSV em buffer;
- parsear o CSV usando `csv-parse/sync`;
- converter registros crus para o contrato interno.

Esse arquivo materializa a decisao de nao deixar o core acoplado ao CSV.

## 6.5 Controllers

### `src/controllers/import.controller.js`

Controla os endpoints de importacao.

Responsabilidades:

- validar presenca do arquivo CSV;
- criar o `CsvImportAdapter`;
- disparar `ImportService.processItems()`;
- aceitar JSON como segunda forma de entrada;
- consultar status de importacao por ID.

### `src/controllers/products.controller.js`

Controla a consulta de produto por EAN.

Responsabilidade:

- chamar `ProductService.findByEan()`;
- devolver 404 se nao encontrar.

### `src/controllers/reviews.controller.js`

Controla a fila de revisao humana.

Responsabilidades:

- listar revisoes por status;
- buscar revisao por ID;
- aprovar revisao;
- rejeitar revisao.

## 6.6 Rotas

### `src/routes/import.routes.js`

Mapeia:

- `POST /imports/csv`
- `POST /imports/json`
- `GET /imports/:id`

Tambem:

- usa `multer` para upload em memoria;
- envolve handlers com `asyncHandler`.

### `src/routes/products.routes.js`

Mapeia:

- `GET /products/ean/:ean`

### `src/routes/reviews.routes.js`

Mapeia:

- `GET /reviews`
- `GET /reviews/:id`
- `POST /reviews/:id/approve`
- `POST /reviews/:id/reject`

## 6.7 Middleware

### `src/middleware/errorHandler.js`

Middleware global de erro do Express.

Responsabilidades:

- capturar excecoes nao tratadas nas rotas;
- devolver resposta padronizada;
- incluir `details` quando houver.

## 6.8 Integracoes externas

### `src/integrations/pt-product-search.client.js`

Client da fonte `PT.ProductSearch`.

Responsabilidades:

- fazer request HTTP;
- baixar HTML;
- parsear com `cheerio`;
- extrair o nome comercial a partir do link principal da busca.

Saida esperada:

- `{ nome, origem }`
- ou `null` quando nao encontrar.

### `src/integrations/farmaindex.client.js`

Client da fonte `FarmaIndex`.

Responsabilidades:

- buscar por EAN em `/busca`;
- extrair o bloco `__NEXT_DATA__`;
- localizar o primeiro item da busca;
- buscar o detalhe do medicamento via `slug + medicamentoid`.

Observacao:

o client trabalha com HTML da pagina e extracao de JSON embutido, nao com um endpoint REST formal.

## 6.9 Repositories

### `src/repositories/produto.repository.js`

Repository principal de produto.

Responsabilidades:

- buscar produto agregado por EAN;
- criar produto com apresentacao e farmacos;
- atualizar produto com base em snapshot aprovado.

Esse arquivo centraliza a operacao mais sensivel de persistencia do dominio.

### `src/repositories/importacao.repository.js`

Responsabilidades:

- criar importacao;
- atualizar importacao;
- buscar importacao por ID;
- criar item da importacao;
- atualizar item.

### `src/repositories/solicitacao-revisao.repository.js`

Responsabilidades:

- criar solicitacao de revisao;
- buscar por ID;
- listar por status;
- atualizar status;
- listar pendencias por EAN.

### `src/repositories/ean-nao-encontrado.repository.js`

Responsabilidade:

- registrar ou atualizar EAN nao encontrado.

Usa `upsert` para nao duplicar o mesmo EAN na fila de nao encontrados.

### `src/repositories/historico-alteracoes.repository.js`

Responsabilidade:

- gravar trilha de auditoria quando uma revisao aprovada e aplicada.

## 6.10 Services

### `src/services/import.service.js`

E o **orquestrador principal do sistema**.

Responsabilidades:

- criar o lote de importacao;
- processar item por item;
- validar EAN;
- consultar produto existente;
- enriquecer dados externamente;
- decidir entre:
  - criar produto novo;
  - abrir revisao;
  - marcar item como nao encontrado;
  - marcar item como falho.

Metodos principais:

- `processItems()`
  - cria importacao, processa lote e fecha contadores finais.

- `processSingleItem()`
  - executa o pipeline de um item individual.

- `handleExistingProduct()`
  - compara cadastro atual com enriquecido;
  - chama a IA;
  - cria revisao se necessario.

- `handleNewProduct()`
  - cria produto novo;
  - abre revisao para cadastro parcial;
  - registra `ean_nao_encontrado` quando nenhuma fonte ajudar.

### `src/services/enrichment.service.js`

Responsavel por compor os dados vindos das fontes externas.

Responsabilidades:

- instanciar os clients externos;
- decidir tipo do produto;
- extrair farmacos do detalhe do `FarmaIndex`;
- montar o snapshot interno padronizado;
- consolidar nome comercial, apresentacao e metadados.

Ponto importante:

esse service e o lugar onde as fontes externas deixam de ser “dados crus” e passam a virar um objeto de dominio do sistema.

### `src/services/ai.service.js`

Responsavel por comparar snapshots usando IA.

Responsabilidades:

- inicializar client da OpenAI quando houver chave;
- montar resposta mock quando nao houver chave;
- enviar o payload para a OpenAI;
- esperar um JSON estruturado;
- devolver:
  - se e o mesmo produto;
  - se vale sugerir atualizacao;
  - resumo;
  - score;
  - dados sugeridos;
  - diff por campos.

Observacao importante:

atualmente, na ausencia de `OPENAI_API_KEY`, o comportamento cai para uma comparacao local simples. Isso foi pensado para nao bloquear testes do MVP.

### `src/services/product.service.js`

Camada de negocio de consulta e criacao de produto.

Responsabilidades:

- montar o agregado de resposta para `GET /products/ean/:ean`;
- adicionar revisoes pendentes ligadas ao mesmo EAN;
- criar produto a partir do snapshot montado pelo enrichment.

### `src/services/review.service.js`

Camada de negocio da revisao humana.

Responsabilidades:

- listar revisoes;
- detalhar revisao;
- criar revisao;
- aprovar revisao;
- rejeitar revisao;
- gravar historico de alteracao quando uma revisao e aprovada.

Na aprovacao:

- atualiza o registro do produto;
- salva antes/depois no historico;
- marca a revisao como aprovada.

## 6.11 Utils

### `src/utils/normalizeText.js`

Normaliza texto para comparacao e armazenamento:

- remove acentos;
- remove pontuacao;
- reduz espacos;
- transforma em lowercase.

### `src/utils/slugify.js`

Cria `slug` a partir do texto normalizado.

### `src/utils/validateEAN.js`

Valida EAN:

- remove caracteres nao numericos;
- valida tamanho;
- calcula digito verificador.

Tambem expõe `onlyDigits()`.

### `src/utils/diffObjects.js`

Compara dois objetos rasos e devolve as diferencas.

Uso principal:

- apoiar comparacao entre dados atuais e sugeridos;
- ajudar na montagem de `diff_campos`.

### `src/utils/asyncHandler.js`

Wrapper para rotas async do Express.

Evita espalhar `try/catch` de infraestrutura em todos os handlers.

## 6.12 Testes

### `tests/validateEAN.test.js`

Teste inicial de unidade do validador de EAN.

Hoje cobre:

- EAN valido;
- EAN invalido.

E um ponto de partida, nao a cobertura completa do projeto.

## 6.13 Modelagem Prisma

### `prisma/schema.prisma`

E a representacao formal do modelo de dados da aplicacao.

Papel:

- documentar tabelas;
- documentar enums;
- orientar o Prisma Client;
- servir como fonte de verdade semantica do dominio.

Mesmo com o bootstrap manual atual, esse arquivo continua sendo referencia de modelagem.

---

## 7. Endpoints da API

## 7.1 Healthcheck

### `GET /health`

Resposta:

```json
{
  "status": "ok"
}
```

## 7.2 Importacao

### `POST /imports/csv`

Entrada:

- `multipart/form-data`
- arquivo no campo `file`

Uso:

- importa itens a partir de CSV.

### `POST /imports/json`

Entrada:

```json
{
  "items": [
    {
      "ean": "7891058009458",
      "nome": "Dorflex Gotas"
    }
  ]
}
```

Uso:

- caminho alternativo para testes e futuras integracoes.

### `GET /imports/:id`

Uso:

- consultar o status de um lote.

## 7.3 Produtos

### `GET /products/ean/:ean`

Retorna:

- produto;
- apresentacoes;
- farmacos;
- revisoes pendentes relacionadas.

## 7.4 Revisoes

### `GET /reviews?status=pending`

Lista revisoes pendentes ou por outro status.

### `GET /reviews/:id`

Detalha uma revisao.

### `POST /reviews/:id/approve`

Exemplo:

```json
{
  "reviewed_by": "Gabriel"
}
```

### `POST /reviews/:id/reject`

Exemplo:

```json
{
  "reviewed_by": "Gabriel"
}
```

---

## 8. Como rodar o projeto

## 8.1 Instalar dependencias

```bash
npm install
```

## 8.2 Variaveis de ambiente

O arquivo `.env` precisa conter ao menos:

```env
DATABASE_URL="file:C:/Users/Gabriel/Documents/dev/ean_search/prisma/dev.db"
PORT=3000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
REQUEST_TIMEOUT_MS=10000
```

## 8.3 Subir em desenvolvimento

```bash
npm run dev
```

## 8.4 Subir normalmente

```bash
npm start
```

## 8.5 Testar healthcheck

```bash
curl http://localhost:3000/health
```

---

## 9. Como testar o fluxo

## 9.1 Teste por JSON

```bash
curl -X POST http://localhost:3000/imports/json \
  -H "Content-Type: application/json" \
  -d "{\"items\":[{\"ean\":\"7891058009458\",\"nome\":\"Dorflex Gotas\"}]}"
```

## 9.2 Teste por CSV

Exemplo de CSV:

```csv
ean,nome
7891058009458,Dorflex Gotas
7896714207551,Dorflex UNO
```

Envio:

```bash
curl -X POST http://localhost:3000/imports/csv \
  -F "file=@teste.csv"
```

## 9.3 Consultar importacao

```bash
curl http://localhost:3000/imports/1
```

## 9.4 Consultar produto por EAN

```bash
curl http://localhost:3000/products/ean/7891058009458
```

## 9.5 Consultar revisoes pendentes

```bash
curl "http://localhost:3000/reviews?status=pending"
```

## 9.6 Aprovar revisao

```bash
curl -X POST http://localhost:3000/reviews/1/approve \
  -H "Content-Type: application/json" \
  -d "{\"reviewed_by\":\"Gabriel\"}"
```

## 9.7 Rejeitar revisao

```bash
curl -X POST http://localhost:3000/reviews/1/reject \
  -H "Content-Type: application/json" \
  -d "{\"reviewed_by\":\"Gabriel\"}"
```

---

## 10. Decisoes de arquitetura importantes

## 10.1 Por que usar adapter de importacao?

Porque o sistema nao deve depender de CSV como regra de negocio.

CSV e so uma forma de entrada.

O contrato interno permite:

- plugar novas origens;
- manter o pipeline estavel;
- testar melhor;
- evoluir para integracoes reais depois.

## 10.2 Por que separar service de repository?

Porque:

- `service` pensa na regra;
- `repository` pensa em persistencia.

Sem isso, a regra de negocio ficaria misturada com SQL/Prisma e seria mais dificil de manter.

## 10.3 Por que guardar payloads brutos?

Porque o projeto e de saneamento e auditoria.

Quando algo der errado, o time precisa responder:

- o que chegou originalmente?
- o que foi inferido?
- o que foi sugerido?
- por que isso virou revisao?

Sem os payloads brutos, essa trilha some.

## 10.4 Por que IA com fallback mock?

Porque o MVP precisa funcionar mesmo sem chave de API configurada.

Assim:

- o fluxo pode ser testado localmente;
- a arquitetura ja fica preparada para a OpenAI;
- a dependencia externa nao bloqueia o desenvolvimento.

## 10.5 Por que bootstrap manual do banco?

Porque o ambiente atual apresentou problema com `prisma migrate` / `prisma db push`, embora o schema esteja valido e o client funcione.

Entao foi adotada uma estrategia pragmatica:

- manter `schema.prisma` como modelagem;
- usar `PrismaClient` nas operacoes;
- criar a estrutura fisica do SQLite manualmente no startup.

Isso nao e o ideal final, mas foi uma decisao consciente para nao travar o MVP.

---

## 11. Limitacoes atuais do MVP

Hoje o sistema ainda tem algumas limitacoes importantes:

1. a extracao de farmacos do `FarmaIndex` usa heuristica textual;
2. a classificacao `medicamento/perfumaria/outro` ainda e simples;
3. a IA ainda depende de prompt livre e resposta JSON;
4. os testes automatizados ainda sao basicos;
5. o front-end de revisao ainda nao existe;
6. o bootstrap do banco esta manual em vez de 100% via migracoes Prisma;
7. o processamento do lote esta sequencial, nao paralelo.

Nada disso invalida o MVP, mas e importante saber o que ainda e provisao.

---

## 12. Caminho de evolucao recomendado

Os proximos passos mais naturais seriam:

1. adicionar mais testes de integracao;
2. criar fixtures de HTML das fontes externas;
3. melhorar a extracao de farmacos com regras mais confiaveis;
4. tornar o diff de revisao mais rico;
5. criar interface humana de revisao;
6. resolver de vez a esteira de migracoes Prisma;
7. adicionar novos adapters de entrada;
8. considerar fila/worker para processamentos maiores.

---

## 13. Resumo final da arquitetura

Se fosse resumir a ideia do projeto em uma frase:

> este sistema foi pensado para receber cadastros imperfeitos, transformar entradas heterogeneas em um contrato interno comum, enriquecer com fontes externas, comparar com a base local e encaminhar incertezas para revisao humana com rastreabilidade.

E essa e a linha que organiza a implementacao inteira:

- adapters na borda;
- services no centro;
- repositories na persistencia;
- IA como apoio de decisao;
- humano como aprovador final.

