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

test("searchProductsWithIntegrations devolve apenas base quando nenhuma integracao e enviada", async (t) => {
  const { searchProductsWithIntegrations } = loadModule(t, "src/modules/product-search/product-search-orchestrator.service.js", {
    env: createBaseEnv(),
    mocks: {
      "../products/products.service": {
        searchProducts: async () => ({
          query: "dipirona",
          results: [
            {
              ean: "7891234567890",
            },
          ],
        }),
      },
    },
  });

  const result = await searchProductsWithIntegrations({
    query: "dipirona",
  });

  assert.deepEqual(result, {
    query: "dipirona",
    results: [
      {
        ean: "7891234567890",
      },
    ],
    matchedEans: ["7891234567890"],
    integrations: [],
  });
});

test("searchProductsWithIntegrations chama provider generic-json com apiKeyHeader", async (t) => {
  let receivedUrl = null;
  let receivedOptions = null;

  const { searchProductsWithIntegrations } = loadModule(t, "src/modules/product-search/product-search-orchestrator.service.js", {
    env: createBaseEnv(),
    mocks: {
      "../products/products.service": {
        searchProducts: async () => ({
          query: "dipirona",
          results: [
            {
              ean: "7891234567890",
              descricaoProduto: "Dipirona",
            },
            {
              ean: "7891234567891",
              descricaoProduto: "Dipirona gotas",
            },
          ],
        }),
      },
    },
  });

  const result = await searchProductsWithIntegrations({
    query: "dipirona",
    integrations: [
      {
        id: "erp-principal",
        provider: "generic-json",
        auth: {
          type: "apiKeyHeader",
          headerName: "x-api-key",
          value: "secret-123",
        },
        request: {
          url: "https://erp.exemplo.com/api/catalog/search",
          method: "POST",
          eanField: "codigosBarras",
          extraBody: {
            filial: "001",
          },
          includeQuery: true,
        },
      },
    ],
  }, {
    fetchImpl: async (url, options) => {
      receivedUrl = url;
      receivedOptions = options;

      return {
        ok: true,
        status: 200,
        headers: {
          get(name) {
            return name === "content-type" ? "application/json" : null;
          },
        },
        async text() {
          return JSON.stringify({
            found: true,
          });
        },
      };
    },
  });

  assert.equal(receivedUrl, "https://erp.exemplo.com/api/catalog/search");
  assert.equal(receivedOptions.method, "POST");
  assert.equal(receivedOptions.headers["x-api-key"], "secret-123");
  assert.equal(receivedOptions.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(receivedOptions.body), {
    filial: "001",
    codigosBarras: ["7891234567890", "7891234567891"],
    query: "dipirona",
  });
  assert.deepEqual(result.integrations, [
    {
      id: "erp-principal",
      provider: "generic-json",
      ok: true,
      status: "success",
      request: {
        method: "POST",
        url: "https://erp.exemplo.com/api/catalog/search",
        authType: "apiKeyHeader",
        timeoutMs: 15000,
        eanCount: 2,
      },
      response: {
        statusCode: 200,
        data: {
          found: true,
        },
      },
    },
  ]);
});

