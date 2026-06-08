const test = require("node:test");
const assert = require("node:assert/strict");

const { loadModule } = require("./helpers/load-module");

function createBaseEnv(overrides = {}) {
  return {
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/banco_unico",
    OPENAI_API_KEY: "test-key",
    OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
    OPENAI_INTELLIGENT_SEARCH_MODEL: "gpt-4o-mini",
    OPENAI_PRODUCT_RELEVANCE_MODEL: "gpt-4o-mini",
    VECTOR_DIMENSIONS: "512",
    ...overrides,
  };
}

test("scoreProductRelevance chama a OpenAI e anota os produtos com nota de 1 a 5", async (t) => {
  const originalFetch = global.fetch;
  let receivedRequest = null;

  global.fetch = async (_url, options) => {
    receivedRequest = JSON.parse(options.body);

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  ratedResults: [
                    {
                      resultIndex: 0,
                      score: 5,
                      reason: "Produto diretamente alinhado com a intencao da busca.",
                    },
                    {
                      resultIndex: 1,
                      score: 2,
                      reason: "Tem relacao indireta, mas nao e a melhor resposta.",
                    },
                  ],
                }),
              },
            ],
          },
        ],
      }),
    };
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const { scoreProductRelevance } = loadModule(t, "src/modules/products/openai-product-relevance.service.js", {
    env: createBaseEnv(),
  });

  const results = await scoreProductRelevance("pilula do dia seguinte", [
    {
      descricaoProduto: "LEVONORGESTREL 1,5MG C/1 COMP CIMED",
      principioAtivo: "Levonorgestrel",
      similarity: 0.46,
    },
    {
      descricaoProduto: "Camisinha Prudence Retardante",
      principioAtivo: null,
      similarity: 0.49,
    },
  ]);

  assert.equal(receivedRequest.model, "gpt-4o-mini");
  assert.equal(receivedRequest.text.format.type, "json_schema");
  assert.match(receivedRequest.input, /LEVONORGESTREL 1,5MG C\/1 COMP CIMED/);
  assert.equal(results[0].relevanceScore, 5);
  assert.equal(results[0].relevanceReason, "Produto diretamente alinhado com a intencao da busca.");
  assert.equal(results[1].relevanceScore, 2);
});

test("scoreProductRelevance propaga erro da OpenAI", async (t) => {
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({
      error: {
        message: "Invalid schema for response_format",
      },
    }),
  });

  t.after(() => {
    global.fetch = originalFetch;
  });

  const { scoreProductRelevance } = loadModule(t, "src/modules/products/openai-product-relevance.service.js", {
    env: createBaseEnv(),
  });

  await assert.rejects(
    () => scoreProductRelevance("monster", [{ descricaoProduto: "MONSTER" }]),
    /Invalid schema for response_format/,
  );
});
