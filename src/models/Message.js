// src/models/Message.js
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    text: {
      type: String,
      default: "",
      trim: true,
    },
    attachments: [
      {
        url: { type: String },
        type: {
          type: String,
          enum: ["image", "video", "file", "other"],
          default: "other",
        },
      },
    ],
    productRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    deliveredAt: { type: Date },
    seenAt: { type: Date },
  },
  { timestamps: true }
);

messageSchema.index({ conversation: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });

module.exports = mongoose.model("Message", messageSchema);
