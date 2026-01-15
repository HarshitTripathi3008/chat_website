const mongoose = require("mongoose");

const tokenSchema = new mongoose.Schema({
  email: String,
  token: String,
  expiresAt: Date
});

module.exports = mongoose.model("MagicToken", tokenSchema);
