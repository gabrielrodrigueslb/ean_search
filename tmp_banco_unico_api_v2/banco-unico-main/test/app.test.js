const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const { loadModule } = require("./helpers/load-module");

function runApp(app, url) {
  return new Promise((resolve, reject) => {
    const request = {
      method: "GET",
      url,
      originalUrl: url,
      headers: {},
    };
    const response = {
      statusCode: 200,
      payload: null,
      setHeader() {},
      getHeader() {
        return undefined;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        resolve({
          statusCode: this.statusCode,
          payload,
        });
        return this;
      },
      end() {
        resolve({
          statusCode: this.statusCode,
          payload: this.payload,
        });
      },
    };

    app.handle(request, response, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        statusCode: response.statusCode,
        payload: response.payload,
      });
    });
  });
}

test("createApp monta rotas, notFoundHandler e errorHandler", async (t) => {
  const router = express.Router();

  router.get("/ok", (_req, res) => {
    res.json({
      ok: true,
    });
  });

  router.get("/boom", (_req, _res, next) => {
    next(new Error("falha inesperada"));
  });

  const { createApp } = loadModule(t, "src/app.js", {
    mocks: {
      "./routes": router,
    },
  });

  const app = createApp();
  const okResponse = await runApp(app, "/ok");
  const notFoundResponse = await runApp(app, "/missing");
  const boomResponse = await runApp(app, "/boom");

  assert.deepEqual(okResponse.payload, {
    ok: true,
  });
  assert.equal(notFoundResponse.statusCode, 404);
  assert.deepEqual(notFoundResponse.payload, {
    error: "Rota nao encontrada.",
  });
  assert.equal(boomResponse.statusCode, 500);
  assert.deepEqual(boomResponse.payload, {
    error: "falha inesperada",
  });
});
