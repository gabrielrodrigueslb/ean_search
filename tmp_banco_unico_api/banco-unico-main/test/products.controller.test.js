const test = require("node:test");
const assert = require("node:assert/strict");

const { loadModule } = require("./helpers/load-module");

test("createProducts chama saveProducts e responde 201", async (t) => {
  const { createProducts } = loadModule(t, "src/controllers/products.controller.js", {
    mocks: {
      "../config": {
        config: {
          defaultIncludeRelevanceScore: false,
        },
      },
      "../modules/products/products.service": {
        saveProducts: async () => ({
          processed: 1,
        }),
        searchProducts: async () => ({
          results: [],
        }),
      },
      "../modules/client-search/client-search.service": {
        listClientSearchProviders: () => [],
        searchProductsForClientProvider: async () => ({
          results: [],
        }),
      },
      "../modules/product-search/product-search-orchestrator.service": {
        getSearchIntegrationContracts: () => ({
          providers: [],
        }),
        searchProductsWithIntegrations: async () => ({
          results: [],
        }),
      },
    },
  });

  const response = {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await createProducts({
    body: {
      products: [],
    },
  }, response);

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.payload, {
    processed: 1,
  });
});

test("searchRegisteredProducts nao inclui relevancia por padrao", async (t) => {
  let receivedParams = null;

  const { searchRegisteredProducts } = loadModule(t, "src/controllers/products.controller.js", {
    mocks: {
      "../config": {
        config: {
          defaultIncludeRelevanceScore: false,
        },
      },
      "../modules/products/products.service": {
        saveProducts: async () => ({
          processed: 1,
        }),
        searchProducts: async () => ({
          results: [],
        }),
      },
      "../modules/client-search/client-search.service": {
        listClientSearchProviders: () => [],
        searchProductsForClientProvider: async () => ({
          results: [],
        }),
      },
      "../modules/product-search/product-search-orchestrator.service": {
        getSearchIntegrationContracts: () => ({
          providers: [],
        }),
        searchProductsWithIntegrations: async (params) => {
          receivedParams = params;
          return {
            results: ["produto"],
          };
        },
      },
    },
  });

  const response = {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await searchRegisteredProducts({
    body: {
      query: "dipirona",
    },
  }, response);

  assert.deepEqual(response.payload, {
    results: ["produto"],
  });
  assert.equal(receivedParams.includeRelevanceScore, false);
});

test("searchRegisteredProducts permite forcar relevancia por request", async (t) => {
  let receivedParams = null;

  const { searchRegisteredProducts } = loadModule(t, "src/controllers/products.controller.js", {
    mocks: {
      "../config": {
        config: {
          defaultIncludeRelevanceScore: false,
        },
      },
      "../modules/products/products.service": {
        saveProducts: async () => ({
          processed: 1,
        }),
        searchProducts: async () => ({
          results: [],
        }),
      },
      "../modules/client-search/client-search.service": {
        listClientSearchProviders: () => [],
        searchProductsForClientProvider: async () => ({
          results: [],
        }),
      },
      "../modules/product-search/product-search-orchestrator.service": {
        getSearchIntegrationContracts: () => ({
          providers: [],
        }),
        searchProductsWithIntegrations: async (params) => {
          receivedParams = params;
          return {
            results: ["produto"],
          };
        },
      },
    },
  });

  const response = {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await searchRegisteredProducts({
    body: {
      query: "dipirona",
      includeRelevanceScore: true,
    },
  }, response);

  assert.deepEqual(response.payload, {
    results: ["produto"],
  });
  assert.equal(receivedParams.includeRelevanceScore, true);
});

test("searchRegisteredProductsBase usa a busca base do banco_unico", async (t) => {
  let receivedParams = null;

  const { searchRegisteredProductsBase } = loadModule(t, "src/controllers/products.controller.js", {
    mocks: {
      "../config": {
        config: {
          defaultIncludeRelevanceScore: false,
        },
      },
      "../modules/products/products.service": {
        saveProducts: async () => ({
          processed: 1,
        }),
        searchProducts: async (params) => {
          receivedParams = params;
          return {
            results: ["base"],
          };
        },
      },
      "../modules/client-search/client-search.service": {
        listClientSearchProviders: () => [],
        searchProductsForClientProvider: async () => ({
          results: [],
        }),
      },
      "../modules/product-search/product-search-orchestrator.service": {
        getSearchIntegrationContracts: () => ({
          providers: [],
        }),
        searchProductsWithIntegrations: async () => ({
          results: ["orchestrated"],
        }),
      },
    },
  });

  const response = {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await searchRegisteredProductsBase({
    body: {
      query: "dipirona",
    },
  }, response);

  assert.deepEqual(response.payload, {
    results: ["base"],
  });
  assert.equal(receivedParams.includeRelevanceScore, false);
});

test("searchRegisteredProductsByEans encaminha o payload para o service", async (t) => {
  let receivedPayload = null;

  const { searchRegisteredProductsByEans } = loadModule(t, "src/controllers/products.controller.js", {
    mocks: {
      "../config": {
        config: {
          defaultIncludeRelevanceScore: false,
        },
      },
      "../modules/products/products.service": {
        saveProducts: async () => ({
          processed: 1,
        }),
        searchProducts: async () => ({
          results: [],
        }),
        searchProductsByEans: async (payload) => {
          receivedPayload = payload;
          return {
            returned: 1,
            products: [
              {
                ean: "7891234567890",
              },
            ],
          };
        },
      },
      "../modules/client-search/client-search.service": {
        listClientSearchProviders: () => [],
        searchProductsForClientProvider: async () => ({
          results: [],
        }),
      },
      "../modules/product-search/product-search-orchestrator.service": {
        getSearchIntegrationContracts: () => ({
          providers: [],
        }),
        searchProductsWithIntegrations: async () => ({
          results: [],
        }),
      },
    },
  });

  const response = {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await searchRegisteredProductsByEans({
    body: {
      eans: ["7891234567890"],
    },
  }, response);

  assert.deepEqual(receivedPayload, {
    eans: ["7891234567890"],
  });
  assert.deepEqual(response.payload, {
    returned: 1,
    products: [
      {
        ean: "7891234567890",
      },
    ],
  });
});

test("getSearchIntegrationContracts retorna os contratos suportados", async (t) => {
  const contracts = {
    authTypes: [
      {
        type: "bearer",
      },
    ],
    providers: [
      {
        provider: "generic-json",
      },
    ],
  };

  const { getSearchIntegrationContracts } = loadModule(t, "src/controllers/products.controller.js", {
    mocks: {
      "../config": {
        config: {
          defaultIncludeRelevanceScore: false,
        },
      },
      "../modules/products/products.service": {
        saveProducts: async () => ({
          processed: 1,
        }),
        searchProducts: async () => ({
          results: [],
        }),
      },
      "../modules/client-search/client-search.service": {
        listClientSearchProviders: () => [],
        searchProductsForClientProvider: async () => ({
          results: [],
        }),
      },
      "../modules/product-search/product-search-orchestrator.service": {
        getSearchIntegrationContracts: () => contracts,
        searchProductsWithIntegrations: async () => ({
          results: [],
        }),
      },
    },
  });

  const response = {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await getSearchIntegrationContracts({}, response);

  assert.deepEqual(response.payload, contracts);
});

test("searchRegisteredProducts usa o fluxo local do provider quando vetorToken e enviado", async (t) => {
  let receivedParams = null;
  let receivedOptions = null;

  const { searchRegisteredProducts } = loadModule(t, "src/controllers/products.controller.js", {
    mocks: {
      "../config": {
        config: {
          defaultIncludeRelevanceScore: false,
        },
      },
      "../modules/products/products.service": {
        saveProducts: async () => ({
          processed: 1,
        }),
        searchProducts: async () => ({
          results: [],
        }),
      },
      "../modules/client-search/client-search.service": {
        listClientSearchProviders: () => [],
        searchProductsForClientProvider: async (params, options) => {
          receivedParams = params;
          receivedOptions = options;
          return {
            found: true,
            products: ["vetor"],
          };
        },
      },
      "../modules/product-search/product-search-orchestrator.service": {
        getSearchIntegrationContracts: () => ({
          providers: [],
        }),
        searchProductsWithIntegrations: async () => ({
          results: ["orchestrated"],
        }),
      },
    },
  });

  const response = {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await searchRegisteredProducts({
    body: {
      query: "dipirona",
      vetorToken: "token-vetor",
      cdfilial: 1,
    },
  }, response);

  assert.deepEqual(response.payload, {
    found: true,
    products: ["vetor"],
  });
  assert.equal(receivedParams.includeRelevanceScore, false);
  assert.equal(receivedParams.vetorToken, "token-vetor");
  assert.deepEqual(receivedOptions, {
    providerKey: "vetor",
  });
});

test("searchRegisteredProducts usa o fluxo local do provider quando trierToken e enviado", async (t) => {
  let receivedParams = null;
  let receivedOptions = null;

  const { searchRegisteredProducts } = loadModule(t, "src/controllers/products.controller.js", {
    mocks: {
      "../config": {
        config: {
          defaultIncludeRelevanceScore: false,
        },
      },
      "../modules/products/products.service": {
        saveProducts: async () => ({
          processed: 1,
        }),
        searchProducts: async () => ({
          results: [],
        }),
      },
      "../modules/client-search/client-search.service": {
        listClientSearchProviders: () => [],
        searchProductsForClientProvider: async (params, options) => {
          receivedParams = params;
          receivedOptions = options;
          return {
            found: true,
            products: ["trier"],
          };
        },
      },
      "../modules/product-search/product-search-orchestrator.service": {
        getSearchIntegrationContracts: () => ({
          providers: [],
        }),
        searchProductsWithIntegrations: async () => ({
          results: ["orchestrated"],
        }),
      },
    },
  });

  const response = {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await searchRegisteredProducts({
    body: {
      query: "dipirona",
      trierToken: "token-trier",
      cdfilial: 1,
    },
  }, response);

  assert.deepEqual(response.payload, {
    found: true,
    products: ["trier"],
  });
  assert.equal(receivedParams.includeRelevanceScore, false);
  assert.equal(receivedParams.trierToken, "token-trier");
  assert.deepEqual(receivedOptions, {
    providerKey: "trier",
  });
});

test("searchRegisteredProducts usa o fluxo local do provider quando alpha7Authenticate e enviado", async (t) => {
  let receivedParams = null;
  let receivedOptions = null;

  const { searchRegisteredProducts } = loadModule(t, "src/controllers/products.controller.js", {
    mocks: {
      "../config": {
        config: {
          defaultIncludeRelevanceScore: false,
        },
      },
      "../modules/products/products.service": {
        saveProducts: async () => ({
          processed: 1,
        }),
        searchProducts: async () => ({
          results: [],
        }),
      },
      "../modules/client-search/client-search.service": {
        listClientSearchProviders: () => [],
        searchProductsForClientProvider: async (params, options) => {
          receivedParams = params;
          receivedOptions = options;
          return {
            found: true,
            products: ["alpha7"],
          };
        },
      },
      "../modules/product-search/product-search-orchestrator.service": {
        getSearchIntegrationContracts: () => ({
          providers: [],
        }),
        searchProductsWithIntegrations: async () => ({
          results: ["orchestrated"],
        }),
      },
    },
  });

  const response = {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await searchRegisteredProducts({
    body: {
      query: "dipirona",
      alpha7Authenticate: "auth-alpha7",
      alpha7BaseUrl: "https://alpha7.exemplo.com",
    },
  }, response);

  assert.deepEqual(response.payload, {
    found: true,
    products: ["alpha7"],
  });
  assert.equal(receivedParams.includeRelevanceScore, false);
  assert.equal(receivedParams.alpha7Authenticate, "auth-alpha7");
  assert.deepEqual(receivedOptions, {
    providerKey: "alpha7",
  });
});

test("searchRegisteredProductsForProvider usa o provider da rota", async (t) => {
  let receivedOptions = null;

  const { searchRegisteredProductsForProvider } = loadModule(t, "src/controllers/products.controller.js", {
    mocks: {
      "../config": {
        config: {
          defaultIncludeRelevanceScore: false,
        },
      },
      "../modules/products/products.service": {
        saveProducts: async () => ({
          processed: 1,
        }),
        searchProducts: async () => ({
          results: [],
        }),
      },
      "../modules/client-search/client-search.service": {
        listClientSearchProviders: () => [],
        searchProductsForClientProvider: async (_params, options) => {
          receivedOptions = options;
          return {
            found: true,
            products: [],
          };
        },
      },
      "../modules/product-search/product-search-orchestrator.service": {
        getSearchIntegrationContracts: () => ({
          providers: [],
        }),
        searchProductsWithIntegrations: async () => ({
          results: [],
        }),
      },
    },
  });

  const response = {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await searchRegisteredProductsForProvider({
    params: {
      provider: "vetor",
    },
    body: {
      query: "dipirona",
      vetorToken: "token-vetor",
    },
  }, response);

  assert.equal(receivedOptions.providerKey, "vetor");
});

test("getClientSearchProviderContracts retorna os providers locais suportados", async (t) => {
  const contracts = [
    {
      key: "vetor",
    },
  ];

  const { getClientSearchProviderContracts } = loadModule(t, "src/controllers/products.controller.js", {
    mocks: {
      "../config": {
        config: {
          defaultIncludeRelevanceScore: false,
        },
      },
      "../modules/products/products.service": {
        saveProducts: async () => ({
          processed: 1,
        }),
        searchProducts: async () => ({
          results: [],
        }),
      },
      "../modules/client-search/client-search.service": {
        listClientSearchProviders: () => contracts,
        searchProductsForClientProvider: async () => ({
          results: [],
        }),
      },
      "../modules/product-search/product-search-orchestrator.service": {
        getSearchIntegrationContracts: () => ({
          providers: [],
        }),
        searchProductsWithIntegrations: async () => ({
          results: [],
        }),
      },
    },
  });

  const response = {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await getClientSearchProviderContracts({}, response);

  assert.deepEqual(response.payload, {
    providers: contracts,
  });
});
