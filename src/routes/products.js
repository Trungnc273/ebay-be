const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const ctrl = require("../controllers/productController");

router.post("/", auth, ctrl.createProduct); // seller creates product
router.get("/:productId", ctrl.getProduct);
router.get("/", ctrl.listProducts);

module.exports = router;
