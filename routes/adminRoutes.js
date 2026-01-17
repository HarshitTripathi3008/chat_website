const express = require('express');
const User = require('../models/User');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { requireAdmin } = require('../middleware/adminMiddleware');

const router = express.Router();

// Apply middleware to all admin routes
router.use(requireAdmin);

// Get Dashboard Stats
router.get('/stats', async (req, res) => {
    try {
        const [userCount, messageCount, channelCount] = await Promise.all([
            User.countDocuments(),
            Message.countDocuments(),
            Conversation.countDocuments({ type: 'channel' })
        ]);

        const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5).select('name email createdAt');

        res.json({
            stats: {
                users: userCount,
                messages: messageCount,
                channels: channelCount
            },
            recentUsers
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch stats" });
    }
});

// Get User List (Paginated)
router.get('/users', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const skip = (page - 1) * limit;

        const users = await User.find()
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .select('-password');

        const total = await User.countDocuments();

        res.json({
            users,
            totalPages: Math.ceil(total / limit),
            currentPage: page
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

// Ban User
router.post('/users/:id/ban', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        user.isBanned = !user.isBanned;
        await user.save();

        res.json({ success: true, isBanned: user.isBanned });
    } catch (err) {
        res.status(500).json({ error: "Failed to update user" });
    }
});

// Cleanup Broken Avatars (Quick Fix)
router.post('/cleanup-avatars', async (req, res) => {
    try {
        // Unset avatars that match the specific missing file or are generally broken patterns if known.
        // For now, specifically targeting the reported missing file pattern or all non-dicebear/google avatars if requested.
        // User asked to "remove these". We'll remove specific broken ones.

        const result = await User.updateMany(
            { avatar: { $regex: '1768501889513.jpg' } },
            { $unset: { avatar: "" } }
        );

        res.json({ success: true, modified: result.modifiedCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Cleanup failed" });
    }
});

module.exports = router;
