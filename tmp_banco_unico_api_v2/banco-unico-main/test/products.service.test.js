const test = require("node:test");
const assert = require("node:assert/strict");

const { loadModule } = require("./helpers/load-module");

function createConfig(overrides = {}) {
  return {
    port: 3000,
    database: {
      connectionString: "postgres://postgres:postgres@localhost:5432/banco_unico",
    },
    databaseSsl: false,
    openAiApiKey: "test-key",
    openAiEmbeddingModel: "text-embedding-3-small",
    openAiProductRelevanceModel: "gpt-4o-mini",
    vectorDimensions: 4,
    defaultSearchLimit: 10,
    maxSearchLimit: 50,
    maxTokensPerProduct: 256,
    upsertBatchSize: 2,
    maxReturnedProducts: 10,
    ...overrides,
  };
}

test("saveProducts aceita array direto e prepara payload com embedding real", async (t) => {
  let savedBatch = null;
  let savedOptions = null;

  const repository = {
    upsertProducts: async (products, options) => {
      savedBatch = products;
      savedOptions = options;

      return {
        processedCount: products.length,
        products: [
          {
            id: "1",
            ean: products[0].ean,
            description: products[0].description,
            activeIngredient: products[0].activeIngredient,
            classification: products[0].classification,
            socialName: products[0].socialName,
            manufacturer: products[0].manufacturer,
            details: products[0].details,
            tokenCount: products[0].tokenCount,
            createdAt: "2026-05-01T00:00:00.000Z",
            updatedAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      };
    },
    searchProducts: async () => [],
  };

  const embeddings = {
    createEmbeddings: async (texts) => texts.map((_text, index) => [index + 1, index + 2, index + 3, index + 4]),
    createEmbedding: async () => [9, 8, 7, 6],
  };

  const { saveProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig(),
      },
      "../vector/openai-embedding.service": embeddings,
      "./products.repository": repository,
    },
  });

  const result = await saveProducts([
    {
      descricaoProduto: "Paracetamol + Fosfato de Codeina",
      principioAtivo: "Fosfato de Codeina, Paracetamol",
      classificacao: "Generico",
      fabricante: "EMS S/A",
      ean: "7891234567890",
    },
  ]);

  assert.equal(savedBatch.length, 1);
  assert.equal(savedBatch[0].searchableText, "Paracetamol + Fosfato de Codeina Fosfato de Codeina, Paracetamol Paracetamol + Fosfato de Codeina Fosfato de Codeina, Paracetamol Generico EMS S/A");
  assert.deepEqual(savedBatch[0].tokens, [
    "paracetamol",
    "fosfato",
    "de",
    "codeina",
    "fosfato",
    "de",
    "codeina",
    "paracetamol",
    "paracetamol",
    "fosfato",
    "de",
    "codeina",
    "fosfato",
    "de",
    "codeina",
    "paracetamol",
    "generico",
    "ems",
    "s",
    "a",
  ]);
  assert.equal(savedBatch[0].embedding, "[1,2,3,4]");
  assert.deepEqual(savedOptions, {
    batchSize: 2,
    returnRows: true,
  });
  assert.equal(result.processed, 1);
  assert.equal(result.returned, 1);
});

test("saveProducts aceita wrapper produtos e reduz retorno para lotes grandes", async (t) => {
  let savedOptions = null;

  const repository = {
    upsertProducts: async (_products, options) => {
      savedOptions = options;

      return {
        processedCount: 2,
        products: [],
      };
    },
    searchProducts: async () => [],
  };

  const embeddings = {
    createEmbeddings: async () => [[1, 1, 1, 1], [2, 2, 2, 2]],
    createEmbedding: async () => [9, 8, 7, 6],
  };

  const { saveProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig({
          maxReturnedProducts: 1,
        }),
      },
      "../vector/openai-embedding.service": embeddings,
      "./products.repository": repository,
    },
  });

  const result = await saveProducts({
    produtos: [
      {
        descricaoProduto: "Produto A",
        ean: "78912345",
      },
      {
        descricaoProduto: "Produto B",
        ean: "78912346",
      },
    ],
  });

  assert.deepEqual(savedOptions, {
    batchSize: 2,
    returnRows: false,
  });
  assert.equal(result.upserted, 2);
  assert.equal(result.returned, 0);
});

