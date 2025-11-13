const mongoose = require("mongoose");
const { Types } = mongoose;
const Review = require("../models/Review");
const Product = require("../models/Product");
const Order = require("../models/Order");
const User = require("../models/User");

const ALLOWED_TYPES = ["positive", "neutral", "negative"];

const toObjectIdIfPossible = (v) => {
  try {
    if (typeof v === "string" && mongoose.isValidObjectId(v)) {
      return new Types.ObjectId(v);
    }
    return v;
  } catch (e) {
    return v;
  }
};

// helper validate single rating
const validateRatingField = (val) => {
  const n = Number(val);
  return Number.isFinite(n) && n >= 1 && n <= 5;
};

// ----------------- CREATE REVIEW -----------------
exports.createReview = async (req, res, next) => {
  try {
    const {
      orderId,
      productId,
      rating,
      rating1,
      rating2,
      rating3,
      comment,
      type,
    } = req.body;
    const reviewer = req.user && req.user._id;

    if (!orderId || !productId || rating == null) {
      return res
        .status(400)
        .json({ message: "orderId, productId and rating required" });
    }

    // Validate main rating
    const r = Number(rating);
    if (!validateRatingField(r)) {
      return res
        .status(400)
        .json({ message: "rating must be number between 1 and 5" });
    }

    // Validate rating1..3 (model requires them: so they must be provided)
    if (rating1 == null || rating2 == null || rating3 == null) {
      return res
        .status(400)
        .json({ message: "rating1, rating2 and rating3 are required" });
    }
    const r1 = Number(rating1);
    const r2 = Number(rating2);
    const r3 = Number(rating3);
    if (
      !validateRatingField(r1) ||
      !validateRatingField(r2) ||
      !validateRatingField(r3)
    ) {
      return res
        .status(400)
        .json({ message: "rating1/2/3 must be numbers between 1 and 5" });
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
      rating1: r1,
      rating2: r2,
      rating3: r3,
      comment: comment ? String(comment).trim() : "",
      type: finalType,
    };

    const newReview = await Review.create(reviewDoc);

    // Recompute product stats (agg) -> include avg for rating and rating1..3
    try {
      const prodOid = toObjectIdIfPossible(productId);
      const agg = await Review.aggregate([
        { $match: { product: prodOid } },
        {
          $group: {
            _id: "$product",
            avgRating: { $avg: "$rating" },
            avgRating1: { $avg: "$rating1" },
            avgRating2: { $avg: "$rating2" },
            avgRating3: { $avg: "$rating3" },
            count: { $sum: 1 },
          },
        },
      ]);
      if (agg && agg.length) {
        const a = agg[0];
        await Product.findByIdAndUpdate(productId, {
          averageRating: Number(a.avgRating.toFixed(2)),
          averageRating1: Number(a.avgRating1.toFixed(2)),
          averageRating2: Number(a.avgRating2.toFixed(2)),
          averageRating3: Number(a.avgRating3.toFixed(2)),
          ratingCount: a.count,
        }).catch(() => {});
      } else {
        await Product.findByIdAndUpdate(productId, {
          averageRating: r,
          averageRating1: r1,
          averageRating2: r2,
          averageRating3: r3,
          ratingCount: 1,
        }).catch(() => {});
      }
    } catch (e) {
      // ignore aggregation error
      console.error("Product agg error:", e);
    }

    // Recompute seller reputation (agg) -> include avg for rating and rating1..3
    if (sellerId) {
      try {
        const sAgg = await Review.aggregate([
          { $match: { seller: toObjectIdIfPossible(sellerId) } },
          {
            $group: {
              _id: "$seller",
              avgRating: { $avg: "$rating" },
              avgRating1: { $avg: "$rating1" },
              avgRating2: { $avg: "$rating2" },
              avgRating3: { $avg: "$rating3" },
              total: { $sum: 1 },
            },
          },
        ]);
        if (sAgg && sAgg.length) {
          await User.findByIdAndUpdate(sellerId, {
            reputationScore: Number(sAgg[0].avgRating.toFixed(2)),
            // optionally store the breakdown if you have schema fields for them
            // reputationRating1: Number(sAgg[0].avgRating1.toFixed(2)),
            // ...
          }).catch(() => {});
        }
      } catch (e) {
        console.error("Seller agg error:", e);
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

    // validate productId
    const prodMatch = mongoose.isValidObjectId(productId)
      ? new Types.ObjectId(productId)
      : productId;

    const rows = await Review.find({ product: prodMatch })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("reviewer", "username")
      .lean();

    const total = await Review.countDocuments({ product: prodMatch });

    // compute avg for rating and rating1..3
    let avgRating = null,
      avgRating1 = null,
      avgRating2 = null,
      avgRating3 = null;
    try {
      const agg = await Review.aggregate([
        { $match: { product: prodMatch } },
        {
          $group: {
            _id: "$product",
            avgRating: { $avg: "$rating" },
            avgRating1: { $avg: "$rating1" },
            avgRating2: { $avg: "$rating2" },
            avgRating3: { $avg: "$rating3" },
            count: { $sum: 1 },
          },
        },
      ]);
      if (agg && agg.length) {
        avgRating =
          agg[0].avgRating != null ? Number(agg[0].avgRating.toFixed(2)) : null;
        avgRating1 =
          agg[0].avgRating1 != null
            ? Number(agg[0].avgRating1.toFixed(2))
            : null;
        avgRating2 =
          agg[0].avgRating2 != null
            ? Number(agg[0].avgRating2.toFixed(2))
            : null;
        avgRating3 =
          agg[0].avgRating3 != null
            ? Number(agg[0].avgRating3.toFixed(2))
            : null;
      }
    } catch (e) {
      console.error("listReviewsByProduct agg error:", e);
    }

    const dataWithType = rows.map((r) => ({
      ...r,
      type: r.type || null,
      rating1: r.rating1 ?? null,
      rating2: r.rating2 ?? null,
      rating3: r.rating3 ?? null,
    }));

    // update product stats best-effort
    if (avgRating !== null) {
      await Product.findByIdAndUpdate(productId, {
        averageRating: avgRating,
        averageRating1: avgRating1,
        averageRating2: avgRating2,
        averageRating3: avgRating3,
        ratingCount: total,
      }).catch(() => {});
    }

    return res.json({
      data: dataWithType,
      page,
      limit,
      total,
      averageRate: avgRating,
      averageRate1: avgRating1,
      averageRate2: avgRating2,
      averageRate3: avgRating3,
    });
  } catch (err) {
    return next(err);
  }
};

// Get review detail
exports.getReviewDetail = async (req, res, next) => {
  try {
    const id = req.params.id;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid review id" });
    }

    const r = await Review.findById(id)
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

    if (!mongoose.isValidObjectId(sellerId)) {
      return res.status(400).json({ message: "Invalid sellerId" });
    }

    const sellerMatchValue = new Types.ObjectId(sellerId);

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

    let avgRating = null,
      avgRating1 = null,
      avgRating2 = null,
      avgRating3 = null,
      positiveCount = 0,
      totalCount = totalFromCount;

    try {
      const agg = await Review.aggregate([
        { $match: { seller: sellerMatchValue } },
        {
          $group: {
            _id: "$seller",
            avgRating: { $avg: "$rating" },
            avgRating1: { $avg: "$rating1" },
            avgRating2: { $avg: "$rating2" },
            avgRating3: { $avg: "$rating3" },
            total: { $sum: 1 },
            positive: {
              $sum: { $cond: [{ $eq: ["$type", "positive"] }, 1, 0] },
            },
          },
        },
      ]);

      if (Array.isArray(agg) && agg.length > 0) {
        const a = agg[0];
        avgRating = a.avgRating != null ? Number(a.avgRating.toFixed(2)) : null;
        avgRating1 =
          a.avgRating1 != null ? Number(a.avgRating1.toFixed(2)) : null;
        avgRating2 =
          a.avgRating2 != null ? Number(a.avgRating2.toFixed(2)) : null;
        avgRating3 =
          a.avgRating3 != null ? Number(a.avgRating3.toFixed(2)) : null;
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
      rating1: r.rating1 ?? null,
      rating2: r.rating2 ?? null,
      rating3: r.rating3 ?? null,
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
      averageRate1: avgRating1,
      averageRate2: avgRating2,
      averageRate3: avgRating3,
      positiveRate,
      positiveCount,
    });
  } catch (err) {
    return next(err);
  }
};
