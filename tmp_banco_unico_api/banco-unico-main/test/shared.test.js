const test = require("node:test");
const assert = require("node:assert/strict");

const { errorHandler } = require("../src/shared/middlewares/error-handler");
const { notFoundHandler } = require("../src/shared/middlewares/not-found-handler");
const { asyncHandler } = require("../src/shared/utils/async-handler");

test("errorHandler retorna 400 para erros de validacao conhecidos", () => {
  const response = {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  errorHandler(new Error("Informe o campo query para pesquisar."), {}, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.payload, {
    error: "Informe o campo query para pesquisar.",
  });
});

test("errorHandler retorna 500 para erros genericos", () => {
  const response = {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  errorHandler(new Error("falha inesperada"), {}, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.payload, {
    error: "falha inesperada",
  });
});

test("notFoundHandler responde 404", () => {
  const response = {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  notFoundHandler({}, response);

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.payload, {
    error: "Rota nao encontrada.",
  });
});

test("asyncHandler encaminha rejeicoes para next", async () => {
  const failure = new Error("erro async");
  let receivedError = null;

  const wrappedHandler = asyncHandler(async () => {
    throw failure;
  });

  wrappedHandler({}, {}, (error) => {
    receivedError = error;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(receivedError, failure);
});
