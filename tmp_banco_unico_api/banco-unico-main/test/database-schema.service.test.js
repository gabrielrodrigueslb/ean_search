const test = require("node:test");
const assert = require("node:assert/strict");

const { ensureSchema } = require("../src/modules/database/schema.service");

test("ensureSchema cria extensoes, tabela e indices dentro de transacao", async () => {
  const statements = [];
  let released = false;

  const pool = {
    connect: async () => ({
      query: async (statement) => {
        statements.push(statement);
      },
      release: () => {
        released = true;
      },
    }),
  };

  await ensureSchema(pool, 512);

  assert.equal(statements[0], "BEGIN");
  assert.ok(statements.some((statement) => statement.includes("embedding vector(512) NOT NULL")));
  assert.ok(statements.some((statement) => statement.includes("idx_products_embedding_ivfflat")));
  assert.equal(statements.at(-1), "COMMIT");
  assert.equal(released, true);
});

test("ensureSchema faz rollback quando alguma etapa falha", async () => {
  const statements = [];
  let released = false;

  const pool = {
    connect: async () => ({
      query: async (statement) => {
        statements.push(statement);

        if (statement.includes("CREATE TABLE")) {
          throw new Error("falha ao criar tabela");
        }
      },
      release: () => {
        released = true;
      },
    }),
  };

  await assert.rejects(() => ensureSchema(pool, 256), /falha ao criar tabela/);
  assert.equal(statements[0], "BEGIN");
  assert.equal(statements.at(-1), "ROLLBACK");
  assert.equal(released, true);
});
