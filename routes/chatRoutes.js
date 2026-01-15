
const express = require("express");
const crypto = require("crypto");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const User = require("../models/User");
const RoomInvite = require("../models/RoomInvite");
const Invitation = require("../models/Invitation");
const mailer = require("../utils/mailer");
const { requireAuth } = require("../middleware/authMiddleware");
const { inviteLimiter } = require("../middleware/rateLimiter");
const { processInvitation } = require("../utils/helpers");

const router = express.Router();
const APP_URL = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;

// Helper to broadcast
const broadcast = (req, event, data) => {
    const io = req.app.get("io");
    const pub = req.app.get("pub");
    const useRedis = req.app.get("useRedis");

    if (useRedis && pub) {
        // Redis logic usually publishes to a channel, and subscribers emit socket events
        // In server.js: sub.subscribe("chat", msg => io.emit("message", ...))
        // We need to match the channel names used in server.js
        if (event === "message") pub.publish("chat", JSON.stringify(data));
        else if (event === "reaction") pub.publish("reaction", JSON.stringify(data));
        // server.js doesn't seem to have a generic broadcast via redis for other events?
        // It has: chat, reaction, editMessage, deleteMessage
        else {
            // Fallback or define new channels if needed
            io.emit(event, data);
        }
    } else {
        io.emit(event, data);
    }
};

/* ---------- CHAT HISTORY (GLOBAL) ---------- */
router.get("/messages", async (_, res) => {
    const msgs = await Message.find({ conversationId: null }).sort({ createdAt: 1 }).limit(200);
    res.json(msgs);
});

/* ---------- CONVERSATIONS ---------- */
router.get("/conversations", requireAuth, async (req, res) => {
    const { type } = req.query;
    const query = { participants: req.session.userId };
    if (type) query.type = type;

    const convs = await Conversation.find(query)
        .populate('participants', 'name email avatar')
        .sort({ updatedAt: -1 });
    res.json(convs);
});

router.get("/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
        const conversation = await Conversation.findById(req.params.id);
        if (!conversation) return res.status(404).json({ error: "Conversation not found" });

        // Access check: allow if channel or if user is participant
        const isParticipant = conversation.participants.includes(req.session.userId);
        if (!conversation.isChannel && !isParticipant) {
            return res.status(403).json({ error: "Access denied" });
        }

        const msgs = await Message.find({ conversationId: req.params.id })
            .sort({ createdAt: 1 })
            .limit(200);
        res.json(msgs);
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
});


router.post("/conversations/start", requireAuth, async (req, res) => {
    const { userId } = req.body;

    if (userId === req.session.userId) {
        return res.status(400).json({ error: "Cannot chat with yourself" });
    }

    // Check if direct conversation exists
    let conv = await Conversation.findOne({
        type: 'direct',
        participants: { $all: [req.session.userId, userId], $size: 2 }
    }).populate('participants', 'name email avatar');

    if (!conv) {
        conv = await Conversation.create({
            type: 'direct',
            participants: [req.session.userId, userId],
            createdBy: req.session.userId
        });
        // Populate for return
        conv = await Conversation.findById(conv._id).populate('participants', 'name email avatar');
    }

    res.json(conv);
});

/* ---------- ROOMS & INVITES ---------- */
router.post("/rooms/create", requireAuth, async (req, res) => {
    const { name, description } = req.body;

    const room = await Conversation.create({
        type: 'group',
        name,
        description,
        participants: [req.session.userId],
        createdBy: req.session.userId
    });

    res.json(room);
});

router.post("/rooms/join/:id", requireAuth, async (req, res) => {
    const room = await Conversation.findByIdAndUpdate(
        req.params.id,
        { $addToSet: { participants: req.session.userId } },
        { new: true }
    ).populate('participants', 'name email');

    if (!room) return res.status(404).json({ error: "Room not found" });

    res.json(room);
});

// Create invite link for a room
router.post("/rooms/:id/invite", requireAuth, async (req, res) => {
    try {
        const room = await Conversation.findById(req.params.id);

        if (!room || room.type !== 'group') {
            return res.status(404).json({ error: "Room not found" });
        }

        // Check if user is in the room
        if (!room.participants.includes(req.session.userId)) {
            return res.status(403).json({ error: "Access denied" });
        }

        const token = crypto.randomBytes(16).toString("hex");
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const invite = await RoomInvite.create({
            roomId: room._id,
            invitedBy: req.session.userId,
            token,
            expiresAt
        });


        res.json({
            url: `${APP_URL}/rooms/join/${token}`,
            token,
            expiresAt: invite.expiresAt
        });
    } catch (error) {
        console.error('Error creating room invite:', error);
        res.status(500).json({ error: "Failed to create invite" });
    }
});

router.post("/rooms/:id/leave", requireAuth, async (req, res) => {
    try {
        const room = await Conversation.findOneAndUpdate(
            { _id: req.params.id, type: 'group' },
            { $pull: { participants: req.session.userId } },
            { new: true }
        );
        if (!room) return res.status(404).json({ error: "Room not found" });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to leave room" });
    }
});

router.delete("/rooms/:id", requireAuth, async (req, res) => {
    try {
        const room = await Conversation.findOne({ _id: req.params.id, type: 'group' });
        if (!room) return res.status(404).json({ error: "Room not found" });

        if (String(room.createdBy) !== String(req.session.userId)) {
            return res.status(403).json({ error: "Only the owner can delete this room" });
        }

        await Conversation.findByIdAndDelete(req.params.id);
        await Message.deleteMany({ conversationId: req.params.id });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to delete room" });
    }
});



