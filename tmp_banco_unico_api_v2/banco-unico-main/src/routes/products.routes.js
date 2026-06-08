const express = require("express");

const {
  createProducts,
  getClientSearchProviderContracts,
  getSearchIntegrationContracts,
  searchRegisteredProducts,
  searchRegisteredProductsByEans,
  searchRegisteredProductsBase,
  searchRegisteredProductsForAlpha7,
  searchRegisteredProductsForProvider,
  searchRegisteredProductsForTrier,
  searchRegisteredProductsForVetor,
} = require("../controllers/products.controller");
const { asyncHandler } = require("../shared/utils/async-handler");
const { createTraceLogger, describePayloadShape } = require("../shared/utils/trace-logger");

const router = express.Router();

function traceCreateProductsRoute(req, _res, next) {
  const traceLogger = createTraceLogger({
    requestId: req.headers["x-request-id"],
    flow: "products.create",
  });

  req.requestId = traceLogger.requestId;
  req.traceLogger = traceLogger;

  traceLogger.step("traceCreateProductsRoute", "Entrou na rota POST /api/products.", {
    method: req.method,
    path: req.originalUrl || req.url,
    ...describePayloadShape(req.body),
  });

  next();
}

router.post("/", traceCreateProductsRoute, asyncHandler(createProducts));
router.post("/search", asyncHandler(searchRegisteredProducts));
router.post("/search/base", asyncHandler(searchRegisteredProductsBase));
router.post("/search/eans", asyncHandler(searchRegisteredProductsByEans));
router.get("/search/contracts", asyncHandler(getSearchIntegrationContracts));
router.get("/search/providers/contracts", asyncHandler(getClientSearchProviderContracts));
router.post("/search/providers/:provider", asyncHandler(searchRegisteredProductsForProvider));
router.post("/search/alpha7", asyncHandler(searchRegisteredProductsForAlpha7));
router.post("/search/trier", asyncHandler(searchRegisteredProductsForTrier));
router.post("/search/vetor", asyncHandler(searchRegisteredProductsForVetor));

module.exports = router;
