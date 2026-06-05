function errorHandler(error, _req, res, _next) {
  const message = error.message || "Erro interno do servidor.";
  const status = Number.isInteger(error.statusCode)
    ? error.statusCode
    : /query|produto|products|tokens|minScore|ean/i.test(message) ? 400 : 500;

  res.status(status).json({
    error: message,
  });
}

module.exports = {
  errorHandler,
};
