import express from "express";
import multer from "multer";
import { ImportController } from "../controllers/import.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
const controller = new ImportController();
const acceptedCsvFields = ["file", "arquivo", "csv", "upload"];
const rawCsvUpload = express.raw({
  type: ["text/csv", "application/csv", "application/octet-stream", "text/plain"],
  limit: "20mb",
});

function csvUploadMiddleware(req, res, next) {
  if (req.is("multipart/form-data")) {
    return upload.fields(acceptedCsvFields.map((name) => ({ name, maxCount: 1 })))(req, res, next);
  }

  return rawCsvUpload(req, res, next);
}

function normalizeCsvUploadField(req, _res, next) {
  if (req.file) {
    return next();
  }

  const file = acceptedCsvFields
    .map((fieldName) => req.files?.[fieldName]?.[0] || null)
    .find(Boolean);

  if (file) {
    req.file = file;
    return next();
  }

  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    req.file = {
      fieldname: "raw",
      originalname: req.headers["x-file-name"] || "upload.csv",
      encoding: "7bit",
      mimetype: req.headers["content-type"] || "text/csv",
      buffer: req.body,
      size: req.body.length,
    };
  }

  return next();
}

router.post(
  "/csv",
  csvUploadMiddleware,
  normalizeCsvUploadField,
  asyncHandler(controller.importCsv),
);
router.post("/json", asyncHandler(controller.importJson));
router.post("/trier", asyncHandler(controller.importTrier));
router.post("/vetor", asyncHandler(controller.importVetor));
router.post("/vtex", asyncHandler(controller.importVtex));
router.post("/banco-alpha", asyncHandler(controller.importPostgresEmbalagens));
router.post("/postgres-embalagens", asyncHandler(controller.importPostgresEmbalagens));
router.get("/:id", asyncHandler(controller.getImportacao));

export default router;
