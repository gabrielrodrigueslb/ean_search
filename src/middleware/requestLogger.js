const { logger } = require("../utils/logger");

function requestLogger(req, res, next) {
  const startedAt = Date.now();

  logger.info("Requisicao recebida", {
    method: req.method,
    path: req.originalUrl,
  });

  res.on("finish", () => {
    logger.info("Requisicao finalizada", {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration_ms: Date.now() - startedAt,
    });
  });

  next();
}

module.exports = { requestLogger };
