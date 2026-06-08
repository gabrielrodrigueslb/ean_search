import express from "express";
import { LookupController } from "../controllers/lookup.controller.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();
const controller = new LookupController();

router.get("/", asyncHandler(controller.lookupByEan));
router.post("/", asyncHandler(controller.lookupByEans));
router.get("/ean/:ean", asyncHandler(controller.lookupByEan));
router.post("/eans", asyncHandler(controller.lookupByEans));

export default router;
