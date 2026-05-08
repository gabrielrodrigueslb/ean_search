import { logger } from "../utils/logger.js";
function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  const message = error.message || "Erro interno do servidor.";

  logger.error("Erro na requisicao", {
    method: req.method,
    path: req.originalUrl,
    status,
    error: message,
    details: error.details || null,
  });

  res.status(status).json({
    error: message,
    details: error.details || null,
  });
}

export { errorHandler };