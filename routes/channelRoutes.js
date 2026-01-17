
const express = require("express");
const Conversation = require("../models/Conversation");
const User = require("../models/User");
const Message = require("../models/Message");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

/* ---------- GET CHANNELS ---------- */
router.get("/channels", async (req, res) => {
    try {
        let showNSFW = false;

        // Check if user is logged in and is the admin
        if (req.session && req.session.userId) {
            const user = await User.findById(req.session.userId);
            if (user && user.email === 'harshtripathi9559@gmail.com') {
                showNSFW = true;
            }
        }

        // Build Query
        const query = { type: 'channel' };
        if (!showNSFW) {
            // Exclude NSFW channels for everyone else
            query.isNSFW = { $ne: true };
        }

        const channels = await Conversation.find(query)
            .select('name description category isNSFW participants')
            .sort({ name: 1 });

        // Map to include subscriber count
        const result = channels.map(c => ({
            ...c.toObject(),
            subscriberCount: c.participants.length
        }));

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch channels" });
    }
});

/* ---------- SUBSCRIBE/JOIN ---------- */
router.post("/channels/:id/join", requireAuth, async (req, res) => {
    try {
        const channel = await Conversation.findByIdAndUpdate(
            req.params.id,
            { $addToSet: { participants: req.session.userId } },
            { new: true }
        );
        res.json({ success: true, count: channel.participants.length });
    } catch (err) {
        res.status(500).json({ error: "Failed to join channel" });
    }
});

/* ---------- UNSUBSCRIBE/LEAVE ---------- */
router.post("/channels/:id/leave", requireAuth, async (req, res) => {
    try {
        const channel = await Conversation.findByIdAndUpdate(
            req.params.id,
            { $pull: { participants: req.session.userId } },
            { new: true }
        );
        res.json({ success: true, count: channel.participants.length });
    } catch (err) {
        res.status(500).json({ error: "Failed to leave channel" });
    }
});

/* ---------- SAVE MEME (COLLECTION) ---------- */
router.post("/memes/:id/save", requireAuth, async (req, res) => {
    try {
        console.log(`💾 Saving meme ${req.params.id} for user ${req.session.userId}`);
        const user = await User.findByIdAndUpdate(req.session.userId, {
            $addToSet: { savedMessages: req.params.id }
        });
        console.log("User updated:", user ? "Found" : "Not Found");
        res.json({ success: true });
    } catch (err) {
        console.error("Save Error:", err);
        res.status(500).json({ error: "Failed to save meme" });
    }
});


/* ---------- GET SAVED MEMES ---------- */
router.get("/memes/saved", requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.session.userId).populate({
            path: 'savedMessages',
            populate: { path: 'userId', select: 'name avatar' }
        });
        res.json(user.savedMessages);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch saved memes" });
    }
});

router.delete("/memes/:id/save", requireAuth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.session.userId, {
            $pull: { savedMessages: req.params.id }
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to remove saved meme" });
    }
});


module.exports = router;
