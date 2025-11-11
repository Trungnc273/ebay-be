const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  role: { type: String, enum: ["buyer", "seller", "admin"], default: "buyer" },
  passwordHash: String,
  reputationScore: { type: Number, default: 0 }, // computed
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("User", userSchema);
