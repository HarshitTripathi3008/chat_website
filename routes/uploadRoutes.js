
const express = require("express");
const User = require("../models/User");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const { requireAuth } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

// Helper to broadcast
const broadcast = (req, event, data) => {
    const io = req.app.get("io");
    const pub = req.app.get("pub");
    const useRedis = req.app.get("useRedis");

    if (useRedis && pub) {
        if (event === "message") pub.publish("chat", JSON.stringify(data));
        else io.emit(event, data);
    } else {
        io.emit(event, data);
    }
};

/* ---------- FILE MESSAGE ---------- */
router.post("/upload", requireAuth, upload.single("file"), async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);

        const type = req.file.mimetype.startsWith("image/")
            ? "image"
            : "file";

        const msgData = {
            userId: user._id,
            username: user.name,
            type,
            file: {
                name: req.file.originalname,
                url: req.file.path, // Storage URL
                id: req.file.filename
            }
        };

        if (req.body.conversationId) {
            msgData.conversationId = req.body.conversationId;
        }

        const msg = await Message.create(msgData);

        broadcast(req, "message", msg);
        res.json(msg);
    } catch (error) {
        console.error("Upload error:", error);
        res.status(500).json({ error: "Upload failed" });
    }
});

/* ---------- VOICE MESSAGE UPLOAD ---------- */
router.post("/upload/voice", requireAuth, upload.single("audio"), async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);

        const msgData = {
            userId: user._id,
            username: user.name,
            type: "voice",
            file: {
                url: req.file.path, // Storage URL
                id: req.file.filename,
                duration: parseFloat(req.body.duration),
                waveform: JSON.parse(req.body.waveform || '[]')
            }
        };

        if (req.body.conversationId) {
            msgData.conversationId = req.body.conversationId;
        }

        const msg = await Message.create(msgData);

        broadcast(req, "message", msg);
        res.json(msg);
    } catch (error) {
        console.error("Voice upload error:", error);
        res.status(500).json({ error: "Voice upload failed" });
    }
});

module.exports = router;
