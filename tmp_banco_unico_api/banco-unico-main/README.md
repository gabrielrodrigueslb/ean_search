# Banco Unico

API em `Node.js + Express` para registrar e pesquisar produtos em `Postgres + pgvector`, com embeddings reais da OpenAI e apoio lexical por tokens.

## Estrutura

```text
src/
  controllers/
  modules/
    database/
    health/
    products/
    vector/
  routes/
  shared/
```

## Modelo de produto

Campos aceitos pela API:

- `descricaoProduto` obrigatorio
- `ean` obrigatorio
- `principioAtivo` opcional
- `classificacao` opcional
- `nomeSocial` opcional
- `fabricante` opcional
- `detalhes` opcional, reservado para a fase 2

O `EAN` e a chave unica natural do produto.

## Como a busca funciona

- A API monta um texto composto com os campos do produto.
- Esse texto e tokenizado para suporte a ranking lexical.
- A API gera um embedding real na OpenAI e salva esse vetor no `pgvector`.
- A busca gera o embedding da query com o mesmo modelo.
- Se a query parecer um EAN, a API prioriza match exato.

## Endpoints

### `GET /health`

### `POST /api/products`

Aceita um produto unico ou um lote em `products` ou `produtos`.

Exemplo:

```json
{
  "products": [
    {
      "descricaoProduto": "Dipirona Sodica 500mg Comprimido",
      "principioAtivo": "Dipirona Sodica",
      "classificacao": "GENERICO",
      "nomeSocial": "Dipirona",
      "fabricante": "Farmaceutica Exemplo",
      "ean": "7891234567890"
    }
  ]
}
```

Para lotes muito grandes, a resposta volta com resumo e nao com todos os itens.

### `POST /api/products/search`

Esse endpoint agora suporta dois modos:

- busca interna do `banco_unico`
- busca composta com ERP local, sem depender mais do `product_search_v2`

Fluxo:

1. Busca os produtos no `banco_unico`.
2. Extrai os `EANs` encontrados.
3. Quando `integrations` for enviado, repassa esses `EANs` para endpoints externos genéricos.
4. Quando `provider`, `vetorToken`, `trierToken` ou `alpha7Authenticate` for enviado, consulta o ERP direto aqui no projeto e faz o merge por `EAN`.

```json
{
  "query": "dipirona 500mg generico",
  "limit": 10,
  "offset": 0,
  "includeRelevanceScore": false,
  "integrations": [
    {
      "id": "erp-principal",
      "provider": "generic-json",
      "auth": {
        "type": "apiKeyHeader",
        "headerName": "x-api-key",
        "value": "<secret>"
      },
      "request": {
        "url": "https://erp.exemplo.com/api/catalog/search",
        "method": "POST",
        "eanField": "eans",
        "extraBody": {
          "tenant": "minha-loja"
        }
      }
    }
  ]
}
```

`includeRelevanceScore` e opcional.

- Por padrao, a busca nao chama a etapa extra de reranking/relevancia na OpenAI.
- Envie `includeRelevanceScore: true` apenas quando precisar desse enriquecimento.
- Se quiser religar isso globalmente, defina `DEFAULT_INCLUDE_RELEVANCE_SCORE=true` no ambiente.

Exemplo buscando por codigo de barras:

```json
{
  "query": "7891234567890",
  "limit": 1,
  "offset": 0
}
```

Resposta resumida:

```json
{
  "query": "dipirona 500mg generico",
  "limit": 10,
  "offset": 0,
  "returned": 10,
  "hasMore": true,
  "nextOffset": 10,
  "results": [],
  "matchedEans": [],
  "integrations": []
}
```

Se `integrations` nao for enviado, o endpoint continua funcionando como antes e so retorna a busca do banco.

### `POST /api/products/search/vetor`

Executa o fluxo completo local:

1. busca no `banco_unico`
2. consulta a `Vetor` pelos `EANs` encontrados
3. faz o merge e devolve o resultado enriquecido

Exemplo:

```json
{
  "query": "dipirona 500mg",
  "vetorToken": "SEU_TOKEN_DA_VETOR",
  "cdfilial": 1,
  "limit": 10,
  "includeRelevanceScore": false
}
```

