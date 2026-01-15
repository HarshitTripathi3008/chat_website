const mongoose = require("mongoose");

const invitationSchema = new mongoose.Schema({
  fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  fromUsername: String,
  toEmail: { type: String, required: true },
  token: { type: String, required: true, unique: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
  status: { type: String, enum: ["pending", "accepted", "expired"], default: "pending" },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

// Auto-expire invitations after 7 days
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Invitation", invitationSchema);
