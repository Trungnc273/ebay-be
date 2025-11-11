// src/controllers/complaintController.js
const mongoose = require("mongoose");
const Complaint = require("../models/Complaint");
const Order = require("../models/Order");
const User = require("../models/User");

const formatDateTime = (date) => {
  if (!date) return null;
  const d = new Date(date);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  const hours = String(d.getUTCHours()).padStart(2, "0");
  const minutes = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
};

// ------------------ Create Complaint ------------------
const createComplaint = async (req, res) => {
  try {
    const { orderId, sellerId, reason, content, attachments } = req.body;
    if (!orderId || !sellerId || !reason || !content) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (
      !mongoose.isValidObjectId(orderId) ||
      !mongoose.isValidObjectId(sellerId)
    ) {
      return res.status(400).json({ message: "Invalid orderId or sellerId" });
    }

    const order = await Order.findById(orderId).lean();
    if (!order) return res.status(404).json({ message: "Order not found" });

    // optional strict check: seller must match order.seller
    if (order.seller && order.seller.toString() !== sellerId) {
      return res
        .status(400)
        .json({ message: "sellerId does not match order.seller" });
    }

    const doc = {
      order: orderId,
      buyer: req.user._id,
      seller: sellerId,
      reason,
      content,
      attachments: Array.isArray(attachments)
        ? attachments
        : attachments
        ? [attachments]
        : [],
      history: [
        { actionBy: req.user._id, action: "created", note: "", at: new Date() },
      ],
      status: "open",
    };

    const c = await Complaint.create(doc);

    const populated = await Complaint.findById(c._id)
      .populate("order")
      .populate("buyer", "username")
      .populate("seller", "username")
      .lean();

    return res.status(201).json({
      data: {
        id: populated._id,
        order: populated.order || null,
        buyer: populated.buyer || null,
        seller: populated.seller || null,
        reason: populated.reason,
        content: populated.content,
        attachments: populated.attachments || [],
        status: populated.status,
        createdAt: formatDateTime(populated.createdAt),
      },
    });
  } catch (err) {
    console.error("createComplaint err:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// ------------------ Get My Complaints ------------------
const getMyComplaints = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const rows = await Complaint.find({ buyer: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("order")
      .populate("seller", "username")
      .lean();

    const data = rows.map((r) => ({
      id: r._id,
      orderId: r.order?._id || null,
      seller: r.seller || null,
      reason: r.reason,
      content: r.content,
      attachments: r.attachments || [],
      status: r.status,
      createdAt: formatDateTime(r.createdAt),
      updatedAt: formatDateTime(r.updatedAt),
    }));

    return res.json({ data, page, limit });
  } catch (err) {
    console.error("getMyComplaints err:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// ------------------ Get Complaint Detail (by req.params.id) ------------------
const getComplaintDetail = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: "Missing id param" });
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ message: "Invalid id" });

    const r = await Complaint.findOne({ _id: id })
      .populate("order")
      .populate("buyer", "username")
      .populate("seller", "username")
      .lean();

    if (!r) return res.status(404).json({ message: "Not found" });

    const me = req.user;
    const isBuyer =
      r.buyer &&
      (r.buyer._id
        ? r.buyer._id.toString() === me._id.toString()
        : r.buyer.toString() === me._id.toString());
    const isSeller =
      r.seller &&
      (r.seller._id
        ? r.seller._id.toString() === me._id.toString()
        : r.seller.toString() === me._id.toString());
    const isAdmin = me.role === "admin";

    if (!isBuyer && !isSeller && !isAdmin)
      return res.status(403).json({ message: "Forbidden" });

    return res.json({
      data: {
        id: r._id,
        order: r.order?._id || null,
        buyer: r.buyer || null,
        seller: r.seller || null,
        reason: r.reason,
        content: r.content,
        attachments: r.attachments || [],
        status: r.status,
        history: (r.history || []).map((h) => ({
          actionBy: h.actionBy,
          action: h.action,
          note: h.note,
          at: formatDateTime(h.at),
        })),
        createdAt: formatDateTime(r.createdAt),
        updatedAt: formatDateTime(r.updatedAt),
      },
    });
  } catch (err) {
    console.error("getComplaintDetail err:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// ------------------ Get Seller Complaints ------------------
const getSellerComplaints = async (req, res) => {
  try {
    if (req.user.role !== "seller" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const query = { seller: req.user._id };
    if (req.query.status) query.status = req.query.status;

    const rows = await Complaint.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("order")
      .populate("buyer", "username")
      .lean();

    const data = rows.map((r) => ({
      id: r._id,
      orderId: r.order?._id || null,
      buyer: r.buyer || null,
      reason: r.reason,
      content: r.content,
      status: r.status,
      createdAt: formatDateTime(r.createdAt),
      updatedAt: formatDateTime(r.updatedAt),
    }));

    return res.json({ data, page, limit });
  } catch (err) {
    console.error("getSellerComplaints err:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// ------------------ Seller handle (agree/disagree) ------------------
const handleComplaintBySeller = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: "Missing id param" });
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ message: "Invalid id" });

    const { action, note } = req.body;
    if (!action || (action !== "agreed" && action !== "rejected")) {
      return res.status(400).json({ message: "Invalid action" });
    }

    const complaint = await Complaint.findOne({ _id: id });
    if (!complaint) return res.status(404).json({ message: "Not found" });

    if (
      complaint.seller.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    complaint.status = action === "agreed" ? "agreed" : "rejected";
    complaint.history.push({
      actionBy: req.user._id,
      action,
      note: note || "",
      at: new Date(),
    });
    await complaint.save();

    return res.json({ data: { id: complaint._id, status: complaint.status } });
  } catch (err) {
    console.error("handleComplaintBySeller err:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// ------------------ Buyer send to admin ------------------
const sendToAdmin = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: "Missing id param" });
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ message: "Invalid id" });

    const complaint = await Complaint.findOne({ _id: id });
    if (!complaint) return res.status(404).json({ message: "Not found" });

    if (complaint.buyer.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Unauthorized" });

    complaint.status = "sent_to_admin";
    complaint.history.push({
      actionBy: req.user._id,
      action: "sent_to_admin",
      note: req.body.note || "",
      at: new Date(),
    });
    await complaint.save();

    return res.json({ data: { id: complaint._id, status: complaint.status } });
  } catch (err) {
    console.error("sendToAdmin err:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// ------------------ Admin: list sent complaints ------------------
const adminGetAllFromBuyers = async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ message: "Forbidden" });

    const rows = await Complaint.find({ status: "sent_to_admin" })
      .sort({ updatedAt: -1 })
      .limit(200)
      .populate("order")
      .populate("buyer", "username")
      .populate("seller", "username")
      .lean();

    const data = rows.map((r) => ({
      id: r._id,
      order: r.order || null,
      buyer: r.buyer || null,
      seller: r.seller || null,
      reason: r.reason,
      content: r.content,
      status: r.status,
      createdAt: formatDateTime(r.createdAt),
    }));

    return res.json({ data });
  } catch (err) {
    console.error("adminGetAllFromBuyers err:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

// ------------------ Admin handle ------------------
const adminHandle = async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ message: "Forbidden" });

    const id = req.params.id;
    if (!id) return res.status(400).json({ message: "Missing id param" });
    if (!mongoose.isValidObjectId(id))
      return res.status(400).json({ message: "Invalid id" });

    const { action, note } = req.body;
    if (!action || (action !== "agreed" && action !== "rejected")) {
      return res.status(400).json({ message: "Invalid action" });
    }

    const complaint = await Complaint.findOne({ _id: id });
    if (!complaint) return res.status(404).json({ message: "Not found" });

    complaint.status = action === "agreed" ? "agreed" : "rejected";
    complaint.history.push({
      actionBy: req.user._id,
      action: `admin_${action}`,
      note: note || "",
      at: new Date(),
    });
    await complaint.save();

    return res.json({ data: { id: complaint._id, status: complaint.status } });
  } catch (err) {
    console.error("adminHandle err:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

module.exports = {
  createComplaint,
  getMyComplaints,
  getComplaintDetail,
  getSellerComplaints,
  handleComplaintBySeller,
  sendToAdmin,
  adminGetAllFromBuyers,
  adminHandle,
};
