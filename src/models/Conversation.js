const mongoose = require("mongoose");

const convSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now },
  lastMessageAt: { type: Date, default: Date.now },
  meta: { type: Object, default: {} }, // extensible
});

convSchema.index({ participants: 1, lastMessageAt: -1 });

module.exports = mongoose.model("Conversation", convSchema);
