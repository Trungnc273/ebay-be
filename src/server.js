require("dotenv").config();
const fs = require("fs");
const https = require("https");
const http = require("http");
const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const cors = require("cors");
const path = require("path");

const connectDB = require("./config/db");
const chatRoutes = require("./routes/chats");
const uploadRoutes = require("./routes/uploads");
const complaintRoutes = require("./routes/complaints");
const reviewRoutes = require("./routes/reviews");
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const errorHandler = require("./middleware/errorHandler");
const initSocket = require("./socket");

const app = express();

// -----------------------------------------------------
// 🔓 CORS mở toàn bộ cho DEV (mọi origin, method, header)
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Origin", "Accept"],
    credentials: true,
  })
);
// -----------------------------------------------------

app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

// static uploads for dev
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// routes
app.use("/api/v1/chats", chatRoutes);
app.use("/api/v1/uploads", uploadRoutes);
app.use("/api/v1/complaints", complaintRoutes);
app.use("/api/v1/reviews", reviewRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/auth", authRoutes);

// health check
app.get("/health", (req, res) => res.json({ ok: true }));

// ⚠️ Error handler đặt ở cuối cùng
app.use(errorHandler);

const PORT = process.env.PORT || 8888;

async function start() {
  await connectDB(process.env.MONGO_URI);

  // SSL key/cert (nếu có)
  const keyPath = process.env.SSL_KEY || "./cert/key.pem";
  const certPath = process.env.SSL_CERT || "./cert/cert.pem";

  const options = {
    key: fs.existsSync(keyPath) ? fs.readFileSync(keyPath) : null,
    cert: fs.existsSync(certPath) ? fs.readFileSync(certPath) : null,
  };

  // HTTP fallback nếu không có SSL
  let server;
  if (options.key && options.cert) {
    server = https.createServer(options, app);
  } else {
    console.warn("⚠️ SSL cert not found. Running over HTTP (dev mode).");
    server = http.createServer(app);
  }

  // Socket.IO (cũng mở full CORS)
  const { Server } = require("socket.io");
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      credentials: true,
    },
    maxHttpBufferSize: 1e6,
  });

  initSocket(io);

  server.listen(PORT, () => {
    console.log(
      `🚀 Server listening on http${options.key ? "s" : ""}://localhost:${PORT}`
    );
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
