const Product = require("../models/Product");

exports.createProduct = async (req, res, next) => {
  try {
    const { title, description, price, stock, imageUrl } = req.body;
    const sellerId = req.user ? req.user._id : req.body.sellerId; // allow sellerId in body for tests if no auth
    if (!sellerId)
      return res.status(400).json({ message: "sellerId required" });
    if (!title || price == null)
      return res.status(400).json({ message: "title and price required" });

    const p = new Product({
      sellerId,
      title,
      description,
      price,
      imageUrl: imageUrl || "",
      stock: stock || 0,
    });
    await p.save();
    return res.status(201).json({ data: p });
  } catch (err) {
    next(err);
  }
};

exports.getProduct = async (req, res, next) => {
  try {
    const p = await Product.findById(req.params.productId).lean();
    if (!p) return res.status(404).json({ message: "Product not found" });
    return res.json({ data: p });
  } catch (err) {
    next(err);
  }
};

exports.listProducts = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const skip = (page - 1) * limit;
    const products = await Product.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    return res.json({ data: products });
  } catch (err) {
    next(err);
  }
};
