const test = require("node:test");
const assert = require("node:assert/strict");

const { loadModule } = require("./helpers/load-module");

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("server inicializa app, registra sinais e fecha recursos no shutdown", async (t) => {
  const logs = [];
  const registeredSignals = {};
  const exitCodes = [];
  let listenedPort = null;
  let closePoolCalled = false;
  let serverClosed = false;
  let ensureSchemaArgs = null;

  const originalProcessOn = process.on;
  const originalProcessExit = process.exit;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  process.on = (signal, handler) => {
    registeredSignals[signal] = handler;
    return process;
  };

  process.exit = (code) => {
    exitCodes.push(code);
  };

  console.log = (...args) => {
    logs.push(args.join(" "));
  };

  console.error = () => {};

  t.after(() => {
    process.on = originalProcessOn;
    process.exit = originalProcessExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  loadModule(t, "src/server.js", {
    mocks: {
      "./app": {
        createApp: () => ({
          listen(port, callback) {
            listenedPort = port;
            callback();

            return {
              close(closeCallback) {
                serverClosed = true;
                closeCallback();
              },
            };
          },
        }),
      },
      "./config": {
        config: {
          port: 3333,
          vectorDimensions: 512,
          openAiEmbeddingModel: "text-embedding-3-small",
        },
      },
      "./db": {
        pool: "pool-ref",
        closePool: async () => {
          closePoolCalled = true;
        },
      },
      "./modules/database/schema.service": {
        ensureSchema: async (pool, dimensions) => {
          ensureSchemaArgs = [pool, dimensions];
        },
      },
    },
  });

  await flushAsyncWork();

  assert.deepEqual(ensureSchemaArgs, ["pool-ref", 512]);
  assert.equal(listenedPort, 3333);
  assert.ok(logs.some((entry) => entry.includes("embeddings text-embedding-3-small")));
  assert.ok(registeredSignals.SIGINT);
  assert.ok(registeredSignals.SIGTERM);

  registeredSignals.SIGTERM();
  await flushAsyncWork();

  assert.equal(serverClosed, true);
  assert.equal(closePoolCalled, true);
  assert.deepEqual(exitCodes, [0]);
});

test("server encerra com codigo 1 quando bootstrap falha", async (t) => {
  const errors = [];
  const exitCodes = [];

  const originalProcessOn = process.on;
  const originalProcessExit = process.exit;
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  process.on = () => process;
  process.exit = (code) => {
    exitCodes.push(code);
  };
  console.log = () => {};
  console.error = (...args) => {
    errors.push(args);
  };

  t.after(() => {
    process.on = originalProcessOn;
    process.exit = originalProcessExit;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  loadModule(t, "src/server.js", {
    mocks: {
      "./app": {
        createApp: () => ({
          listen() {
            throw new Error("nao deveria iniciar servidor");
          },
        }),
      },
      "./config": {
        config: {
          port: 3333,
          vectorDimensions: 512,
          openAiEmbeddingModel: "text-embedding-3-small",
        },
      },
      "./db": {
        pool: "pool-ref",
        closePool: async () => {},
      },
      "./modules/database/schema.service": {
        ensureSchema: async () => {
          throw new Error("falha ao preparar schema");
        },
      },
    },
  });

  await flushAsyncWork();

  assert.equal(exitCodes[0], 1);
  assert.ok(errors.some((entry) => entry[0].includes("Falha ao iniciar o servidor:")));
  assert.equal(errors[0][1].message, "falha ao preparar schema");
});
