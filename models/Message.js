const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  username: String,
  text: String,
  type: { type: String, enum: ["text", "image", "file", "voice", "room_invite"], default: "text" },
  metadata: mongoose.Schema.Types.Mixed, // For room invite data
  file: {
    name: String,
    url: String
  },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
  reactions: [{
    emoji: String,
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
  }],
  score: { type: Number, default: 0 },

  // Reply support
  replyTo: {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    text: String,
    username: String
  },
  // Edit/Delete support
  editedAt: Date,
  isDeleted: Boolean,
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Delete for specific users
  // Forward support
  forwardedFrom: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    username: String,
    messageId: mongoose.Schema.Types.ObjectId
  },
  // Read receipts
  readBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    readAt: Date
  }],
  deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);
