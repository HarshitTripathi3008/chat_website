const mongoose = require("mongoose");

const roomInviteSchema = new mongoose.Schema({
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usageLimit: { type: Number, default: null }, // null = unlimited
    usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdAt: { type: Date, default: Date.now }
});

// Indexes for faster lookups (token already has unique: true, so no need to index again)
roomInviteSchema.index({ roomId: 1 });
roomInviteSchema.index({ expiresAt: 1 });

module.exports = mongoose.model("RoomInvite", roomInviteSchema);
