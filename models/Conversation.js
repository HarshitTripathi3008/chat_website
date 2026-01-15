const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
    type: { type: String, enum: ["direct", "group", "global", "channel"], default: "direct" },
    isChannel: { type: Boolean, default: false },
    category: { type: String, enum: ['tech', 'dank', 'nsfw', 'general', 'political', 'instagram', 'gaming', 'crypto', 'anime', 'sports'], default: 'general' },



    isNSFW: { type: Boolean, default: false },
    subscribers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    name: String, // For group chats
    description: String, // For group chats
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    lastMessage: {
        text: String,
        timestamp: Date,
        userId: mongoose.Schema.Types.ObjectId
    },
    unreadCount: { type: Map, of: Number } // userId -> count
}, { timestamps: true });

module.exports = mongoose.model("Conversation", conversationSchema);
