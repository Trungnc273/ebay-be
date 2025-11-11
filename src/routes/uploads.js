const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();
const auth = require("../middleware/auth");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

router.post("/chat-files", auth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file" });
  // Return accessible URL (for dev, local path)
  const url = `/uploads/${req.file.filename}`;
  return res.json({ url });
});

module.exports = router;
