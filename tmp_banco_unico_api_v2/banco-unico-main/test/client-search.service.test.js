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

test("searchProductsForClientProvider usa Vetor quando vetorToken e enviado no body", async (t) => {
  let receivedEans = null;
  let receivedOptions = null;

  const { searchProductsForClientProvider } = loadModule(t, "src/modules/client-search/client-search.service.js", {
    env: createBaseEnv(),
    mocks: {
      "../products/products.service": {
        searchProducts: async () => ({
          query: "dipirona",
          normalizedQuery: "dipirona",
          queryTokens: ["dipirona"],
          returned: 2,
          hasMore: false,
          results: [
            {
              id: "bu-1",
              ean: "7891234567890",
              descricaoProduto: "Dipirona 1g",
              principioAtivo: "Dipirona",
              similarity: 0.91,
              tokenOverlap: 3,
              exactEanMatch: false,
            },
            {
              id: "bu-2",
              ean: "7891234567890",
              descricaoProduto: "Dipirona duplicada",
              principioAtivo: "Dipirona",
              similarity: 0.80,
              tokenOverlap: 2,
              exactEanMatch: false,
            },
          ],
        }),
      },
      "./client-provider-registry": {
        getClientSearchProvider: () => ({
          key: "vetor",
          displayName: "Vetor",
          minAvailableStock: 2,
          parseRequest: () => ({
            clientSearchOptions: {
              vetorToken: "token-vetor",
              cdfilial: 2,
            },
            requestContext: {
              cdfilial: 2,
            },
          }),
          clientProductProvider: {
            searchByEans: async (eans, options) => {
              receivedEans = eans;
              receivedOptions = options;

              return [
                {
                  id: "erp-1",
                  codigo: 123,
                  ean: "7891234567890",
                  descricao: "Dipirona local",
                  tipoClassificacao: "GENERICO",
                  classificacaoOrigem: "GENERICOS",
                  estoque: 3,
                  preco: 24.98,
                },
              ];
            },
          },
        }),
        listClientSearchProviders: () => [],
      },
    },
  });

  const result = await searchProductsForClientProvider({
    query: "dipirona",
    vetorToken: "token-vetor",
    cdfilial: 2,
  }, {
    providerKey: "vetor",
  });

  assert.deepEqual(receivedEans, ["7891234567890"]);
  assert.equal(receivedOptions.vetorToken, "token-vetor");
  assert.equal(receivedOptions.cdfilial, 2);
  assert.equal(result.found, true);
  assert.equal(result.total, 1);
  assert.equal(result.products[0].codigo_barras, "7891234567890");
  assert.equal(result.products[0].descricao, "Dipirona 1g");
  assert.equal(result.products[0].provider, "vetor");
});

test("searchProductsForClientProvider usa Trier quando trierToken e enviado no body", async (t) => {
  let receivedEans = null;
  let receivedOptions = null;

  const { searchProductsForClientProvider } = loadModule(t, "src/modules/client-search/client-search.service.js", {
    env: createBaseEnv(),
    mocks: {
      "../products/products.service": {
        searchProducts: async () => ({
          query: "dipirona",
          normalizedQuery: "dipirona",
          queryTokens: ["dipirona"],
          returned: 1,
          hasMore: false,
          results: [
            {
              id: "bu-1",
              ean: "7899547531213",
              descricaoProduto: "Dipirona Monoidratada",
              principioAtivo: "Dipirona",
              similarity: 0.93,
              tokenOverlap: 3,
              exactEanMatch: false,
            },
          ],
        }),
      },
      "./client-provider-registry": {
        getClientSearchProvider: () => ({
          key: "trier",
          displayName: "Trier",
          parseRequest: () => ({
            clientSearchOptions: {
              trierToken: "token-trier",
              cdfilial: 1,
            },
            requestContext: {
              cdfilial: 1,
            },
          }),
          clientProductProvider: {
            searchByEans: async (eans, options) => {
              receivedEans = eans;
              receivedOptions = options;

              return [
                {
                  id: "erp-trier-1",
                  codigo: 456,
                  ean: "7899547531213",
                  descricao: "Dipirona Trier",
                  tipoClassificacao: "ANALGESICO",
                  classificacaoOrigem: "MEDICAMENTOS",
                  estoque: 1,
                  preco: 14.99,
                },
              ];
            },
          },
        }),
        listClientSearchProviders: () => [],
      },
    },
  });

  const result = await searchProductsForClientProvider({
    query: "dipirona",
    trierToken: "token-trier",
    cdfilial: 1,
  });

  assert.deepEqual(receivedEans, ["7899547531213"]);
  assert.equal(receivedOptions.trierToken, "token-trier");
  assert.equal(receivedOptions.cdfilial, 1);
  assert.equal(result.found, true);
  assert.equal(result.total, 1);
  assert.equal(result.products[0].codigo_barras, "7899547531213");
  assert.equal(result.products[0].provider, "trier");
});