Tambem funciona em `POST /api/products/search` se voce enviar `vetorToken` no body.

### `POST /api/products/search/trier`

Executa o fluxo completo local:

1. busca no `banco_unico`
2. consulta a `Trier` pelos `EANs` encontrados
3. faz o merge e devolve o resultado enriquecido

Exemplo:

```json
{
  "query": "dipirona 500mg",
  "trierToken": "SEU_TOKEN_DA_TRIER",
  "cdfilial": 1,
  "limit": 10,
  "includeRelevanceScore": false
}
```

Tambem funciona em `POST /api/products/search` se voce enviar `trierToken` no body.

### `POST /api/products/search/alpha7`

Executa o fluxo completo local:

1. busca no `banco_unico`
2. consulta o `Alpha7` pelos `EANs` encontrados
3. faz o merge e devolve o resultado enriquecido

Exemplo:

```json
{
  "query": "dipirona 500mg",
  "alpha7Authenticate": "SUA_CHAVE_DO_ALPHA7",
  "alpha7BaseUrl": "https://alpha7.exemplo.com",
  "limit": 10,
  "includeRelevanceScore": false
}
```

Campos opcionais do Alpha7:

- `alpha7RequestPath`: sobrescreve o path do endpoint. Padrao: `/api/consultar-eans`
- `alpha7AuthHeaderName`: sobrescreve o nome do header de autenticacao. Padrao: `x-api-key`
- `alpha7AuthPrefix`: adiciona prefixo ao valor do header, se necessario
- `authenticate`: alias aceito para `alpha7Authenticate` na rota dedicada

Tambem funciona em `POST /api/products/search` se voce enviar `alpha7Authenticate` no body.

Resposta resumida:

```json
{
  "found": true,
  "provider": {
    "key": "vetor",
    "displayName": "Vetor"
  },
  "query": "dipirona 500mg",
  "total": 1,
  "matchedEans": ["7891234567890"],
  "products": []
}
```

### `POST /api/products/search/providers/:provider`

Rota generica para o fluxo local de ERPs. Hoje os providers reais registrados sao:

- `alpha7`
- `trier`
- `vetor`

### `POST /api/products/search/base`

Executa somente a busca interna no `banco_unico`, sem chamar nenhum ERP/ecommerce.

Use essa rota quando quiser depurar apenas a relevancia da busca ou reaproveitar a etapa base separadamente.

### `GET /api/products/search/contracts`

Retorna os contratos suportados pela camada de integracoes:

- `providers`: formatos de request aceitos hoje
- `authTypes`: formas suportadas de autenticacao

Hoje a arquitetura ja aceita:

- `generic-json`: envia os EANs num body JSON
- `generic-query`: envia os EANs por query string

Formas de autenticacao suportadas:

- `none`
- `bearer`
- `apiKeyHeader`
- `apiKeyQuery`
- `apiKeyBody`
- `basic`
- `customHeaders`

### `GET /api/products/search/providers/contracts`

Retorna os providers locais registrados no `banco_unico`, com:

- `key`
- `displayName`
- `auth`
- `requestSchema`
- `capabilities`

## Arquitetura da busca composta

O endpoint final agora foi separado em duas camadas:

- `products.service.searchProducts`: continua sendo a function base que consulta o banco e ranqueia os resultados
- `product-search-orchestrator.service.searchProductsWithIntegrations`: chama a busca base, extrai os `EANs` e dispara as integracoes externas
- `client-search.service.searchProductsForClientProvider`: chama a busca base, resolve o ERP local e faz o merge por `EAN`

Isso deixa o fluxo pronto para plugar novos ERPs sem mexer na logica de busca semantica e sem depender mais do `product_search_v2`.

### Como adicionar um novo ERP

1. Criar um provider em `src/modules/client-search/providers/<erp>/`
2. Criar um parser de request para esse ERP
3. Registrar esse provider em `src/modules/client-search/client-provider-registry.js`
4. Definir `auth`, `requestSchema` e `capabilities`

Com isso, o controller e o endpoint continuam iguais.

Paginacao:

- `limit` define quantos itens devem voltar por pagina.
- `offset` define de qual posicao a busca deve continuar.
- `hasMore` indica se existe uma proxima pagina.
- `nextOffset` retorna o valor que deve ser enviado na chamada seguinte.