// Send invite to a DM conversation
router.post("/rooms/:id/invite/send", requireAuth, async (req, res) => {
    try {
        const { conversationId, customMessage } = req.body;
        const room = await Conversation.findById(req.params.id);
        const user = await User.findById(req.session.userId);

        if (!room || room.type !== 'group') {
            return res.status(404).json({ error: "Room not found" });
        }

        // Generate token
        const token = crypto.randomBytes(16).toString("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await RoomInvite.create({
            roomId: room._id,
            invitedBy: req.session.userId,
            token,
            expiresAt
        });


        const inviteUrl = `${APP_URL}/rooms/join/${token}`;
        const messageText = customMessage || `Join my room: ${room.name}`;

        // Create message in the DM
        const msg = await Message.create({
            userId: user._id,
            username: user.name,
            text: messageText,
            conversationId,
            type: 'room_invite',
            metadata: {
                roomId: room._id,
                roomName: room.name,
                inviteToken: token,
                inviteUrl
            }
        });

        // Update conversation
        await Conversation.findByIdAndUpdate(conversationId, {
            lastMessage: {
                text: `Room invite: ${room.name}`,
                timestamp: msg.createdAt,
                userId: user._id,
                messageId: msg._id
            },
            updatedAt: new Date()
        });

        // Emit message via socket
        broadcast(req, "message", msg);

        res.json({ success: true, message: "Invite sent successfully" });
    } catch (error) {
        console.error('Error sending room invite:', error);
        res.status(500).json({ error: "Failed to send invite" });
    }
});

// Accept room invite
router.get("/rooms/join/:token", async (req, res) => {
    try {
        const invite = await RoomInvite.findOne({
            token: req.params.token,
            expiresAt: { $gt: new Date() }
        }).populate('roomId');

        if (!invite) {
            return res.redirect("/?error=invalid_invite");
        }

        // Require Login
        if (!req.session.userId) {
            // Store intended room join
            // req.session.pendingRoom = ... (Optional implementation)
            return res.redirect("/?error=login_required");
        }

        const room = invite.roomId;
        if (!room) return res.status(404).send("Room not found");

        // Add user to room if not already in
        if (!room.participants.includes(req.session.userId)) {
            await Conversation.findByIdAndUpdate(
                room._id,
                { $addToSet: { participants: req.session.userId } }
            );
        }

        res.redirect(`/?joined_room=${room._id}`);
    } catch (error) {
        console.error('Error accepting room invite:', error);
        res.redirect("/?error=failed_to_join_room");
    }
});

/* ---------- INVITATIONS (EMAIL) ---------- */
router.post("/invitations/send", requireAuth, inviteLimiter, async (req, res) => {
    const { toEmail } = req.body;
    const fromUser = await User.findById(req.session.userId);

    // Check if user already exists
    const existingUser = await User.findOne({ email: toEmail });
    if (existingUser) {
        return res.status(400).json({ error: "User already exists. Start a direct conversation instead." });
    }

    // Create invitation token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await Invitation.create({
        fromUserId: fromUser._id,
        fromUsername: fromUser.name,
        toEmail,
        token,
        expiresAt
    });

    // Send invitation email
    await mailer.sendMail({
        to: toEmail,
        subject: `${fromUser.name} invited you to chat`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0088cc;">You've been invited to chat!</h2>
        <p><strong>${fromUser.name}</strong> (${fromUser.email}) wants to connect with you on Chat App.</p>
        <p>Click the button below to accept the invitation and start chatting:</p>
        <a href="${APP_URL}/invitations/accept/${token}" 
           style="display: inline-block; background: #0088cc; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 6px; margin: 20px 0;">
          Accept Invitation
        </a>
        <p style="color: #666; font-size: 12px;">This invitation will expire in 7 days.</p>
      </div>
    `
    });

    res.json({ success: true, message: "Invitation sent successfully" });
});

router.get("/invitations/accept/:token", async (req, res) => {
    const invitation = await Invitation.findOne({
        token: req.params.token,
        status: "pending",
        expiresAt: { $gt: new Date() }
    });

    if (!invitation) {
        return res.status(404).send("Invitation not found or expired");
    }

    // Store invitation token in session for after login
    req.session.pendingInvitation = invitation._id.toString();

    // If user is not logged in, redirect to login
    if (!req.session.userId) {
        return res.redirect(`/?invitation=${req.params.token}`);
    }

    // User is logged in, process invitation
    await processInvitation(invitation, req.session.userId);
    res.redirect("/");
});

/* ---------- REACTIONS ---------- */
router.post("/messages/:id/react", requireAuth, async (req, res) => {
    const { emoji } = req.body;
    const messageId = req.params.id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });

    // Find existing reaction
    let reaction = message.reactions.find(r => r.emoji === emoji);

    if (reaction) {
        // Toggle: remove if user already reacted, add if not
        const userIndex = reaction.users.indexOf(req.session.userId);
        if (userIndex > -1) {
            reaction.users.splice(userIndex, 1);
            if (reaction.users.length === 0) {
                message.reactions = message.reactions.filter(r => r.emoji !== emoji);
            }
        } else {
            reaction.users.push(req.session.userId);
        }
    } else {
        // Add new reaction
        message.reactions.push({
            emoji,
            users: [req.session.userId]
        });
    }

    await message.save();

    // Broadcast reaction update
    const update = { messageId, reactions: message.reactions };
    broadcast(req, "reaction", update);

    res.json(message);
});

module.exports = router;
