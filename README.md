# EAN Search MVP

MVP enxuto para **subida de itens**, **enriquecimento** e **publicacao dos produtos validados em API externa**.

Este projeto ficou propositalmente pequeno. Ele nao faz mais busca, revisao, IA ou integracao direta com ERP. A ideia agora e bem objetiva:

- receber itens por `CSV` ou `JSON`;
- validar o EAN;
- enriquecer com `FarmaIndex` quando houver match por EAN;
- publicar os produtos 100% validados na API Banco Unico;
- registrar o lote de importacao e o status de cada item;
- manter logs simples no terminal.

## O que ficou no projeto

- `POST /imports/csv`
- `POST /imports/json`
- `POST /imports/trier`
- `POST /imports/vetor`
- `GET /imports/:id`
- scripts locais para subir arquivo sem depender de HTTP

## O que saiu do caminho

- busca de produtos
- fila de revisao
- IA
- importador Trier

Essas partes podem viver em outro microservico sem baguncar este MVP.

O `FarmaIndex`, por outro lado, foi mantido no core do fluxo.

## Estrutura atual

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

scripts/
  import-csv.js
  import-json.js
  publish-banco-unico.js

prisma/
  schema.prisma
```

## Banco

O SQLite local agora fica apenas com o controle operacional:

- `importacoes`
- `itens_importacao`
- `produtos_aprovacao`

### Regras principais

- apenas produtos com nome 100% validado sao publicados
- se o `FarmaIndex` encontrar o item, os metadados estruturados passam a prevalecer
- o nome do catalogo so pode vir de `PT.ProductSearch` ou `FarmaIndex`
- quando necessario, o sistema pode usar fallback em browser real com `Playwright`, tentando `PT.ProductSearch` primeiro e `BarcodeLookup` depois
- nomes vindos da Trier ficam apenas como referencia operacional e nunca entram no cadastro final
- a API Banco Unico faz `upsert` por `EAN`
- se nem `PT.ProductSearch` nem `FarmaIndex` resolverem o nome, o item vai para `produtos_aprovacao`
- itens pendentes de aprovacao continuam no SQLite para fluxo humano

## Enriquecimento com PT + FarmaIndex

Durante a importacao, cada item com EAN valido tenta consultar:

1. `PT.ProductSearch`
2. `https://farmaindex.com/busca?q=<ean>`
3. a pagina de detalhe do medicamento retornado
4. `BarcodeLookup` por HTTP quando PT/FarmaIndex nao resolverem
5. fallback com `Playwright`, tentando `PT.ProductSearch` no browser e depois `BarcodeLookup`

Regra atual:

- para **medicamento**:
  - o nome comercial pode vir do `PT.ProductSearch`
  - os metadados estruturados vem do `FarmaIndex`
- para **perfumaria**:
  - o nome vem do `PT.ProductSearch`
  - se o `FarmaIndex` nao encontrar, o item segue com os dados disponiveis

Se nenhum dos dois resolver o nome:

- o item **nao** cria produto no catalogo
- o item vai para a tabela `produtos_aprovacao`
- o nome bruto vindo da Trier fica so como sugestao para revisao humana

Se o fallback de browser estiver disponivel:

- ele tenta `PT.ProductSearch` em browser real
- se o PT ainda falhar, tenta `BarcodeLookup` em browser real
- se mesmo assim nao resolver, o item segue para aprovacao

Quando o `FarmaIndex` encontra, o pipeline passa a usar no upsert:

- `produto`
- `apresentacao`
- `laboratorio`
- `classe/categoria`
- `registro MS`
- `tarja`
- `forma farmaceutica`
- `via de administracao`
- `farmacos`

Se o FarmaIndex nao encontrar o EAN, o item continua sendo importado com os dados recebidos do arquivo.

## Como subir

### 1. `.env`

Exemplo:

```env
DATABASE_URL="file:C:/Users/Gabriel/Documents/dev/ean_search/prisma/dev.db"
PORT=3000
REQUEST_TIMEOUT_MS=10000
IMPORT_QUEUE_CONCURRENCY=1
PT_PRODUCT_SEARCH_MAX_REQUESTS_PER_MINUTE=45
BROWSER_FALLBACK_TIMEOUT_MS=45000
BROWSER_FALLBACK_HEADLESS=true
```

### 2. gerar o client do Prisma

```powershell
npx prisma generate
```

### 3. rodar o backend

```powershell
npm run dev
```

## Endpoints

### `GET /health`

```json
{
  "status": "ok"
}
```

### `POST /imports/json`

```json
{
  "productApi": {
    "baseUrl": "https://unicocontato.tech/banco-unico",
    "authorization": "Bearer SEU_TOKEN_OPCIONAL"
  },
  "items": [
    {
      "ean": "7891058017507",
      "nome": "Dorflex Com 36 Comprimidos",
      "tipo": "medicamento",
      "categoria": "analgesico",
      "descricao": "36 comprimidos",
      "forma_farmaceutica": "comprimido",
      "quantidade": "36"
    }
  ]
}
```

Resposta:

```json
{
  "id": 1,
  "importacao_id": 1,
  "fonte": "json",
  "status": "pending",
  "total_itens": 1
}
```

### `POST /imports/csv`

Enviar `multipart/form-data` com o arquivo no campo `file`.
Se quiser enviar configuracao da API externa junto, use o campo textual `productApi` com JSON.

