const express = require("express");

const healthRoutes = require("./health.routes");
const productsRoutes = require("./products.routes");

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/api/products", productsRoutes);

module.exports = router;
