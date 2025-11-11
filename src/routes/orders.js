const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const ctrl = require("../controllers/orderController");

router.post("/", auth, ctrl.createOrder); // create order (buyer)
router.get("/:id", auth, ctrl.getOrder);
router.get("/", auth, ctrl.listOrdersForUser); // ?userId or auth user

module.exports = router;