test("reprocessProducts relê o banco e regrava produtos em lotes", async (t) => {
  const listedParams = [];
  const upsertCalls = [];

  const repository = {
    listProductsForReprocessing: async ({ afterEan, limit }) => {
      listedParams.push({
        afterEan,
        limit,
      });

      if (afterEan === null) {
        return [
          {
            ean: "78912345",
            description: "Dipirona 500mg",
            activeIngredient: "Dipirona Monoidratada",
            classification: "Analgésico",
            socialName: "Anador",
            manufacturer: "Opella",
            details: "{\"origem\":\"legado\"}",
          },
          {
            ean: "78912346",
            description: "Paracetamol 750mg",
            activeIngredient: "Paracetamol",
            classification: "Analgésico",
            socialName: null,
            manufacturer: "EMS",
            details: null,
          },
        ];
      }

      if (afterEan === "78912346") {
        return [
          {
            ean: "78912347",
            description: "Ibuprofeno 600mg",
            activeIngredient: "Ibuprofeno",
            classification: "Anti-inflamatório",
            socialName: null,
            manufacturer: "Medley",
            details: null,
          },
        ];
      }

      return [];
    },
    upsertProducts: async (products, options) => {
      upsertCalls.push({
        products,
        options,
      });

      return {
        processedCount: products.length,
        products: [],
      };
    },
    searchProducts: async () => [],
  };

  const { reprocessProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig({
          upsertBatchSize: 2,
        }),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async (texts) => texts.map((_text, index) => [index + 1, index + 2, index + 3, index + 4]),
        createEmbedding: async () => [9, 8, 7, 6],
      },
      "./products.repository": repository,
    },
  });

  const result = await reprocessProducts({
    readBatchSize: 2,
    writeBatchSize: 1,
  });

  assert.deepEqual(listedParams, [
    {
      afterEan: null,
      limit: 2,
    },
    {
      afterEan: "78912346",
      limit: 2,
    },
    {
      afterEan: "78912347",
      limit: 2,
    },
  ]);
  assert.equal(upsertCalls.length, 2);
  assert.deepEqual(upsertCalls[0].options, {
    batchSize: 1,
    returnRows: false,
  });
  assert.equal(
    upsertCalls[0].products[0].searchableText,
    "Dipirona 500mg Dipirona Monoidratada Dipirona 500mg Dipirona Monoidratada Anador Analgésico Opella",
  );
  assert.equal(upsertCalls[0].products[0].embedding, "[1,2,3,4]");
  assert.equal(result.reprocessed, 3);
  assert.equal(result.batches, 2);
  assert.equal(result.lastEan, "78912347");
});

test("saveProducts aceita objeto unico", async (t) => {
  let savedBatch = null;

  const repository = {
    upsertProducts: async (products) => {
      savedBatch = products;
      return {
        processedCount: 1,
        products: [],
      };
    },
    searchProducts: async () => [],
  };

  const { saveProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig(),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async () => [[1, 2, 3, 4]],
        createEmbedding: async () => [4, 3, 2, 1],
      },
      "./products.repository": repository,
    },
  });

  await saveProducts({
    descricaoProduto: "Dipirona",
    ean: "78912347",
  });

  assert.equal(savedBatch.length, 1);
  assert.equal(savedBatch[0].description, "Dipirona");
});

test("saveProducts aceita taxonomia e ingrediente_ativo no cadastro", async (t) => {
  let savedBatch = null;

  const repository = {
    upsertProducts: async (products) => {
      savedBatch = products;
      return {
        processedCount: 1,
        products: [],
      };
    },
    searchProducts: async () => [],
  };

  const { saveProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig(),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async () => [[1, 2, 3, 4]],
        createEmbedding: async () => [4, 3, 2, 1],
      },
      "./products.repository": repository,
    },
  });

  await saveProducts({
    descricaoProduto: "Dipirona 500mg",
    ingredienteAtivo: "Dipirona Monoidratada",
    departamento: "Medicamentos",
    categoria: "Dor e Febre",
    subcategoria: "Analgesicos",
    segmento: "Oral",
    subsegmento: "Comprimidos",
    ean: "78912349",
  });

  assert.equal(savedBatch[0].activeIngredient, "Dipirona Monoidratada");
  assert.equal(savedBatch[0].department, "Medicamentos");
  assert.equal(savedBatch[0].category, "Dor e Febre");
  assert.equal(savedBatch[0].subcategory, "Analgesicos");
  assert.equal(savedBatch[0].segment, "Oral");
  assert.equal(savedBatch[0].subsegment, "Comprimidos");
  assert.match(savedBatch[0].searchableText, /Medicamentos/);
  assert.match(savedBatch[0].searchableText, /Comprimidos/);
});

