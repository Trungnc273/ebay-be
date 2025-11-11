const mongoose = require("mongoose");
const { Types } = mongoose;
const Review = require("../models/Review");
const Product = require("../models/Product");
const Order = require("../models/Order");
const User = require("../models/User");

exports.createReview = async (req, res, next) => {
  try {
    const { orderId, productId, rating, comment } = req.body;
    const reviewer = req.user && req.user._id;

    if (!orderId || !productId || rating == null) {
      return res
        .status(400)
        .json({ message: "orderId, productId and rating required" });
    }

    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5) {
      return res
        .status(400)
        .json({ message: "rating must be number between 1 and 5" });
    }

    // Ensure order exists
    const order = await Order.findById(orderId).lean();
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Ensure reviewer is buyer of order
    if (!reviewer || order.buyer.toString() !== reviewer.toString()) {
      return res
        .status(403)
        .json({ message: "Only buyer of the order can leave a review" });
    }

    // Ensure product is part of the order
    const item = (order.items || []).find((it) => {
      const prodId = (it.product || it.productId)?.toString();
      return prodId === productId.toString();
    });
    if (!item)
      return res
        .status(400)
        .json({ message: "Product not found in the given order" });

    // Prevent duplicate review by same reviewer for same product+order
    const exists = await Review.findOne({
      order: orderId,
      product: productId,
      reviewer,
    }).lean();
    if (exists)
      return res.status(409).json({
        message: "Review already exists for this product/order by you",
      });

    // Determine seller
    let sellerId = order.seller || null;
    if (!sellerId) {
      const prod = await Product.findById(productId).lean();
      if (!prod) return res.status(404).json({ message: "Product not found" });
      sellerId = prod.seller || null;
    }

    const reviewDoc = {
      order: orderId,
      product: productId,
      reviewer,
      seller: sellerId,
      rating: r,
      comment: comment ? String(comment).trim() : "",
    };

    const newReview = await Review.create(reviewDoc);

    const toObjectIdIfNeeded = (val) => {
      if (!val) return val;
      if (typeof val === "string") return new Types.ObjectId(val);
      return val;
    };

    // Recompute product stats
    const agg = await Review.aggregate([
      { $match: { product: toObjectIdIfNeeded(productId) } },
      {
        $group: {
          _id: "$product",
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]);
    if (agg && agg.length) {
      const { avgRating, count } = agg[0];
      await Product.findByIdAndUpdate(productId, {
        averageRating: avgRating,
        ratingCount: count,
      }).catch(() => {});
    } else {
      await Product.findByIdAndUpdate(productId, {
        averageRating: r,
        ratingCount: 1,
      }).catch(() => {});
    }

    // Recompute seller reputation
    if (sellerId) {
      const sAgg = await Review.aggregate([
        { $match: { seller: toObjectIdIfNeeded(sellerId) } },
        { $group: { _id: "$seller", avgRating: { $avg: "$rating" } } },
      ]);
      if (sAgg && sAgg.length) {
        await User.findByIdAndUpdate(sellerId, {
          reputationScore: sAgg[0].avgRating,
        }).catch(() => {});
      }
    }

    const populated = await Review.findById(newReview._id)
      .populate("product", "title")
      .populate("reviewer", "username")
      .populate("seller", "username")
      .lean();

    return res.status(201).json({ data: populated });
  } catch (err) {
    return next(err);
  }
};

// List reviews by product
exports.listReviewsByProduct = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;

    const rows = await Review.find({ product: productId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("reviewer", "username")
      .lean();

    const total = await Review.countDocuments({ product: productId });

    return res.json({ data: rows, page, limit, total });
  } catch (err) {
    return next(err);
  }
};

// Get review detail
exports.getReviewDetail = async (req, res, next) => {
  try {
    const id = req.params.id;

    const r = await Review.find({ _id: id })
      .populate("product", "title description")
      .populate("reviewer", "username email")
      .populate("seller", "username")
      .lean();

    if (!r) return res.status(404).json({ message: "Review not found" });

    return res.json({ data: r });
  } catch (err) {
    return next(err);
  }
};

exports.listReviewsBySeller = async (req, res, next) => {
  try {
    const { sellerId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 200);
    const skip = (page - 1) * limit;

    // reviews list
    const rows = await Review.find({ seller: sellerId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("product", "title")
      .populate("reviewer", "username")
      .lean();

    // total count
    const total = await Review.countDocuments({ seller: sellerId });

    // aggregate average rating for seller (if no docs -> null)
    const agg = await Review.aggregate([
      { $match: { seller: sellerId } },
      {
        $group: {
          _id: "$seller",
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]);
    const avgRating = agg && agg.length ? agg[0].avgRating : null;

    return res.json({
      data: rows,
      page,
      limit,
      total,
      avgRating,
    });
  } catch (err) {
    return next(err);
  }
};
