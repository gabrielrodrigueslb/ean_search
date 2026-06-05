const test = require("node:test");
const assert = require("node:assert/strict");

const { loadModule } = require("./helpers/load-module");

function createPreparedProduct(ean) {
  return {
    ean,
    description: `Produto ${ean}`,
    activeIngredient: "Paracetamol",
    classification: "Generico",
    socialName: null,
    manufacturer: "EMS",
    details: null,
    searchableText: `Produto ${ean} Paracetamol Produto ${ean} Paracetamol Generico EMS`,
    normalizedSearchableText: `produto ${ean} paracetamol produto ${ean} paracetamol generico ems`,
    tokens: ["produto", ean, "paracetamol", "produto", ean, "paracetamol", "generico", "ems"],
    tokenCount: 8,
    embedding: "[1,2,3,4]",
  };
}

function createDatabaseRow(ean) {
  return {
    id: `id-${ean}`,
    ean,
    description: `Produto ${ean}`,
    activeIngredient: "Paracetamol",
    classification: "Generico",
    socialName: null,
    manufacturer: "EMS",
    details: null,
    tokenCount: 3,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
}

test("upsertProducts retorna vazio para lote vazio", async (t) => {
  const { upsertProducts } = loadModule(t, "src/modules/products/products.repository.js", {
    mocks: {
      "../../db": {
        pool: {},
      },
    },
  });

  const result = await upsertProducts([], {
    batchSize: 2,
    returnRows: true,
  });

  assert.deepEqual(result, {
    processedCount: 0,
    products: [],
  });
});

test("upsertProducts salva em lotes e faz commit", async (t) => {
  const queries = [];
  let released = false;

  const client = {
    query: async (sql, values) => {
      queries.push({
        sql,
        values,
      });

      if (sql === "BEGIN" || sql === "COMMIT") {
        return {
          rows: [],
        };
      }

      if (sql.includes("INSERT INTO active_ingredients")) {
        return {
          rows: [
            {
              id: "active-ingredient-1",
              name: "Paracetamol",
            },
          ],
        };
      }

      return {
        rows: [createDatabaseRow(values[0])],
      };
    },
    release: () => {
      released = true;
    },
  };

  const { upsertProducts } = loadModule(t, "src/modules/products/products.repository.js", {
    mocks: {
      "../../db": {
        pool: {
          connect: async () => client,
        },
      },
    },
  });

  const result = await upsertProducts([
    createPreparedProduct("78912345"),
    createPreparedProduct("78912346"),
  ], {
    batchSize: 1,
    returnRows: true,
  });

  assert.equal(result.processedCount, 2);
  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].descricaoProduto, "Produto 78912345");
  assert.ok(queries.some((entry) => entry.sql.includes("INSERT INTO active_ingredients")));
  assert.ok(queries.some((entry) => entry.sql.includes("ON CONFLICT (ean)")));
  assert.ok(queries.some((entry) => Array.isArray(entry.values) && entry.values.includes("[1,2,3,4]")));
  assert.equal(released, true);
});

test("upsertProducts faz rollback quando o insert falha", async (t) => {
  const queries = [];
  let released = false;

  const client = {
    query: async (sql) => {
      queries.push(sql);

      if (sql === "BEGIN" || sql === "ROLLBACK") {
        return {
          rows: [],
        };
      }

      throw new Error("falha no banco");
    },
    release: () => {
      released = true;
    },
  };

  const { upsertProducts } = loadModule(t, "src/modules/products/products.repository.js", {
    mocks: {
      "../../db": {
        pool: {
          connect: async () => client,
        },
      },
    },
  });

  await assert.rejects(() => upsertProducts([
    createPreparedProduct("78912345"),
  ], {
    batchSize: 1,
    returnRows: true,
  }), /falha no banco/);

  assert.deepEqual(queries.slice(0, 3), [
    "BEGIN",
    queries[1],
    "ROLLBACK",
  ]);
  assert.equal(released, true);
});

