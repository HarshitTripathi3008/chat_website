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

// Ban User (Example implementation - toggling a 'banned' field, assumes User model has it or we just add it)
router.post('/users/:id/ban', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        // Simple toggle for now. In real app, ensure 'isBanned' exists in Schema
        user.isBanned = !user.isBanned;
        await user.save();

        res.json({ success: true, isBanned: user.isBanned });
    } catch (err) {
        res.status(500).json({ error: "Failed to update user" });
    }
});

module.exports = router;
