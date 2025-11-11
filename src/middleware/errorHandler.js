// src/middleware/errorHandler.js
module.exports = (err, req, res, next) => {
  console.error("❌ Global Error:", err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};