test("searchProducts executa consulta vetorial e mapeia resultado", async (t) => {
  let receivedQuery = null;
  let receivedValues = null;

  const { searchProducts } = loadModule(t, "src/modules/products/products.repository.js", {
    mocks: {
      "../../db": {
        pool: {
          query: async (query, values) => {
            receivedQuery = query;
            receivedValues = values;

            return {
              rows: [
                {
                  ...createDatabaseRow("78912345"),
                  similarity: "0.91",
                  tokenOverlap: "2",
                  exactEanMatch: 1,
                },
              ],
            };
          },
        },
      },
    },
  });

  const result = await searchProducts({
    embedding: "[0.1,0.2,0.3,0.4]",
    eanFilter: "78912345",
    queryTokens: ["paracetamol"],
    minScore: 0.7,
    limit: 5,
    offset: 20,
    prioritizeLexicalSignals: true,
  });

  assert.ok(receivedQuery.includes("FROM ("));
  assert.ok(receivedQuery.includes("AND EXISTS ("));
  assert.ok(receivedQuery.includes("CASE WHEN $6::boolean THEN \"tokenOverlap\" ELSE 0 END DESC"));
  assert.ok(receivedQuery.includes("similarity DESC"));
  assert.ok(receivedQuery.includes("OFFSET $7"));
  assert.deepEqual(receivedValues, [
    "[0.1,0.2,0.3,0.4]",
    "78912345",
    ["paracetamol"],
    0.7,
    5,
    true,
    20,
  ]);
  assert.equal(result[0].similarity, 0.91);
  assert.equal(result[0].tokenOverlap, 2);
  assert.equal(result[0].exactEanMatch, true);
  assert.equal(result[0].descricaoProduto, "Produto 78912345");
});

test("findProductsByEans busca varios produtos pelo codigo de barras", async (t) => {
  let receivedQuery = null;
  let receivedValues = null;

  const { findProductsByEans } = loadModule(t, "src/modules/products/products.repository.js", {
    mocks: {
      "../../db": {
        pool: {
          query: async (query, values) => {
            receivedQuery = query;
            receivedValues = values;

            return {
              rows: [
                createDatabaseRow("78912346"),
                createDatabaseRow("78912345"),
              ],
            };
          },
        },
      },
    },
  });

  const result = await findProductsByEans([
    "78912345",
    "78912346",
  ]);

  assert.ok(receivedQuery.includes("WHERE ean = ANY($1::text[])"));
  assert.deepEqual(receivedValues, [[
    "78912345",
    "78912346",
  ]]);
  assert.equal(result.length, 2);
  assert.equal(result[0].ean, "78912346");
  assert.equal(result[1].descricaoProduto, "Produto 78912345");
});

test("listProductsForReprocessing busca produtos em ordem de EAN", async (t) => {
  let receivedQuery = null;
  let receivedValues = null;

  const { listProductsForReprocessing } = loadModule(t, "src/modules/products/products.repository.js", {
    mocks: {
      "../../db": {
        pool: {
          query: async (query, values) => {
            receivedQuery = query;
            receivedValues = values;

            return {
              rows: [
                {
                  ean: "78912346",
                  description: "Produto 78912346",
                  activeIngredient: "Paracetamol",
                  classification: "Generico",
                  socialName: null,
                  manufacturer: "EMS",
                  details: null,
                },
              ],
            };
          },
        },
      },
    },
  });

  const result = await listProductsForReprocessing({
    afterEan: "78912345",
    limit: 2,
  });

  assert.ok(receivedQuery.includes("WHERE ($1::text IS NULL OR ean > $1)"));
  assert.ok(receivedQuery.includes("ORDER BY ean ASC"));
  assert.deepEqual(receivedValues, [
    "78912345",
    2,
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].ean, "78912346");
});