test("saveProducts separa numeros e unidades em tokens para melhorar buscas lexicais", async (t) => {
  let savedBatch = null;

  const repository = {
    upsertProducts: async (products) => {
      savedBatch = products;
      return {
        processedCount: 1,
        products: [],
      };
    },
    searchProducts: async () => [],
  };

  const { saveProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig(),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async () => [[1, 2, 3, 4]],
        createEmbedding: async () => [4, 3, 2, 1],
      },
      "./products.repository": repository,
    },
  });

  await saveProducts({
    descricaoProduto: "Neutrofer 250mg/ml Suspensao Gotas 30ml",
    ean: "78912348",
  });

  assert.deepEqual(savedBatch[0].tokens, [
    "neutrofer",
    "250",
    "mg",
    "ml",
    "suspensao",
    "gotas",
    "30",
    "ml",
    "neutrofer",
    "250",
    "mg",
    "ml",
    "suspensao",
    "gotas",
    "30",
    "ml",
  ]);
});

test("saveProducts valida produtos obrigatorios", async (t) => {
  const { saveProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig(),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async () => [],
        createEmbedding: async () => [1, 2, 3, 4],
      },
      "./products.repository": {
        upsertProducts: async () => {
          throw new Error("nao deveria chamar repositorio");
        },
        searchProducts: async () => [],
      },
    },
  });

  await assert.rejects(() => saveProducts({
    products: [
      {
        ean: "78912347",
      },
    ],
  }), /descricaoProduto/);

  await assert.rejects(() => saveProducts({
    descricaoProduto: "Dipirona",
  }), /ean/);
});

test("searchProductsByEans normaliza, remove duplicados e informa faltantes", async (t) => {
  let receivedEans = null;

  const { searchProductsByEans } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig(),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async () => [],
        createEmbedding: async () => [0.1, 0.2, 0.3, 0.4],
      },
      "./products.repository": {
        findProductsByEans: async (eans) => {
          receivedEans = eans;
          return [
            {
              id: "2",
              ean: "78912346",
              descricaoProduto: "Produto B",
            },
            {
              id: "1",
              ean: "78912345",
              descricaoProduto: "Produto A",
            },
          ];
        },
        listProductsForReprocessing: async () => [],
        searchProducts: async () => [],
        upsertProducts: async () => ({
          processedCount: 0,
          products: [],
        }),
      },
    },
  });

  const result = await searchProductsByEans({
    eans: [
      "78912345",
      { ean: "78912346" },
      "78912345",
      "78912347",
    ],
  });

  assert.deepEqual(receivedEans, [
    "78912345",
    "78912346",
    "78912347",
  ]);
  assert.deepEqual(result, {
    requested: 3,
    returned: 2,
    missing: 1,
    products: [
      {
        id: "1",
        ean: "78912345",
        descricaoProduto: "Produto A",
      },
      {
        id: "2",
        ean: "78912346",
        descricaoProduto: "Produto B",
      },
    ],
    missingEans: ["78912347"],
  });
});

test("searchProductsByEans valida payload vazio", async (t) => {
  const { searchProductsByEans } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig(),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async () => [],
        createEmbedding: async () => [0.1, 0.2, 0.3, 0.4],
      },
      "./products.repository": {
        findProductsByEans: async () => [],
        listProductsForReprocessing: async () => [],
        searchProducts: async () => [],
        upsertProducts: async () => ({
          processedCount: 0,
          products: [],
        }),
      },
    },
  });

  await assert.rejects(() => searchProductsByEans({
    eans: [],
  }), /pelo menos um EAN/i);
});

test("searchProducts gera embedding da query e aplica filtros", async (t) => {
  let receivedParams = null;

  const repository = {
    upsertProducts: async () => ({
      processedCount: 0,
      products: [],
    }),
    searchProducts: async (params) => {
      receivedParams = params;
      return [
        {
          id: "1",
          descricaoProduto: "Paracetamol",
        },
      ];
    },
  };

  const { searchProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig({
          defaultSearchLimit: 3,
          maxSearchLimit: 5,
        }),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async () => [],
        createEmbedding: async () => [0.1, 0.2, 0.3, 0.4],
      },
      "./products.repository": repository,
    },
  });

  const result = await searchProducts({
    query: "paracetamol com codeina",
    limit: 999,
    minScore: "0.75",
    ean: "7891234567890",
  });

  assert.equal(receivedParams.embedding, "[0.1,0.2,0.3,0.4]");
  assert.equal(receivedParams.eanFilter, "7891234567890");
  assert.deepEqual(receivedParams.queryTokens, ["paracetamol", "com", "codeina"]);
  assert.equal(receivedParams.minScore, 0.75);
  assert.equal(receivedParams.limit, 6);
  assert.equal(receivedParams.offset, 0);
  assert.equal(receivedParams.prioritizeLexicalSignals, false);
  assert.equal(result.limit, 5);
  assert.equal(result.offset, 0);
  assert.equal(result.returned, 1);
  assert.equal(result.hasMore, false);
  assert.equal(result.nextOffset, null);
  assert.equal(result.prioritizeLexicalSignals, false);
  assert.equal(result.results.length, 1);
});