test("searchProductsForClientProvider usa Alpha7 quando alpha7Authenticate e enviado no body", async (t) => {
  let receivedEans = null;
  let receivedOptions = null;

  const { searchProductsForClientProvider } = loadModule(t, "src/modules/client-search/client-search.service.js", {
    env: createBaseEnv(),
    mocks: {
      "../products/products.service": {
        searchProducts: async () => ({
          query: "dipirona",
          normalizedQuery: "dipirona",
          queryTokens: ["dipirona"],
          returned: 1,
          hasMore: false,
          results: [
            {
              id: "bu-1",
              ean: "7506306241183",
              descricaoProduto: "Dipirona Teste",
              principioAtivo: "Dipirona",
              similarity: 0.88,
              tokenOverlap: 3,
              exactEanMatch: false,
            },
          ],
        }),
      },
      "./client-provider-registry": {
        getClientSearchProvider: () => ({
          key: "alpha7",
          displayName: "Alpha7",
          parseRequest: () => ({
            clientSearchOptions: {
              alpha7Authenticate: "auth-alpha7",
              alpha7BaseUrl: "https://alpha7.exemplo.com",
            },
            requestContext: {},
          }),
          clientProductProvider: {
            searchByEans: async (eans, options) => {
              receivedEans = eans;
              receivedOptions = options;

              return [
                {
                  id: "7506306241183",
                  ean: "7506306241183",
                  estoque: 220,
                  preco: 13.49,
                  precoPromocional: 12.99,
                },
              ];
            },
          },
        }),
        listClientSearchProviders: () => [],
      },
    },
  });

  const result = await searchProductsForClientProvider({
    query: "dipirona",
    alpha7Authenticate: "auth-alpha7",
    alpha7BaseUrl: "https://alpha7.exemplo.com",
  });

  assert.deepEqual(receivedEans, ["7506306241183"]);
  assert.equal(receivedOptions.alpha7Authenticate, "auth-alpha7");
  assert.equal(receivedOptions.alpha7BaseUrl, "https://alpha7.exemplo.com");
  assert.equal(result.found, true);
  assert.equal(result.total, 1);
  assert.equal(result.products[0].provider, "alpha7");
  assert.equal(result.products[0].codigo_barras, "7506306241183");
});

test("searchProductsForClientProvider retorna 404 funcional quando nao ha match no provider", async (t) => {
  const { searchProductsForClientProvider } = loadModule(t, "src/modules/client-search/client-search.service.js", {
    env: createBaseEnv(),
    mocks: {
      "../products/products.service": {
        searchProducts: async () => ({
          query: "dipirona",
          returned: 1,
          hasMore: false,
          results: [
            {
              id: "bu-1",
              ean: "7891234567890",
              descricaoProduto: "Dipirona 1g",
              similarity: 0.91,
              tokenOverlap: 3,
              exactEanMatch: false,
            },
          ],
        }),
      },
      "./client-provider-registry": {
        getClientSearchProvider: () => ({
          key: "vetor",
          displayName: "Vetor",
          minAvailableStock: 2,
          parseRequest: () => ({
            clientSearchOptions: {
              vetorToken: "token-vetor",
              cdfilial: 2,
            },
            requestContext: {
              cdfilial: 2,
            },
          }),
          clientProductProvider: {
            searchByEans: async () => [],
          },
        }),
        listClientSearchProviders: () => [],
      },
    },
  });

  const result = await searchProductsForClientProvider({
    query: "dipirona",
    vetorToken: "token-vetor",
    cdfilial: 2,
  }, {
    providerKey: "vetor",
  });

  assert.equal(result.found, false);
  assert.equal(result.total, 0);
  assert.equal(result.message, "Nenhum produto encontrado no provider Vetor.");
});
