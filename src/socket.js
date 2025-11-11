// src/socket/index.js
const mongoose = require("mongoose");
const Message = require("./models/Message");
const Conversation = require("./models/Conversation");
const { encryptText, decryptText } = require("./utils/encrypt"); // optional

function initSocket(io) {
  io.on("connection", (socket) => {
    console.log("socket connected", socket.id);

    // client may send auth info to associate userId with socket (simple demo)
    socket.on("auth", (payload) => {
      // payload: { userId }
      if (payload && payload.userId) socket.data.userId = payload.userId;
    });

    // join a conversation room
    socket.on("join_room", async ({ conversationId, userId }, ack) => {
      try {
        if (!conversationId || !mongoose.isValidObjectId(conversationId)) {
          if (typeof ack === "function")
            return ack({ ok: false, error: "invalid_conversation_id" });
          return;
        }
        socket.join(conversationId);
        if (userId) socket.data.userId = userId;
        console.log(
          `${socket.data.userId || "unknown"} joined ${conversationId}`
        );
        if (typeof ack === "function") ack({ ok: true });
      } catch (err) {
        console.error("join_room err", err);
        if (typeof ack === "function") ack({ ok: false, error: err.message });
      }
    });

    // send a message
    socket.on("send_message", async (payload, ack) => {
      // payload: { conversationId, sender, text, attachments, productRef }
      try {
        const { conversationId, sender, text, attachments, productRef } =
          payload || {};
        if (!conversationId || !mongoose.isValidObjectId(conversationId)) {
          if (typeof ack === "function")
            return ack({ ok: false, error: "invalid_conversation_id" });
          return;
        }
        if (!sender || !mongoose.isValidObjectId(sender)) {
          if (typeof ack === "function")
            return ack({ ok: false, error: "invalid_sender" });
          return;
        }

        // encrypt text if helper exists
        let storedText = text || "";
        try {
          if (typeof encryptText === "function" && storedText) {
            storedText = encryptText(storedText);
          }
        } catch (e) {
          // encryption failed — fallback to raw text but log
          console.warn("encryptText failed, storing raw text", e.message);
        }

        const msgDoc = {
          conversation: conversationId,
          sender,
          text: storedText,
          attachments: Array.isArray(attachments)
            ? attachments
            : attachments
            ? [attachments]
            : [],
          productRef:
            productRef && mongoose.isValidObjectId(productRef)
              ? productRef
              : null,
          // readBy empty initially
        };

        const msg = await Message.create(msgDoc);

        // update conversation metadata: lastMessageAt and optionally lastMessage ref (if you track it)
        try {
          await Conversation.findByIdAndUpdate(conversationId, {
            lastMessageAt: msg.createdAt || new Date(),
            lastMessage: msg._id,
          }).catch(() => {}); // ignore update errors
        } catch (e) {
          // noop
        }

        // Prepare payload to emit to room. We send encrypted text (client may decrypt),
        // and include _id + createdAt so clients can sort/ack.
        const emitPayload = {
          id: msg._id,
          conversationId: msg.conversation,
          sender: msg.sender,
          text: msg.text,
          attachments: msg.attachments,
          productRef: msg.productRef,
          readBy: msg.readBy || [],
          createdAt: msg.createdAt,
        };

        io.to(conversationId).emit("new_message", emitPayload);

        if (typeof ack === "function") ack({ ok: true, data: emitPayload });
      } catch (err) {
        console.error("send_message err", err);
        if (typeof ack === "function") ack({ ok: false, error: err.message });
        socket.emit("error", {
          type: "send_message_failed",
          message: err.message,
        });
      }
    });

    // typing indicator
    socket.on("typing", ({ conversationId, userId }) => {
      try {
        if (!conversationId) return;
        socket
          .to(conversationId)
          .emit("user_typing", { conversationId, userId });
      } catch (err) {
        console.error("typing err", err);
      }
    });

    // mark a single message read by _id or mark up-to timestamp
    socket.on(
      "message_read",
      async ({ conversationId, messageId, userId }, ack) => {
        try {
          if (!messageId || !mongoose.isValidObjectId(messageId)) {
            if (typeof ack === "function")
              return ack({ ok: false, error: "invalid_message_id" });
            return;
          }
          const userObj = userId || socket.data.userId;
          if (!userObj) {
            if (typeof ack === "function")
              return ack({ ok: false, error: "missing_user" });
          }

          const msg = await Message.findByIdAndUpdate(
            messageId,
            { $addToSet: { readBy: userObj } },
            { new: true }
          ).lean();

          if (!msg) {
            if (typeof ack === "function")
              return ack({ ok: false, error: "message_not_found" });
            return;
          }

          io.to(conversationId).emit("update_read_status", {
            messageId: msg._id,
            readBy: msg.readBy,
          });

          if (typeof ack === "function")
            ack({ ok: true, data: { messageId: msg._id, readBy: msg.readBy } });
        } catch (err) {
          console.error("message_read err", err);
          if (typeof ack === "function") ack({ ok: false, error: err.message });
        }
      }
    );

    socket.on("disconnect", () => {
      console.log("socket disconnected", socket.id);
    });
  });
}

module.exports = initSocket;
