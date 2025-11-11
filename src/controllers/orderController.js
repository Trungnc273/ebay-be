// src/controllers/orderController.js
const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");

/**
 * Create order
 * Body: { buyerId? (optional, admin), items: [{ productId | product, quantity }] }
 * - Assumes items are from same seller. If mixed sellers, caller should create separate orders.
 */
exports.createOrder = async (req, res, next) => {
  try {
    const { buyerId, items } = req.body;
    const buyer =
      buyerId && req.user && req.user.role === "admin"
        ? buyerId
        : req.user && req.user._id;

    if (!buyer || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "buyer and items required" });
    }

    // normalize product ids from payload
    const productIds = items
      .map((it) => it.productId || it.product)
      .filter(Boolean);

    if (productIds.length === 0) {
      return res.status(400).json({ message: "items must include productId" });
    }

    // validate product existence
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const productMap = {};
    products.forEach((p) => (productMap[p._id.toString()] = p));

    const orderItems = [];
    let total = 0;
    let sellerId = null;

    for (const it of items) {
      const pid = it.productId || it.product;
      const p = productMap[pid];
      if (!p)
        return res.status(400).json({ message: `Product ${pid} not found` });

      if (!sellerId) sellerId = p.sellerId || p.seller || null;
      // If sellerId already set but different, reject (simpler) — avoid cross-seller order
      if (
        sellerId &&
        (p.sellerId || p.seller) &&
        (p.sellerId || p.seller).toString() !== sellerId.toString()
      ) {
        return res.status(400).json({
          message:
            "Items belong to multiple sellers; create separate orders per seller",
        });
      }

      const qty = Number(it.quantity || 1);

      // <-- KEY FIX: use `productId` to match Order model schema
      orderItems.push({
        productId: p._id, // schema requires productId
        title: p.title,
        price: p.price,
        quantity: qty,
      });

      total += (p.price || 0) * qty;
    }

    const orderDoc = {
      buyer,
      seller: sellerId,
      items: orderItems,
      totalAmount: total,
      status: "created",
    };

    const order = await Order.create(orderDoc);

    // Populate using the schema's field name: items.productId
    const populated = await Order.findById(order._id)
      .populate("buyer", "username")
      .populate("seller", "username")
      .populate("items.productId", "title price") // <- note productId
      .lean();

    return res.status(201).json({ data: populated });
  } catch (err) {
    next(err);
  }
};

/**
 * Get order by id (req.params.id)
 */
exports.getOrder = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!id || !mongoose.isValidObjectId(id))
      return res.status(400).json({ message: "Invalid id" });

    const o = await Order.findById(id)
      .populate("buyer", "username")
      .populate("seller", "username")
      .populate("items.product", "title price")
      .lean();

    if (!o) return res.status(404).json({ message: "Order not found" });

    // auth: buyer, seller, admin can view
    const me = req.user;
    const isBuyer =
      o.buyer && o.buyer._id
        ? o.buyer._id.toString() === me._id.toString()
        : o.buyer.toString() === me._id.toString();
    const isSeller =
      o.seller && o.seller._id
        ? o.seller._id.toString() === me._id.toString()
        : o.seller.toString() === me._id.toString();
    if (!isBuyer && !isSeller && me.role !== "admin")
      return res.status(403).json({ message: "Forbidden" });

    return res.json({ data: o });
  } catch (err) {
    next(err);
  }
};

/**
 * List orders for user (buyer or seller). If admin, can pass ?userId=
 */
exports.listOrdersForUser = async (req, res, next) => {
  try {
    const queryUser = req.query.userId;
    const me = req.user;

    let userId;
    if (me.role === "admin" && queryUser) {
      userId = queryUser;
    } else {
      userId = me._id;
    }

    if (!userId) return res.status(400).json({ message: "userId required" });

    const rows = await Order.find({
      $or: [{ buyer: userId }, { seller: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("buyer", "username")
      .populate("seller", "username")
      .populate("items.product", "title price")
      .lean();

    return res.json({ data: rows });
  } catch (err) {
    next(err);
  }
};
