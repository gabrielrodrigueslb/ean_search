const express = require("express");
const { ReviewsController } = require("../controllers/reviews.controller");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();
const controller = new ReviewsController();

router.get("/", asyncHandler(controller.list));
router.get("/:id", asyncHandler(controller.getById));
router.post("/:id/approve", asyncHandler(controller.approve));
router.post("/:id/reject", asyncHandler(controller.reject));

module.exports = router;