test("searchProductsWithIntegrations monta query string no provider generic-query", async (t) => {
  let receivedUrl = null;

  const { searchProductsWithIntegrations } = loadModule(t, "src/modules/product-search/product-search-orchestrator.service.js", {
    env: createBaseEnv(),
    mocks: {
      "../products/products.service": {
        searchProducts: async () => ({
          query: "vitamina c",
          results: [
            {
              ean: "7891111111111",
            },
            {
              ean: "7892222222222",
            },
          ],
        }),
      },
    },
  });

  const result = await searchProductsWithIntegrations({
    query: "vitamina c",
    integrations: [
      {
        provider: "generic-query",
        auth: {
          type: "bearer",
          token: "jwt-token",
        },
        request: {
          url: "https://shop.exemplo.com/api/stock",
          eanParam: "ean",
          arrayFormat: "repeat",
          query: {
            tenant: "loja-1",
          },
          includeQuery: true,
        },
      },
    ],
  }, {
    fetchImpl: async (url, options) => {
      receivedUrl = url;

      return {
        ok: true,
        status: 200,
        headers: {
          get() {
            return "application/json";
          },
        },
        async text() {
          assert.equal(options.headers.Authorization, "Bearer jwt-token");
          return JSON.stringify({
            stock: [],
          });
        },
      };
    },
  });

  assert.match(receivedUrl, /^https:\/\/shop\.exemplo\.com\/api\/stock\?/);
  assert.match(receivedUrl, /tenant=loja-1/);
  assert.match(receivedUrl, /ean=7891111111111/);
  assert.match(receivedUrl, /ean=7892222222222/);
  assert.match(receivedUrl, /query=vitamina\+c|query=vitamina%20c/);
  assert.equal(result.integrations[0].id, "generic-query-1");
});

test("searchProductsWithIntegrations retorna erro estruturado quando a integracao responde 500", async (t) => {
  const { searchProductsWithIntegrations } = loadModule(t, "src/modules/product-search/product-search-orchestrator.service.js", {
    env: createBaseEnv(),
    mocks: {
      "../products/products.service": {
        searchProducts: async () => ({
          query: "dipirona",
          results: [
            {
              ean: "7891234567890",
            },
          ],
        }),
      },
    },
  });

  const result = await searchProductsWithIntegrations({
    query: "dipirona",
    integrations: [
      {
        provider: "generic-json",
        request: {
          url: "https://erp.exemplo.com/api/catalog/search",
        },
      },
    ],
  }, {
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      headers: {
        get() {
          return "application/json";
        },
      },
      async text() {
        return JSON.stringify({
          error: "falha no ERP",
        });
      },
    }),
  });

  assert.deepEqual(result.integrations, [
    {
      id: "generic-json-1",
      provider: "generic-json",
      ok: false,
      status: "error",
      request: {
        method: "POST",
        url: "https://erp.exemplo.com/api/catalog/search",
        authType: "none",
        timeoutMs: 15000,
        eanCount: 1,
      },
      response: {
        statusCode: 500,
        data: {
          error: "falha no ERP",
        },
      },
      error: {
        code: "INTEGRATION_HTTP_ERROR",
        message: "A integracao generic-json-1 respondeu com status 500.",
      },
    },
  ]);
});

test("searchProductsWithIntegrations rejeita provider desconhecido", async (t) => {
  const { searchProductsWithIntegrations } = loadModule(t, "src/modules/product-search/product-search-orchestrator.service.js", {
    env: createBaseEnv(),
    mocks: {
      "../products/products.service": {
        searchProducts: async () => ({
          query: "dipirona",
          results: [],
        }),
      },
    },
  });

  await assert.rejects(() => searchProductsWithIntegrations({
    query: "dipirona",
    integrations: [
      {
        provider: "erp-nao-existe",
        request: {
          url: "https://erp.exemplo.com/api/catalog/search",
        },
      },
    ],
  }), /Provider de integracao nao suportado/);
});

test("getSearchIntegrationContracts expõe auth types e providers suportados", (t) => {
  const { getSearchIntegrationContracts } = loadModule(t, "src/modules/product-search/product-search-orchestrator.service.js", {
    env: createBaseEnv(),
    mocks: {
      "../products/products.service": {
        searchProducts: async () => ({
          query: "dipirona",
          results: [],
        }),
      },
    },
  });

  const contracts = getSearchIntegrationContracts();

  assert.ok(Array.isArray(contracts.authTypes));
  assert.ok(Array.isArray(contracts.providers));
  assert.ok(contracts.authTypes.some((item) => item.type === "bearer"));
  assert.ok(contracts.providers.some((item) => item.provider === "generic-json"));
  assert.ok(contracts.providers.some((item) => item.provider === "generic-query"));
});
