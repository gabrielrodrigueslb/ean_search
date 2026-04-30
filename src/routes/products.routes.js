const express = require("express");
const { ProductsController } = require("../controllers/products.controller");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();
const controller = new ProductsController();

router.get("/", asyncHandler(controller.search));
router.get("/ean/:ean", asyncHandler(controller.getByEan));

module.exports = router;
