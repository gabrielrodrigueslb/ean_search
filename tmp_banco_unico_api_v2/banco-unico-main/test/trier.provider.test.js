const test = require("node:test");
const assert = require("node:assert/strict");

const { loadModule } = require("./helpers/load-module");

function createBaseEnv() {
  return {
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/banco_unico",
    DATABASE_SSL: "false",
    OPENAI_API_KEY: "test-key",
    OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
    VECTOR_DIMENSIONS: "512",
    DEFAULT_SEARCH_LIMIT: "10",
    MAX_SEARCH_LIMIT: "50",
    DEFAULT_INCLUDE_RELEVANCE_SCORE: "false",
    MAX_TOKENS_PER_PRODUCT: "256",
    UPSERT_BATCH_SIZE: "1000",
    MAX_RETURNED_PRODUCTS: "100",
    INTEGRATION_REQUEST_TIMEOUT_MS: "15000",
  };
}

test("TrierClientProvider ignora EAN com 404 e continua a busca", async (t) => {
  const previousFetch = global.fetch;
  const requestedUrls = [];

  t.after(() => {
    global.fetch = previousFetch;
  });

  global.fetch = async (url) => {
    const requestedUrl = String(url);
    requestedUrls.push(requestedUrl);

    if (requestedUrl.includes("codigoBarras=7891111111111")) {
      return {
        ok: false,
        status: 404,
        async text() {
          return JSON.stringify({
            message: "Produto não encontrado",
          });
        },
      };
    }

    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify([
          {
            codigo: 38647,
            nome: "DIPIRONA 500MG 30CP",
            valorVenda: 27.77,
            quantidadeEstoque: 3,
            codigoBarras: 7899547531213,
            nomeGrupo: "GENERICOS",
          },
        ]);
      },
    };
  };

  const { TrierClientProvider } = loadModule(
    t,
    "src/modules/client-search/providers/trier/trier.provider.js",
    {
      env: createBaseEnv(),
    },
  );

  const provider = new TrierClientProvider();
  const results = await provider.searchByEans(
    ["7891111111111", "7899547531213"],
    {
      trierToken: "token-trier",
      cdfilial: 1,
    },
  );

  assert.equal(results.length, 1);
  assert.equal(String(results[0].ean), "7899547531213");
  assert.equal(results[0].descricao, "DIPIRONA 500MG 30CP");
  assert.ok(requestedUrls.every((url) => url.includes("/sgfpod1/rest/integracao/produto/obter-v1")));
});
