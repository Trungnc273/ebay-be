// src/routes/complaints.js
const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const ctrl = require("../controllers/complaintController");

// Buyer
router.post("/", auth, ctrl.createComplaint); // create complaint
router.get("/my", auth, ctrl.getMyComplaints); // list my complaints

// Seller (static first to avoid conflict with :id)
router.get("/seller/all", auth, ctrl.getSellerComplaints); // seller list
router.post("/seller/:id/handle", auth, ctrl.handleComplaintBySeller); // seller handles one

// Buyer actions
router.post("/:id/send-to-admin", auth, ctrl.sendToAdmin); // buyer sends to admin

// Complaint detail (dynamic) - must come after static routes
router.get("/:id", auth, ctrl.getComplaintDetail);

// Admin
router.get("/admin/sent", auth, ctrl.adminGetAllFromBuyers);
router.post("/admin/:id/handle", auth, ctrl.adminHandle);

module.exports = router;
