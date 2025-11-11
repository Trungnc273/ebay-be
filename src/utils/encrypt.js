const crypto = require("crypto");

const algorithm = "aes-256-cbc"; // đơn giản, có thể nâng lên GCM
const KEY = process.env.MASTER_KEY || "default_master_key_32chars_min_len!!";

function encryptText(plain) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    algorithm,
    Buffer.from(KEY.slice(0, 32)),
    iv
  );
  let encrypted = cipher.update(plain, "utf8", "base64");
  encrypted += cipher.final("base64");
  return iv.toString("base64") + ":" + encrypted;
}

function decryptText(enc) {
  if (!enc) return enc;
  const [ivB64, data] = enc.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const decipher = crypto.createDecipheriv(
    algorithm,
    Buffer.from(KEY.slice(0, 32)),
    iv
  );
  let decrypted = decipher.update(data, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

module.exports = { encryptText, decryptText };
