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

test("Alpha7ClientProvider envia eans no body e autentica pelo header configurado", async (t) => {
  const previousFetch = global.fetch;
  let receivedUrl = null;
  let receivedOptions = null;

  t.after(() => {
    global.fetch = previousFetch;
  });

  global.fetch = async (url, options) => {
    receivedUrl = String(url);
    receivedOptions = options;

    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          status: "ok",
          produtos: [
            {
              ean: "7506306241183",
              valorVenda: 13.49,
              melhorDesconto: 12.99,
              estoque: 220,
            },
          ],
        });
      },
    };
  };

  const { Alpha7ClientProvider } = loadModule(
    t,
    "src/modules/client-search/providers/alpha7/alpha7.provider.js",
    {
      env: createBaseEnv(),
    },
  );

  const provider = new Alpha7ClientProvider();
  const results = await provider.searchByEans(
    ["7506306241183", "7506306241183"],
    {
      alpha7Authenticate: "abc123",
      alpha7BaseUrl: "https://alpha7.exemplo.com",
    },
  );

  assert.equal(receivedUrl, "https://alpha7.exemplo.com/api/consultar-eans");
  assert.equal(receivedOptions.method, "POST");
  assert.equal(receivedOptions.headers["Content-Type"], "application/json");
  assert.equal(receivedOptions.headers["x-api-key"], "abc123");
  assert.deepEqual(JSON.parse(receivedOptions.body), {
    eans: ["7506306241183"],
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].ean, "7506306241183");
  assert.equal(results[0].preco, 13.49);
  assert.equal(results[0].precoPromocional, 12.99);
  assert.equal(results[0].estoque, 220);
});
