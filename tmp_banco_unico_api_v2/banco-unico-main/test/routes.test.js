const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { loadModule } = require("./helpers/load-module");

function createMockResponse() {
  return {
    statusCode: 200,
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
}

function runRouter(router, request) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      payload: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        resolve({
          statusCode: this.statusCode,
          payload,
        });
        return this;
      },
    };

    router.handle(request, response, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        statusCode: response.statusCode,
        payload: response.payload,
      });
    });
  });
}

test("health.routes expõe GET /", async (t) => {
  let called = false;

  const router = loadModule(t, "src/routes/health.routes.js", {
    mocks: {
      "../controllers/health.controller": {
        getHealth: async (_req, res) => {
          called = true;
          res.json({
            status: "ok",
          });
        },
      },
    },
  });

  assert.equal(router.stack.length, 1);
  assert.equal(router.stack[0].route.path, "/");
  assert.equal(router.stack[0].route.methods.get, true);

  const response = createMockResponse();
  await router.stack[0].route.stack[0].handle({}, response, () => {});
  assert.equal(called, true);

  assert.deepEqual(response.payload, {
    status: "ok",
  });
});

test("products.routes expõe POST / e /search", async (t) => {
  const calls = [];

  const router = loadModule(t, "src/routes/products.routes.js", {
    mocks: {
      "../controllers/products.controller": {
        createProducts: async (_req, res) => {
          calls.push("create");
          res.status(201).json({
            created: true,
          });
        },
        searchRegisteredProducts: async (_req, res) => {
          calls.push("search");
          res.json({
            found: true,
          });
        },
        searchRegisteredProductsBase: async (_req, res) => {
          calls.push("search-base");
          res.json({
            base: true,
          });
        },
        searchRegisteredProductsByEans: async (_req, res) => {
          calls.push("search-eans");
          res.json({
            eans: true,
          });
        },
        getSearchIntegrationContracts: async (_req, res) => {
          calls.push("contracts");
          res.json({
            providers: [],
          });
        },
        getClientSearchProviderContracts: async (_req, res) => {
          calls.push("provider-contracts");
          res.json({
            providers: ["vetor"],
          });
        },
        searchRegisteredProductsForProvider: async (_req, res) => {
          calls.push("provider-search");
          res.json({
            provider: true,
          });
        },
        searchRegisteredProductsForAlpha7: async (_req, res) => {
          calls.push("alpha7-search");
          res.json({
            alpha7: true,
          });
        },
        searchRegisteredProductsForTrier: async (_req, res) => {
          calls.push("trier-search");
          res.json({
            trier: true,
          });
        },
        searchRegisteredProductsForVetor: async (_req, res) => {
          calls.push("vetor-search");
          res.json({
            vetor: true,
          });
        },
      },
    },
  });

  assert.equal(router.stack.length, 10);
  assert.equal(router.stack[0].route.path, "/");
  assert.equal(router.stack[1].route.path, "/search");
  assert.equal(router.stack[2].route.path, "/search/base");
  assert.equal(router.stack[3].route.path, "/search/eans");
  assert.equal(router.stack[4].route.path, "/search/contracts");
  assert.equal(router.stack[5].route.path, "/search/providers/contracts");
  assert.equal(router.stack[6].route.path, "/search/providers/:provider");
  assert.equal(router.stack[7].route.path, "/search/alpha7");
  assert.equal(router.stack[8].route.path, "/search/trier");
  assert.equal(router.stack[9].route.path, "/search/vetor");

  const createResponse = await runRouter(router, {
    method: "POST",
    url: "/",
    originalUrl: "/api/products",
    headers: {},
    body: {
      products: [],
    },
  });
  const searchResponse = await runRouter(router, {
    method: "POST",
    url: "/search",
    originalUrl: "/api/products/search",
    headers: {},
    body: {
      query: "dipirona",
    },
  });
  const searchBaseResponse = await runRouter(router, {
    method: "POST",
    url: "/search/base",
    originalUrl: "/api/products/search/base",
    headers: {},
    body: {
      query: "dipirona",
    },
  });
  const searchEansResponse = await runRouter(router, {
    method: "POST",
    url: "/search/eans",
    originalUrl: "/api/products/search/eans",
    headers: {},
    body: {
      eans: ["7891234567890"],
    },
  });
  const contractsResponse = await runRouter(router, {
    method: "GET",
    url: "/search/contracts",
    originalUrl: "/api/products/search/contracts",
    headers: {},
  });
  const providerContractsResponse = await runRouter(router, {
    method: "GET",
    url: "/search/providers/contracts",
    originalUrl: "/api/products/search/providers/contracts",
    headers: {},
  });
  const providerSearchResponse = await runRouter(router, {
    method: "POST",
    url: "/search/providers/vetor",
    originalUrl: "/api/products/search/providers/vetor",
    headers: {},
    params: {
      provider: "vetor",
    },
    body: {
      query: "dipirona",
      vetorToken: "token",
    },
  });
  const alpha7SearchResponse = await runRouter(router, {
    method: "POST",
    url: "/search/alpha7",
    originalUrl: "/api/products/search/alpha7",
    headers: {},
    body: {
      query: "dipirona",
      alpha7Authenticate: "auth-alpha7",
    },
  });
  const trierSearchResponse = await runRouter(router, {
    method: "POST",
    url: "/search/trier",
    originalUrl: "/api/products/search/trier",
    headers: {},
    body: {
      query: "dipirona",
      trierToken: "token",
    },
  });
  const vetorSearchResponse = await runRouter(router, {
    method: "POST",
    url: "/search/vetor",
    originalUrl: "/api/products/search/vetor",
    headers: {},
    body: {
      query: "dipirona",
      vetorToken: "token",
    },
  });

  assert.equal(createResponse.statusCode, 201);
  assert.equal(searchResponse.statusCode, 200);
  assert.equal(searchBaseResponse.statusCode, 200);
  assert.equal(searchEansResponse.statusCode, 200);
  assert.equal(contractsResponse.statusCode, 200);
  assert.equal(providerContractsResponse.statusCode, 200);
  assert.equal(providerSearchResponse.statusCode, 200);
  assert.equal(alpha7SearchResponse.statusCode, 200);
  assert.equal(trierSearchResponse.statusCode, 200);
  assert.equal(vetorSearchResponse.statusCode, 200);
  assert.deepEqual(calls, [
    "create",
    "search",
    "search-base",
    "search-eans",
    "contracts",
    "provider-contracts",
    "provider-search",
    "alpha7-search",
    "trier-search",
    "vetor-search",
  ]);
});

test("routes/index monta health e products nos prefixes esperados", async (t) => {
  const healthRoutes = express.Router();
  const productsRoutes = express.Router();

  healthRoutes.get("/", (_req, res) => {
    res.json({
      route: "health",
    });
  });

  productsRoutes.post("/search", (_req, res) => {
    res.json({
      route: "products",
    });
  });

  const router = loadModule(t, "src/routes/index.js", {
    mocks: {
      "./health.routes": healthRoutes,
      "./products.routes": productsRoutes,
    },
  });

  assert.equal(router.stack.length, 2);

  const healthResponse = await runRouter(router, {
    method: "GET",
    url: "/health",
    originalUrl: "/health",
    headers: {},
  });
  const productsResponse = await runRouter(router, {
    method: "POST",
    url: "/api/products/search",
    originalUrl: "/api/products/search",
    headers: {},
  });

  assert.deepEqual(healthResponse.payload, {
    route: "health",
  });
  assert.deepEqual(productsResponse.payload, {
    route: "products",
  });
});
