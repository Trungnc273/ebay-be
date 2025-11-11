// quick-seed.js
const mongoose = require("mongoose");
const Conversation = require("./src/models/Conversation");
const Message = require("./src/models/Message");

// GÁN TRỰC TIẾP Ở ĐÂY — KHÔNG CẦN .env
const MONGO_URI =
  "mongodb+srv://root:root@trungnc.lqfrzux.mongodb.net/ebay?retryWrites=true&w=majority&appName=TrungNC";

// 2 user giả — thay ID thật nếu bạn có
const USER1 = "67a1d8b6a123456789012345";
const USER2 = "67a1d8b6b987654321098765";

async function run() {
  try {
    console.log("🔌 Connecting to Mongo...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const conv = await Conversation.create({ participants: [USER1, USER2] });
    console.log("💬 Conversation created:", conv._id.toString());

    const msgs = await Message.insertMany([
      { conversation: conv._id, sender: USER1, text: "Hello from seed" },
      { conversation: conv._id, sender: USER2, text: "Hi, reply from seed" },
    ]);
    console.log(
      "✉️  Messages created:",
      msgs.map((m) => m._id.toString())
    );

    console.log("✅ Done. ConversationId:", conv._id.toString());
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed error:", err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  }
}

run();