test("searchProducts suporta paginacao por offset", async (t) => {
  let receivedParams = null;

  const repository = {
    upsertProducts: async () => ({
      processedCount: 0,
      products: [],
    }),
    searchProducts: async (params) => {
      receivedParams = params;
      return [
        { id: "1", descricaoProduto: "Produto 21", similarity: 0.9, tokenOverlap: 1, exactEanMatch: false },
        { id: "2", descricaoProduto: "Produto 22", similarity: 0.89, tokenOverlap: 1, exactEanMatch: false },
        { id: "3", descricaoProduto: "Produto 23", similarity: 0.88, tokenOverlap: 1, exactEanMatch: false },
      ];
    },
  };

  const { searchProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig({
          defaultSearchLimit: 2,
          maxSearchLimit: 5,
        }),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async () => [],
        createEmbedding: async () => [0.1, 0.2, 0.3, 0.4],
      },
      "./products.repository": repository,
      "./openai-product-relevance.service": {
        scoreProductRelevance: async (_query, results) => results,
      },
    },
  });

  const result = await searchProducts({
    query: "dipirona",
    limit: 2,
    offset: 20,
    includeRelevanceScore: true,
  });

  assert.equal(receivedParams.limit, 3);
  assert.equal(receivedParams.offset, 20);
  assert.equal(result.offset, 20);
  assert.equal(result.returned, 2);
  assert.equal(result.hasMore, true);
  assert.equal(result.nextOffset, 22);
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].descricaoProduto, "Produto 21");
});

test("searchProducts prioriza sinais lexicais para query curta", async (t) => {
  let receivedParams = null;

  const repository = {
    upsertProducts: async () => ({
      processedCount: 0,
      products: [],
    }),
    searchProducts: async (params) => {
      receivedParams = params;
      return [];
    },
  };

  const { searchProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig(),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async () => [],
        createEmbedding: async () => [0.1, 0.2, 0.3, 0.4],
      },
      "./products.repository": repository,
    },
  });

  const result = await searchProducts({
    query: "dipirona",
  });

  assert.equal(receivedParams.prioritizeLexicalSignals, true);
  assert.equal(result.prioritizeLexicalSignals, true);
});

test("searchProducts remove resultados sem evidencia lexical para query curta", async (t) => {
  const repository = {
    upsertProducts: async () => ({
      processedCount: 0,
      products: [],
    }),
    searchProducts: async () => [
      {
        id: "1",
        ean: "7891",
        descricaoProduto: "Cafe Torrado 250g",
        principioAtivo: null,
        classificacao: "Bebidas",
        nomeSocial: "Cafe Torrado 250g",
        fabricante: "Marca X",
        similarity: 0.67,
        tokenOverlap: 0,
        exactEanMatch: false,
      },
    ],
  };

  const { searchProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig(),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async () => [],
        createEmbedding: async () => [0.1, 0.2, 0.3, 0.4],
      },
      "./products.repository": repository,
    },
  });

  const result = await searchProducts({
    query: "cerveja",
  });

  assert.equal(result.results.length, 0);
});

test("searchProducts preserva resultado de typo com evidencia lexical aproximada", async (t) => {
  const repository = {
    upsertProducts: async () => ({
      processedCount: 0,
      products: [],
    }),
    searchProducts: async () => [
      {
        id: "1",
        ean: "7891",
        descricaoProduto: "Dipirona Monoidratada 500mg",
        principioAtivo: "Dipirona Monoidratada",
        classificacao: "Generico",
        nomeSocial: "Dipirona",
        fabricante: "EMS",
        similarity: 0.58,
        tokenOverlap: 0,
        exactEanMatch: false,
      },
    ],
  };

  const { searchProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig(),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async () => [],
        createEmbedding: async () => [0.1, 0.2, 0.3, 0.4],
      },
      "./products.repository": repository,
    },
  });

  const result = await searchProducts({
    query: "dirpirona",
  });

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].descricaoProduto, "Dipirona Monoidratada 500mg");
});

