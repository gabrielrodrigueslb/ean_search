const test = require("node:test");
const assert = require("node:assert/strict");

const { loadModule } = require("./helpers/load-module");

test("parseTrierProviderRequest aceita token com prefixo Bearer e cdfilial", (t) => {
  const { parseTrierProviderRequest } = loadModule(
    t,
    "src/modules/client-search/providers/trier/trier.request-parser.js",
  );

  const result = parseTrierProviderRequest({
    trierToken: "Bearer token-trier",
    cdfilial: 3,
  });

  assert.deepEqual(result, {
    clientSearchOptions: {
      trierToken: "token-trier",
      cdfilial: 3,
    },
    requestContext: {
      cdfilial: 3,
    },
    logContext: {
      hasToken: true,
      cdfilial: 3,
    },
  });
});

test("parseTrierProviderRequest retorna erro quando trierToken nao e informado", (t) => {
  const { parseTrierProviderRequest } = loadModule(
    t,
    "src/modules/client-search/providers/trier/trier.request-parser.js",
  );

  const result = parseTrierProviderRequest({
    cdfilial: 1,
  });

  assert.deepEqual(result, {
    error: {
      reason: "missing_trier_token",
      message: "Parâmetro \"trierToken\" é obrigatório.",
    },
  });
});