Exemplo da segunda pagina:

```json
{
  "query": "dipirona 500mg generico",
  "limit": 10,
  "offset": 10
}
```

## Benchmark de qualidade da busca

O projeto inclui uma suite inicial de casos em:

- `benchmarks/search-quality.cases.json`
- `benchmarks/search-quality.cases.csv`

Categorias cobertas:

- `nome-exato`
- `typo`
- `principio-ativo`
- `composto`
- `intencao`
- `ean`
- `marca-principio`
- `fabricante-classe`

### Rodar localmente

Com a API escutando em `http://127.0.0.1:3000`:

```bash
npm run benchmark:search-quality
```

Se sua API local estiver em outra porta:

```bash
SEARCH_QUALITY_BASE_URL=http://127.0.0.1:3326 npm run benchmark:search-quality
```

### Rodar em producao

Usando a URL publicada pelo Nginx:

```bash
SEARCH_QUALITY_BASE_URL=https://unicocontato.tech/banco-unico npm run benchmark:search-quality
```

### Filtrar benchmark

Rodar so uma categoria:

```bash
npm run benchmark:search-quality -- --category typo
```

Rodar apenas os primeiros casos:

```bash
npm run benchmark:search-quality -- --limit-cases 10
```

Trocar arquivo de benchmark:

```bash
npm run benchmark:search-quality -- --file benchmarks/search-quality.cases.json
```

### Interpretacao

- `nome-exato`: esperado em `top 1`
- `typo`: esperado em `top 3`
- `principio-ativo`: esperado em `top 3`
- `composto`: esperado em `top 3`
- `intencao`: esperado em `top 5`
- `ean`: esperado em `top 1`

Essa suite e um ponto de partida. O ideal e complementar com consultas reais dos usuarios e com os produtos de maior impacto comercial.

## Teste de carga na VPS

O projeto agora inclui um script simples de carga em `scripts/load-test.js`, sem dependencias extras.

Ele suporta dois cenarios:

- `health`: mede o baseline da infra e da API.
- `search`: mede o fluxo real de busca, incluindo `OpenAI + Node + Postgres`.

### Quando usar cada cenario

- Use `health` para descobrir quantas requisicoes sua VPS aguenta responder sem o gargalo da OpenAI.
- Use `search` para medir a experiencia real do usuario final e achar o ponto em que a latencia, `timeouts` ou erros passam a subir.

Importante:

- O cenario `search` faz uma chamada de embedding para a OpenAI em toda requisicao.
- Se `includeRelevanceScore=true`, cada busca tambem faz uma segunda chamada para avaliar relevancia.
- Isso significa que o limite observado nesse teste pode ser da OpenAI, da sua rede ou da VPS.
- Se quiser medir apenas a sua infra, rode primeiro o `health`.
- De preferencia, rode o gerador de carga fora da mesma VPS, para nao disputar CPU e rede com a propria API.

### Rodar contra a VPS

Baseline da infra:

```bash
npm run benchmark:load -- \
  --base-url=https://unicocontato.tech/banco-unico \
  --scenario=health \
  --stages=10x15,50x15,100x15
```

Busca real com subida gradual de concorrencia:

```bash
npm run benchmark:load -- \
  --base-url=https://unicocontato.tech/banco-unico \
  --scenario=search \
  --stages=1x30,5x30,10x30 \
  --timeout-ms=20000
```

Busca repetindo uma query unica:

```bash
npm run benchmark:load -- \
  --base-url=https://unicocontato.tech/banco-unico \
  --scenario=search \
  --query="dipirona 500mg generico" \
  --stages=1x30,3x30,5x30
```

Salvar o resumo em JSON:

```bash
npm run benchmark:load -- \
  --base-url=https://unicocontato.tech/banco-unico \
  --scenario=search \
  --stages=1x30,5x30,10x30 \
  --output=resultados/load-test.search.json
```

### Filtros uteis no cenario search

Rodar so uma categoria:

```bash
npm run benchmark:load -- \
  --base-url=https://unicocontato.tech/banco-unico \
  --scenario=search \
  --category=typo \
  --stages=1x30,5x30
```

Usar apenas os primeiros casos:

