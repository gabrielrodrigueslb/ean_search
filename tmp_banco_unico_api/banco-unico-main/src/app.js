const express = require("express");

const routes = require("./routes");
const { errorHandler } = require("./shared/middlewares/error-handler");
const { notFoundHandler } = require("./shared/middlewares/not-found-handler");

function createApp() {
  const app = express();

  app.use(express.json({ limit: "2mb" }));
  app.use(routes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp,
};
