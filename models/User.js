const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  name: String,
  avatar: String,
  bio: { type: String, default: "" },
  lastSeen: Date,
  isBanned: { type: Boolean, default: false },
  savedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: "Message" }]

}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
