function notFoundHandler(_req, res) {
  res.status(404).json({
    error: "Rota nao encontrada.",
  });
}

module.exports = {
  notFoundHandler,
};
