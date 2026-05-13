import express from "express";
import multer from "multer";
import { ImportController } from "../controllers/import.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const controller = new ImportController();

router.post("/csv", upload.single("file"), asyncHandler(controller.importCsv));
router.post("/json", asyncHandler(controller.importJson));
router.post("/trier", asyncHandler(controller.importTrier));
router.post("/vetor", asyncHandler(controller.importVetor));
router.post("/vtex", asyncHandler(controller.importVtex));
router.post("/banco-alpha", asyncHandler(controller.importPostgresEmbalagens));
router.post("/postgres-embalagens", asyncHandler(controller.importPostgresEmbalagens));
router.get("/:id", asyncHandler(controller.getImportacao));

export default router;
