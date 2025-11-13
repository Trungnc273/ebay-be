const mongoose = require("mongoose");
const { Types } = mongoose;
const Review = require("../models/Review");
const Product = require("../models/Product");
const Order = require("../models/Order");
const User = require("../models/User");

const ALLOWED_TYPES = ["positive", "neutral", "negative"];

const toObjectIdIfPossible = (v) => {
  try {
    return typeof v === "string" ? Types.ObjectId(v) : v;
  } catch (e) {
    return v;
  }
};

// ----------------- CREATE REVIEW -----------------
exports.createReview = async (req, res, next) => {
  try {
    const { orderId, productId, rating, comment, type } = req.body;
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

    // validate type if provided
    let finalType = null;
    if (type) {
      if (!ALLOWED_TYPES.includes(type)) {
        return res
          .status(400)
          .json({ message: `type must be one of ${ALLOWED_TYPES.join(",")}` });
      }
      finalType = type;
    } else {
      // derive from rating
      finalType = r >= 4 ? "positive" : r === 3 ? "neutral" : "negative";
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

    // Prevent duplicate review
    const exists = await Review.findOne({
      order: orderId,
      product: productId,
      reviewer,
    }).lean();
    if (exists)
      return res.status(409).json({
        message: "Review already exists for this product/order by you",
      });

    // Determine seller (order.seller preferred)
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
      type: finalType,
    };

    const newReview = await Review.create(reviewDoc);

    // Recompute product stats (agg)
    try {
      const prodOid = toObjectIdIfPossible(productId);
      const agg = await Review.aggregate([
        { $match: { product: prodOid } },
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
          averageRating: Number(avgRating.toFixed(2)),
          ratingCount: count,
        }).catch(() => {});
      } else {
        await Product.findByIdAndUpdate(productId, {
          averageRating: r,
          ratingCount: 1,
        }).catch(() => {});
      }
    } catch (e) {
      // ignore aggregation error
    }

    // Recompute seller reputation (agg)
    if (sellerId) {
      try {
        const sAgg = await Review.aggregate([
          { $match: { seller: toObjectIdIfPossible(sellerId) } },
          {
            $group: {
              _id: "$seller",
              avgRating: { $avg: "$rating" },
              total: { $sum: 1 },
            },
          },
        ]);
        if (sAgg && sAgg.length) {
          await User.findByIdAndUpdate(sellerId, {
            reputationScore: Number(sAgg[0].avgRating.toFixed(2)),
          }).catch(() => {});
        }
      } catch (e) {
        // ignore
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
// ----------------- LIST REVIEWS BY PRODUCT -----------------
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

    // compute avg
    let avgRating = null;
    try {
      const agg = await Review.aggregate([
        { $match: { product: toObjectIdIfPossible(productId) } },
        {
          $group: {
            _id: "$product",
            avgRating: { $avg: "$rating" },
            count: { $sum: 1 },
          },
        },
      ]);
      if (agg && agg.length) avgRating = Number(agg[0].avgRating.toFixed(2));
    } catch (e) {
      // ignore
    }

    const dataWithType = rows.map((r) => ({
      ...r,
      type: r.type || null,
      averageRate: avgRating,
    }));

    // update product stats best-effort
    if (avgRating !== null) {
      await Product.findByIdAndUpdate(productId, {
        averageRating: avgRating,
        ratingCount: total,
      }).catch(() => {});
    }

    return res.json({
      data: dataWithType,
      page,
      limit,
      total,
      averageRate: avgRating,
    });
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

// ----------------- LIST REVIEWS BY SELLER -----------------
exports.listReviewsBySeller = async (req, res, next) => {
  try {
    const { sellerId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 200);
    const skip = (page - 1) * limit;

    // nếu muốn strict: trả 400 ngay nếu sellerId không phải ObjectId
    if (!mongoose.isValidObjectId(sellerId)) {
      return res.status(400).json({ message: "Invalid sellerId" });
    }

    // CHÚ Ý: phải dùng `new` với Types.ObjectId
    const sellerMatchValue = new mongoose.Types.ObjectId(sellerId);

    // dùng cùng một kiểu (ObjectId) cho find/count/aggregate để nhất quán
    const rows = await Review.find({ seller: sellerMatchValue })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("product", "title")
      .populate("reviewer", "username")
      .lean();

    const totalFromCount = await Review.countDocuments({
      seller: sellerMatchValue,
    });

    let avgRating = null;
    let positiveCount = 0;
    let totalCount = totalFromCount;

    try {
      const agg = await Review.aggregate([
        { $match: { seller: sellerMatchValue } },
        {
          $group: {
            _id: "$seller",
            avgRating: { $avg: "$rating" },
            total: { $sum: 1 },
            positive: {
              $sum: {
                $cond: [{ $eq: ["$type", "positive"] }, 1, 0],
              },
            },
          },
        },
      ]);

      if (Array.isArray(agg) && agg.length > 0) {
        const a = agg[0];
        avgRating =
          typeof a.avgRating === "number"
            ? Number(a.avgRating.toFixed(2))
            : null;
        positiveCount = Number(a.positive || 0);
        totalCount = Number(a.total || totalFromCount);
      }
    } catch (e) {
      console.error("Aggregation error in listReviewsBySeller:", e);
    }

    const positiveRate =
      totalCount > 0
        ? Number(((positiveCount / totalCount) * 100).toFixed(2))
        : null;

    const dataWithType = rows.map((r) => ({
      ...r,
      type: r.type || null,
    }));

    if (avgRating !== null) {
      User.findByIdAndUpdate(sellerId, { reputationScore: avgRating }).catch(
        () => {}
      );
    }

    return res.json({
      data: dataWithType,
      page,
      limit,
      total: totalCount,
      averageRate: avgRating,
      positiveRate,
      positiveCount,
    });
  } catch (err) {
    return next(err);
  }
};
