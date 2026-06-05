const test = require("node:test");
const assert = require("node:assert/strict");

const { loadModule } = require("./helpers/load-module");

function createBaseEnv(overrides = {}) {
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
    ...overrides,
  };
}

test("config carrega valores validos do ambiente", (t) => {
  const { config } = loadModule(t, "src/config.js", {
    env: createBaseEnv(),
  });

  assert.equal(config.database.connectionString, "postgres://postgres:postgres@localhost:5432/banco_unico");
  assert.equal(config.openAiApiKey, "test-key");
  assert.equal(config.openAiEmbeddingModel, "text-embedding-3-small");
  assert.equal(config.vectorDimensions, 512);
  assert.equal(config.defaultIncludeRelevanceScore, false);
});

test("config permite habilitar relevancia por padrao via ambiente", (t) => {
  const { config } = loadModule(t, "src/config.js", {
    env: createBaseEnv({
      DEFAULT_INCLUDE_RELEVANCE_SCORE: "true",
    }),
  });

  assert.equal(config.defaultIncludeRelevanceScore, true);
});

test("config falha sem OPENAI_API_KEY", (t) => {
  assert.throws(() => loadModule(t, "src/config.js", {
    env: createBaseEnv({
      OPENAI_API_KEY: "",
    }),
  }), /OPENAI_API_KEY/);
});

test("config falha com modelo de embedding nao suportado", (t) => {
  assert.throws(() => loadModule(t, "src/config.js", {
    env: createBaseEnv({
      OPENAI_EMBEDDING_MODEL: "text-embedding-ada-002",
    }),
  }), /text-embedding-3/);
});

test("config falha quando VECTOR_DIMENSIONS e menor que 16", (t) => {
  assert.throws(() => loadModule(t, "src/config.js", {
    env: createBaseEnv({
      VECTOR_DIMENSIONS: "8",
    }),
  }), /pelo menos 16/);
});

test("config falha quando dimensoes excedem o maximo do modelo", (t) => {
  assert.throws(() => loadModule(t, "src/config.js", {
    env: createBaseEnv({
      VECTOR_DIMENSIONS: "2000",
      OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
    }),
  }), /excede o maximo de 1536/);
});
