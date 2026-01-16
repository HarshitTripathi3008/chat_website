
const express = require("express");
const User = require("../models/User");
const { requireAuth } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

/* ---------- PROFILE ---------- */
router.get("/me", async (req, res) => {
    if (!req.session.userId) return res.status(401).end();
    res.json(await User.findById(req.session.userId));
});

router.post("/me/update", requireAuth, upload.single("avatar"), async (req, res) => {
    try {
        const { name } = req.body;
        const updateData = {};
        if (name) updateData.name = name;
        if (req.file) updateData.avatar = req.file.path;

        const user = await User.findByIdAndUpdate(req.session.userId, updateData, { new: true });
        res.json(user);
    } catch (err) {
        console.error("Error updating profile:", err);
        res.status(500).json({ error: "Failed to update profile" });
    }
});

/* ---------- USERS ---------- */
router.get("/users", requireAuth, async (_, res) => {
    try {
        const users = await User.find().select('name email avatar');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

/* ---------- ONLINE USERS ---------- */
router.get("/online-users", async (_, res) => {
    try {
        const users = await User.find({ lastSeen: null });
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch online users" });
    }
});

module.exports = router;
