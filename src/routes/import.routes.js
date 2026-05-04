const express = require("express");
const multer = require("multer");
const { ImportController } = require("../controllers/import.controller");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const controller = new ImportController();

router.post("/csv", upload.single("file"), asyncHandler(controller.importCsv));
router.post("/json", asyncHandler(controller.importJson));
router.post("/trier", asyncHandler(controller.importTrier));
router.post("/vetor", asyncHandler(controller.importVetor));
router.get("/:id", asyncHandler(controller.getImportacao));

module.exports = router;