CSV exemplo:

```csv
ean,nome,tipo,categoria,descricao,forma_farmaceutica,quantidade
7891058017507,Dorflex Com 36 Comprimidos,medicamento,analgesico,36 comprimidos,comprimido,36
7891058003975,Dorflex Max 16 Comprimidos,medicamento,analgesico,16 comprimidos,comprimido,16
```

### `GET /imports/:id`

Retorna o resumo da importacao e os itens processados.

### `POST /imports/trier`

Importa produtos diretamente da Trier em paginas de ate `999` itens por chamada.

Para **carga completa**, basta enviar:

```json
{
  "baseUrl": "https://homologacao.triersistemas.com.br/sgfpod1/",
  "bearerToken": "seu_token",
  "productApi": {
    "baseUrl": "https://unicocontato.tech/banco-unico",
    "authorization": "Bearer SEU_TOKEN_OPCIONAL"
  }
}
```

Nesse caso, o backend:

- inicia em `primeiroRegistro = 0`
- usa `quantidadeRegistros = 999`
- chama automaticamente `obter-todos-v1`
- continua paginando ate a Trier nao retornar mais itens

Se voce enviar filtros como `ean`, `codigo`, `nomeProduto`, `ativo` ou `integracaoEcommerce`, o backend muda para `obter-v1`.

### `POST /imports/vetor`

Importa produtos diretamente da API da Vetor/Zetti em paginas de ate `500` itens por chamada.

Para carga completa:

```json
{
  "apiKey": "seu_token",
  "productApi": {
    "baseUrl": "https://unicocontato.tech/banco-unico",
    "authorization": "Bearer SEU_TOKEN_OPCIONAL"
  }
}
```

Defaults usados pelo backend para evitar consultas pesadas demais:

- `$top = 100`
- `$count = false`
- `$select` reduzido aos campos necessarios para importacao

Para carga filtrada:

```json
{
  "apiKey": "seu_token",
  "filter": "inativo eq false and qtdEstoque gt 0",
  "orderby": "descricao asc"
}
```

Campos aceitos:

- `baseUrl` opcional, default `https://integracao.zetti.dev`
- `apiKey` obrigatorio
- `filter` para `$filter`
- `select` para `$select`
- `orderby` para `$orderby`
- `top` para `$top` com maximo de `500`
- `skip` para `$skip`
- `count` para `$count`

## Scripts locais

### Importar CSV direto

```powershell
npm run import:csv -- .\seu-arquivo.csv
```

### Importar JSON direto

```powershell
npm run import:json -- .\seu-arquivo.json
```

### Publicar produtos ja validados para a Banco Unico API

Esse script le um banco SQLite de origem com a tabela `catalog_items` e publica
os produtos elegiveis diretamente na API.

Por padrao, ele envia apenas itens completos:

- `descricaoProduto`
- `ean`
- `principioAtivo`
- `classificacao`
- `nomeSocial`
- `fabricante`
- `detalhes`

E tambem descarta classificacao `NAO DEFINIDO`.

Exemplo:

```powershell
npm run publish:banco-unico -- .\prisma\backups\dev-20260505-110801-before-api-publish-flow.db
```

Exemplo com lote controlado:

```powershell
npm run publish:banco-unico -- .\prisma\backups\dev-20260505-110801-before-api-publish-flow.db --limit=50 --batch-size=10
```

Exemplo sem publicar de fato:

```powershell
npm run publish:banco-unico -- .\prisma\backups\dev-20260505-110801-before-api-publish-flow.db --dry-run
```

Opcoes suportadas:

- `--limit=N`
- `--offset=N`
- `--batch-size=N`
- `--base-url=URL`
- `--authorization=VALOR`
- `--include-incomplete`
- `--dry-run`

O JSON pode ser:

```json
[
  {
    "ean": "7891058017507",
    "nome": "Dorflex Com 36 Comprimidos"
  }
]
```

ou:

```json
{
  "items": [
    {
      "ean": "7891058017507",
      "nome": "Dorflex Com 36 Comprimidos"
    }
  ]
}
```

## Rate limit do PT.ProductSearch

Mesmo esse MVP nao dependendo da busca do PT para o fluxo principal, o client foi mantido de forma isolada e agora respeita fila/rate limit local para nao passar de `45` req/min por padrao.

Configuracao:

```env
PT_PRODUCT_SEARCH_MAX_REQUESTS_PER_MINUTE=45
```

Isso foi feito exatamente para evitar o bloqueio de `50 req/min` que voce comentou.

## Banco Unico API

Pelo contrato atual da documentacao:

- base URL padrao: `https://unicocontato.tech/banco-unico`
- health: `GET /health`
- cadastro: `POST /api/products`
- chave natural: `ean`
- comportamento: `upsert`

Campos enviados pelo pipeline para cada produto validado:

- `descricaoProduto`
- `ean`
- `principioAtivo`
- `classificacao`
- `nomeSocial`
- `fabricante`
- `detalhes`

## Testes

```powershell
npm test
```

Hoje o foco dos testes e pequeno e pragmatico:

- validacao de EAN
- endpoints basicos de importacao

## Observacao importante

Eu deixei de fora os diretórios e arquivos paralelos que parecem ser material de apoio seu, para nao apagar nada util por acidente. O `src/` principal, por outro lado, ficou reduzido ao que esse MVP realmente precisa.
