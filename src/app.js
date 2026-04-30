const express = require("express");
const importRoutes = require("./routes/import.routes");
const productRoutes = require("./routes/products.routes");
const reviewRoutes = require("./routes/reviews.routes");
const { errorHandler } = require("./middleware/errorHandler");
const { requestLogger } = require("./middleware/requestLogger");

function createApp() {
  const app = express();

  app.use(requestLogger);
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/imports", importRoutes);
  app.use("/products", productRoutes);
  app.use("/reviews", reviewRoutes);

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
