// src/routes/reviews.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const ctrl = require("../controllers/reviewController");

// Tạo review (Buyer)
router.post("/", auth, ctrl.createReview);

// Lấy tất cả review của 1 sản phẩm (Buyer / Seller / Public)
router.get("/product/:productId", ctrl.listReviewsByProduct);

// Lấy chi tiết 1 review cụ thể
router.get("/:id", ctrl.getReviewDetail);

module.exports = router;
