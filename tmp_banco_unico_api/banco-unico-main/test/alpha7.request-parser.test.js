const test = require("node:test");
const assert = require("node:assert/strict");

const { loadModule } = require("./helpers/load-module");

test("parseAlpha7ProviderRequest aceita alpha7Authenticate e options opcionais", (t) => {
  const { parseAlpha7ProviderRequest } = loadModule(
    t,
    "src/modules/client-search/providers/alpha7/alpha7.request-parser.js",
  );

  const result = parseAlpha7ProviderRequest({
    alpha7Authenticate: "abc123",
    alpha7BaseUrl: "https://alpha7.exemplo.com",
    alpha7RequestPath: "/api/consultar-eans",
  });

  assert.deepEqual(result, {
    clientSearchOptions: {
      alpha7Authenticate: "abc123",
      alpha7BaseUrl: "https://alpha7.exemplo.com",
      alpha7RequestPath: "/api/consultar-eans",
      alpha7AuthHeaderName: null,
      alpha7AuthPrefix: null,
    },
    requestContext: {},
    logContext: {
      hasAuthenticate: true,
      hasCustomBaseUrl: true,
      hasCustomRequestPath: true,
    },
  });
});

test("parseAlpha7ProviderRequest retorna erro quando alpha7Authenticate nao e informado", (t) => {
  const { parseAlpha7ProviderRequest } = loadModule(
    t,
    "src/modules/client-search/providers/alpha7/alpha7.request-parser.js",
  );

  const result = parseAlpha7ProviderRequest({
    alpha7BaseUrl: "https://alpha7.exemplo.com",
  });

  assert.deepEqual(result, {
    error: {
      reason: "missing_alpha7_authenticate",
      message: "Parâmetro \"alpha7Authenticate\" é obrigatório.",
    },
  });
});
