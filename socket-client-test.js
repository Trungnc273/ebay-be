// socket-client-test.js
const { io } = require("socket.io-client");

// === GÁN TRỰC TIẾP Ở ĐÂY ===
// URL server backend
const SERVER = "http://localhost:8888"; // hoặc đổi sang https nếu backend dùng SSL

// ID người gửi (lấy từ user._id trong MongoDB)
const USER_ID = "691213cb0d50c8760ec697ce"; // sửa cho đúng

// ID của cuộc trò chuyện (conversation._id trong MongoDB)
const CONVERSATION_ID = "691228ac79f91ca324386019"; // sửa cho đúng

// ===============================================

const socket = io(SERVER, {
  transports: ["websocket"],
  autoConnect: false,
});

socket.on("connect", () => {
  console.log("✅ Connected:", socket.id);

  // gửi event auth để gắn user vào socket
  socket.emit("auth", { userId: USER_ID });

  // join vào phòng trò chuyện
  socket.emit(
    "join_room",
    { conversationId: CONVERSATION_ID, userId: USER_ID },
    (ack) => {
      console.log("join_room ack:", ack);
    }
  );

  // lắng nghe tin nhắn mới
  socket.on("new_message", (payload) => {
    console.log("💬 new_message:", payload);
  });

  // lắng nghe cập nhật trạng thái đọc
  socket.on("update_read_status", (payload) => {
    console.log("👀 update_read_status:", payload);
  });

  // gửi thử tin nhắn sau 1 giây
  setTimeout(() => {
    socket.emit(
      "send_message",
      {
        conversationId: CONVERSATION_ID,
        sender: USER_ID,
        text: "Hello from test client!",
      },
      (ack) => {
        console.log("📤 send_message ack:", ack);
      }
    );
  }, 1000);
});

socket.on("disconnect", () => console.log("❌ Disconnected"));
socket.on("connect_error", (err) =>
  console.error("⚠️ connect_error:", err.message)
);

socket.connect();
