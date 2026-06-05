const test = require("node:test");
const assert = require("node:assert/strict");

const { loadModule } = require("./helpers/load-module");

test("db cria Pool a partir de connectionString", async (t) => {
  const poolOptions = [];
  let endCalled = false;

  class FakePool {
    constructor(options) {
      poolOptions.push(options);
    }

    async end() {
      endCalled = true;
    }
  }

  const { closePool } = loadModule(t, "src/db.js", {
    mocks: {
      "pg": {
        Pool: FakePool,
      },
      "./config": {
        config: {
          databaseSsl: false,
          database: {
            connectionString: "postgres://postgres:postgres@localhost:5432/banco_unico",
          },
        },
      },
    },
  });

  assert.deepEqual(poolOptions[0], {
    connectionString: "postgres://postgres:postgres@localhost:5432/banco_unico",
    ssl: undefined,
  });

  await closePool();
  assert.equal(endCalled, true);
});

test("db cria Pool a partir de host, porta e credenciais", (t) => {
  const poolOptions = [];

  class FakePool {
    constructor(options) {
      poolOptions.push(options);
    }

    async end() {}
  }

  loadModule(t, "src/db.js", {
    mocks: {
      "pg": {
        Pool: FakePool,
      },
      "./config": {
        config: {
          databaseSsl: true,
          database: {
            host: "localhost",
            port: 5432,
            database: "banco_unico",
            user: "postgres",
            password: "postgres",
          },
        },
      },
    },
  });

  assert.deepEqual(poolOptions[0], {
    host: "localhost",
    port: 5432,
    database: "banco_unico",
    user: "postgres",
    password: "postgres",
    ssl: {
      rejectUnauthorized: false,
    },
  });
});
