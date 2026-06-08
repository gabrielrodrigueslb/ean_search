const test = require("node:test");
const assert = require("node:assert/strict");

const { loadModule } = require("./helpers/load-module");

function createBaseEnv(overrides = {}) {
  return {
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/banco_unico",
    OPENAI_API_KEY: "test-key",
    OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
    VECTOR_DIMENSIONS: "512",
    ...overrides,
  };
}

test("createEmbeddings processa lotes e preserva a ordem", async (t) => {
  const originalFetch = global.fetch;
  const requests = [];

  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requests.push(body);

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: body.input.map((value, index) => ({
          index,
          embedding: [Number(value.split("-").pop())],
        })),
      }),
    };
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const { createEmbedding, createEmbeddings } = loadModule(t, "src/modules/vector/openai-embedding.service.js", {
    env: createBaseEnv(),
  });
  const inputs = Array.from({ length: 101 }, (_, index) => `produto-${index}`);
  const embeddings = await createEmbeddings(inputs);
  const singleEmbedding = await createEmbedding("produto-999");

  assert.equal(requests.length, 3);
  assert.equal(requests[0].dimensions, 512);
  assert.equal(requests[0].model, "text-embedding-3-small");
  assert.equal(requests[0].input.length, 100);
  assert.equal(requests[1].input.length, 1);
  assert.equal(embeddings[0][0], 0);
  assert.equal(embeddings[100][0], 100);
  assert.equal(singleEmbedding[0], 999);
});

test("createEmbeddings retorna array vazio para entrada vazia", async (t) => {
  const { createEmbeddings } = loadModule(t, "src/modules/vector/openai-embedding.service.js", {
    env: createBaseEnv(),
  });

  assert.deepEqual(await createEmbeddings([]), []);
});

test("createEmbedding propaga mensagem de erro da OpenAI", async (t) => {
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({
      error: {
        message: "Invalid API key",
      },
    }),
  });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const { createEmbedding } = loadModule(t, "src/modules/vector/openai-embedding.service.js", {
    env: createBaseEnv(),
  });

  await assert.rejects(() => createEmbedding("paracetamol"), /Invalid API key/);
});