test("searchProducts anota resultados com nota de relevancia quando solicitado", async (t) => {
  const repository = {
    upsertProducts: async () => ({
      processedCount: 0,
      products: [],
    }),
    searchProducts: async () => [
      {
        id: "1",
        descricaoProduto: "LEVONORGESTREL 1,5MG C/1 COMP CIMED",
        principioAtivo: "Levonorgestrel",
        similarity: 0.46,
        tokenOverlap: 0,
        exactEanMatch: false,
      },
    ],
  };

  const { searchProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig(),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async () => [],
        createEmbedding: async () => [0.1, 0.2, 0.3, 0.4],
      },
      "./openai-product-relevance.service": {
        scoreProductRelevance: async (_query, results) => results.map((result) => ({
          ...result,
          relevanceScore: 5,
          relevanceReason: "Diretamente relacionado com a intencao da busca.",
        })),
      },
      "./products.repository": repository,
    },
  });

  const result = await searchProducts({
    query: "pilula do dia seguinte",
    includeRelevanceScore: true,
  });

  assert.equal(result.results[0].relevanceScore, 5);
  assert.equal(result.results[0].relevanceReason, "Diretamente relacionado com a intencao da busca.");
});

test("searchProducts retorna nota nula quando a avaliacao de relevancia falha", async (t) => {
  const repository = {
    upsertProducts: async () => ({
      processedCount: 0,
      products: [],
    }),
    searchProducts: async () => [
      {
        id: "1",
        descricaoProduto: "LEVONORGESTREL 1,5MG C/1 COMP CIMED",
        principioAtivo: "Levonorgestrel",
        similarity: 0.46,
        tokenOverlap: 0,
        exactEanMatch: false,
      },
    ],
  };

  const { searchProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig(),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async () => [],
        createEmbedding: async () => [0.1, 0.2, 0.3, 0.4],
      },
      "./openai-product-relevance.service": {
        scoreProductRelevance: async () => {
          throw new Error("falha na openai");
        },
      },
      "./products.repository": repository,
    },
  });

  const result = await searchProducts({
    query: "pilula do dia seguinte",
    includeRelevanceScore: true,
  });

  assert.equal(result.results[0].relevanceScore, null);
  assert.equal(result.results[0].relevanceReason, null);
});

test("searchProducts com nota de relevancia preserva a ordem original dos candidatos", async (t) => {
  const repository = {
    upsertProducts: async () => ({
      processedCount: 0,
      products: [],
    }),
    searchProducts: async () => [
      {
        id: "1",
        descricaoProduto: "Camisinha Prudence Retardante",
        principioAtivo: null,
        similarity: 0.49,
        tokenOverlap: 0,
        exactEanMatch: false,
      },
      {
        id: "2",
        descricaoProduto: "LEVONORGESTREL 1,5MG C/1 COMP CIMED",
        principioAtivo: "Levonorgestrel",
        similarity: 0.46,
        tokenOverlap: 0,
        exactEanMatch: false,
      },
    ],
  };

  const { searchProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig(),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async () => [],
        createEmbedding: async () => [0.1, 0.2, 0.3, 0.4],
      },
      "./openai-product-relevance.service": {
        scoreProductRelevance: async (_query, results) => results.map((result) => (
          result.descricaoProduto.includes("LEVONORGESTREL")
            ? {
              ...result,
              relevanceScore: 5,
              relevanceReason: "Produto diretamente alinhado com a intencao da busca.",
            }
            : {
              ...result,
              relevanceScore: 2,
              relevanceReason: "Relacionamento indireto com a busca.",
            }
        )),
      },
      "./products.repository": repository,
    },
  });

  const result = await searchProducts({
    query: "pilula do dia seguinte",
    includeRelevanceScore: true,
  });

  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].descricaoProduto, "Camisinha Prudence Retardante");
  assert.equal(result.results[0].relevanceScore, 2);
  assert.equal(result.results[1].descricaoProduto, "LEVONORGESTREL 1,5MG C/1 COMP CIMED");
  assert.equal(result.results[1].relevanceScore, 5);
});

test("searchProducts valida query e minScore", async (t) => {
  const { searchProducts } = loadModule(t, "src/modules/products/products.service.js", {
    mocks: {
      "../../config": {
        config: createConfig(),
      },
      "../vector/openai-embedding.service": {
        createEmbeddings: async () => [],
        createEmbedding: async () => [0.1, 0.2, 0.3, 0.4],
      },
      "./products.repository": {
        upsertProducts: async () => ({
          processedCount: 0,
          products: [],
        }),
        searchProducts: async () => [],
      },
    },
  });

  await assert.rejects(() => searchProducts({
    query: "   ",
  }), /campo query/);

  await assert.rejects(() => searchProducts({
    query: "dipirona",
    minScore: "abc",
  }), /minScore/);

  await assert.rejects(() => searchProducts({
    query: "dipirona",
    offset: "-1",
  }), /offset/);
});
