const test = require("node:test");
const assert = require("node:assert/strict");

const { loadModule } = require("./helpers/load-module");

test("getHealthStatus consulta o banco e retorna ok", async (t) => {
  const queries = [];

  const { getHealthStatus } = loadModule(t, "src/modules/health/health.service.js", {
    mocks: {
      "../../db": {
        pool: {
          query: async (sql) => {
            queries.push(sql);
          },
        },
      },
    },
  });

  const result = await getHealthStatus();

  assert.deepEqual(queries, ["SELECT 1"]);
  assert.deepEqual(result, {
    status: "ok",
  });
});

test("getHealth delega ao service e responde json", async (t) => {
  const { getHealth } = loadModule(t, "src/controllers/health.controller.js", {
    mocks: {
      "../modules/health/health.service": {
        getHealthStatus: async () => ({
          status: "ok",
        }),
      },
    },
  });

  const response = {
    payload: null,
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await getHealth({}, response);

  assert.deepEqual(response.payload, {
    status: "ok",
  });
});