```bash
npm run benchmark:load -- \
  --base-url=https://unicocontato.tech/banco-unico \
  --scenario=search \
  --limit-cases=10 \
  --stages=1x30,5x30
```

### Como interpretar

Observe principalmente:

- `req/s`: vazao sustentada.
- `p95` e `p99`: latencias de cauda, que mostram quando o sistema comeca a sofrer.
- `timeouts`: indicam saturacao ou dependencia externa lenta.
- `status HTTP`: ajudam a ver se o gargalo esta virando `500`, `502`, `504` ou outro erro.

Na pratica, o ponto seguro de operacao costuma ser o ultimo stage em que:

- a taxa de sucesso continua alta;
- o `p95` ainda esta aceitavel;
- os `timeouts` permanecem zerados ou raros;
- a vazao nao para de crescer de forma abrupta.

Se a partir de um stage o `req/s` quase nao sobe, mas o `p95/p99` e os erros disparam, voce achou o ponto de saturacao.

## Desenvolvimento no Mac

### 1. Criar `.env`

```bash
cp .env.example .env
```

Exemplo:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=banco_unico
DB_USER=postgres
DB_PASSWORD=postgres
DATABASE_SSL=false
OPENAI_API_KEY=<sua-chave-aqui>
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_PRODUCT_RELEVANCE_MODEL=gpt-4o-mini
POSTGRES_DB=banco_unico
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
VECTOR_DIMENSIONS=512
DEFAULT_SEARCH_LIMIT=10
MAX_SEARCH_LIMIT=50
MAX_TOKENS_PER_PRODUCT=256
UPSERT_BATCH_SIZE=1000
MAX_RETURNED_PRODUCTS=100
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Subir so o banco em Docker

```bash
npm run dev:db:up
```

### 4. Rodar a API em modo watch

```bash
npm run dev
```

### 5. Testar

```bash
curl http://localhost:3000/health
```

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "products": [
      {
        "descricaoProduto": "Dipirona Sodica 500mg Comprimido",
        "principioAtivo": "Dipirona Sodica",
        "classificacao": "GENERICO",
        "nomeSocial": "Dipirona",
        "fabricante": "Farmaceutica Exemplo",
        "ean": "7891234567890"
      }
    ]
  }'
```

```bash
curl -X POST http://localhost:3000/api/products/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "dipirona sodica 500mg",
    "limit": 5
  }'
```

### 6. Rodar testes unitarios e cobertura

```bash
npm test
```

```bash
npm run test:coverage
```

O segundo comando usa o test runner nativo do Node e imprime o resumo de cobertura no terminal.

## Servidor Linux com Docker

### 1. Instalar Docker

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

### 2. Clonar o projeto

```bash
git clone <url-do-repositorio> banco_unico
cd banco_unico
```

### 3. Criar `.env`

```bash
cp .env.example .env
```

Exemplo minimo:

```env
PORT=3000
POSTGRES_DB=banco_unico
POSTGRES_USER=postgres
POSTGRES_PASSWORD=troque-esta-senha
OPENAI_API_KEY=<sua-chave-aqui>
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_PRODUCT_RELEVANCE_MODEL=gpt-4o-mini
VECTOR_DIMENSIONS=512
DEFAULT_SEARCH_LIMIT=10
MAX_SEARCH_LIMIT=50
MAX_TOKENS_PER_PRODUCT=256
UPSERT_BATCH_SIZE=1000
MAX_RETURNED_PRODUCTS=100
```

### 4. Subir a stack

```bash
docker compose up -d --build
```

### 5. Validar

```bash
docker compose ps
curl http://localhost:3000/health
```

## Backup, export e restore

Arquivos gerados em `./backups`.

### Backup binario

```bash
./scripts/backup-db.sh
```

### Export SQL

```bash
./scripts/export-db.sh
```

### Restore

```bash
./scripts/restore-db.sh backups/arquivo.dump
./scripts/restore-db.sh backups/arquivo.sql
```

## Observacoes

- Essa estrutura ja suporta importacao em lote por batches.
- Para a carga inicial de 200 mil itens, prefira enviar em lotes pela API em vez de um unico payload gigante.
- `detalhes` ficou como campo opcional para a fase 2.
# banco-unico
