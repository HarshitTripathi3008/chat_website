const fs = require('fs');
const path = require('path');

const User = require("../models/User");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");

const typingTimeouts = new Map();

module.exports = (io, useRedis, pub, sub) => {
    /* ================= SOCKET.IO ================= */
    if (useRedis) {
        sub.subscribe("chat", msg => io.emit("message", JSON.parse(msg)));
        sub.subscribe("reaction", data => io.emit("reaction", JSON.parse(data)));
        sub.subscribe("editMessage", data => io.emit("editMessage", JSON.parse(data)));
        sub.subscribe("deleteMessage", data => io.emit("deleteMessage", JSON.parse(data)));
    }

    io.on("connection", async socket => {
        // Check session
        if (!socket.handshake.session || !socket.handshake.session.userId) {
            return;
        }

        const user = await User.findById(socket.handshake.session.userId);
        if (!user) return;

        // Join socket rooms for all user's conversations
        const userConversations = await Conversation.find({
            participants: user._id
        });

        userConversations.forEach(conv => {
            socket.join(conv._id.toString());
        });

        socket.emit("me", user);

        // Broadcast online users
        const onlineUsers = await User.find({ lastSeen: null });
        io.emit("onlineUsers", onlineUsers);

        socket.on("message", async ({ text, conversationId, replyTo }) => {
            const msgData = {
                userId: user._id,
                username: user.name,
                text
            };

            // Add reply data if present
            if (replyTo) {
                msgData.replyTo = replyTo;
            }

            if (conversationId) {
                msgData.conversationId = conversationId;
            }

            const msg = await Message.create(msgData);

            // Update conversation after message is created
            if (conversationId) {
                await Conversation.findByIdAndUpdate(conversationId, {
                    lastMessage: {
                        text,
                        timestamp: msg.createdAt,
                        userId: user._id,
                        messageId: msg._id
                    },
                    updatedAt: new Date()
                });
            }

            if (useRedis) {
                pub.publish("chat", JSON.stringify(msg));
            } else {
                io.emit("message", msg);
            }
        });

        socket.on("reaction", async ({ messageId, emoji }) => {
            const message = await Message.findById(messageId);
            if (!message) return;

            let reaction = message.reactions.find(r => r.emoji === emoji);

            if (reaction) {
                const userIndex = reaction.users.findIndex(u => u.toString() === user._id.toString());
                if (userIndex > -1) {
                    reaction.users.splice(userIndex, 1);
                    if (reaction.users.length === 0) {
                        message.reactions = message.reactions.filter(r => r.emoji !== emoji);
                    }
                } else {
                    reaction.users.push(user._id);
                }
            } else {
                message.reactions.push({
                    emoji,
                    users: [user._id]
                });
            }

            await message.save();

            const update = { messageId, reactions: message.reactions };
            if (useRedis) {
                pub.publish("reaction", JSON.stringify(update));
            } else {
                io.emit("reaction", update);
            }
        });

        socket.on("editMessage", async ({ messageId, newText }) => {
            const message = await Message.findById(messageId);
            if (!message) return;

            // Only allow editing own messages
            if (message.userId.toString() !== user._id.toString()) return;

            message.text = newText;
            message.editedAt = new Date();
            await message.save();

            const update = { messageId, newText, editedAt: message.editedAt };
            if (useRedis) {
                pub.publish("editMessage", JSON.stringify(update));
            } else {
                io.emit("editMessage", update);
            }
        });

        socket.on("deleteMessage", async ({ messageId, deleteForEveryone }) => {
            const message = await Message.findById(messageId);
            if (!message) return;

            // Only allow deleting own messages
            if (message.userId.toString() !== user._id.toString()) return;

            if (deleteForEveryone) {
                // Hard Delete logic
                if (message.file && message.file.url && message.file.url.startsWith('/uploads/')) {
                    const filePath = path.join(__dirname, '..', message.file.url);
                    fs.unlink(filePath, (err) => {
                        if (err) console.error("Failed to delete file:", filePath, err.message);
                        else console.log("Deleted file:", filePath);
                    });
                }

                await Message.deleteOne({ _id: messageId });

                const update = { messageId, deleteForEveryone: true };
                if (useRedis) {
                    pub.publish("deleteMessage", JSON.stringify(update));
                } else {
                    io.emit("deleteMessage", update);
                }
            } else {
                // Delete for this user only
                if (!message.deletedFor) message.deletedFor = [];
                message.deletedFor.push(user._id);
                await message.save();

                socket.emit("deleteMessage", { messageId, deleteForEveryone: false });
            }
        });

        socket.on("typing", ({ conversationId }) => {
            const event = { username: user.name, conversationId };
            const timeoutKey = `${user._id}-${conversationId || 'global'}`;

            // Clear existing timeout for this user/conversation
            if (typingTimeouts.has(timeoutKey)) {
                clearTimeout(typingTimeouts.get(timeoutKey));
            }

            if (conversationId) {
                // Emit only to users in this conversation
                socket.to(conversationId).emit("userTyping", event);
                const timeout = setTimeout(() => {
                    socket.to(conversationId).emit("userStoppedTyping", { conversationId });
                    typingTimeouts.delete(timeoutKey);
                }, 3000);
                typingTimeouts.set(timeoutKey, timeout);
            } else {
                // Global chat
                socket.broadcast.emit("userTyping", event);
                const timeout = setTimeout(() => {
                    socket.broadcast.emit("userStoppedTyping");
                    typingTimeouts.delete(timeoutKey);
                }, 3000);
                typingTimeouts.set(timeoutKey, timeout);
            }
        });

        socket.on("disconnect", async () => {
            // Clear all typing timeouts for this user
            for (const [key, timeout] of typingTimeouts.entries()) {
                if (key.startsWith(user._id.toString())) {
                    clearTimeout(timeout);
                    typingTimeouts.delete(key);
                }
            }

            await User.findByIdAndUpdate(user._id, { lastSeen: new Date() });
            const onlineUsers = await User.find({ lastSeen: null });
            io.emit("onlineUsers", onlineUsers);
        });
    });
};
