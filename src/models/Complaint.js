const mongoose = require("mongoose");
const { Schema } = mongoose;

const complaintSchema = new Schema(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    buyer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seller: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      enum: ["product_issue", "late_delivery", "fraud", "other"],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    // attachments: optional
    attachments: {
      type: [{ url: String }],
      default: [],
    },
    status: {
      type: String,
      enum: ["open", "in_review", "agreed", "rejected", "sent_to_admin"],
      default: "open",
    },
    history: {
      type: [
        {
          actionBy: { type: Schema.Types.ObjectId, ref: "User" },
          action: String,
          note: String,
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true, 
  }
);

complaintSchema.index({ buyer: 1, seller: 1, status: 1 });

module.exports = mongoose.model("Complaint", complaintSchema);
