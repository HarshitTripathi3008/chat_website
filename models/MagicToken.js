const mongoose = require("mongoose");

const tokenSchema = new mongoose.Schema({
  email: String,
  token: String,
  expiresAt: { type: Date, default: Date.now, expires: 900 } // 900 seconds = 15 minutes
});

module.exports = mongoose.model("MagicToken", tokenSchema);
