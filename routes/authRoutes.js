
const express = require("express");
const crypto = require("crypto");
const User = require("../models/User");
const MagicToken = require("../models/MagicToken");
const Invitation = require("../models/Invitation");
const { sendEmail } = require("../utils/sendgrid");
const { processInvitation } = require("../utils/helpers");
const passport = require("../config/passport");


const { authLimiter } = require("../middleware/rateLimiter");

const router = express.Router();
const APP_URL = process.env.APP_URL || "https://chat-website-mdqr.onrender.com";

/* ---------- MAGIC LINK ---------- */
router.post("/auth/magic-link", authLimiter, async (req, res) => {

    try {
        const token = crypto.randomBytes(32).toString("hex");
        await MagicToken.create({ email: req.body.email, token });
        const magicLink = `${APP_URL}/auth/magic/${token}`;

        try {
            await sendEmail({
                to: req.body.email,
                subject: "Login to Chat App",
                html: `<p>Click the link below to login:</p><a href="${magicLink}">Login</a><p>Link expires in 15 minutes.</p>`
            });
            res.json({ success: true });
        } catch (mailError) {
            console.error("❌ Email failed to send:", mailError.message);
            console.log("---------------------------------------------------");
            console.log("🔑 EMERGENCY LOGIN LINK (Use this if email fails):");
            console.log(magicLink);
            console.log("---------------------------------------------------");
            // Still return success so the frontend doesn't show an error, 
            // the user will just look at the logs as instructed.
            res.json({ success: true, message: "Email failed, check server logs for link" });
        }
    } catch (error) {
        console.error("Magic link error:", error);
        res.status(500).json({ error: "Failed to send magic link" });
    }
});

/* ---------- VERIFY ---------- */
router.get("/auth/magic/:token", async (req, res) => {

    try {
        const record = await MagicToken.findOne({ token: req.params.token });

        if (!record) {
            return res.status(400).send("Invalid or expired token");
        }

        const user = await User.findOneAndUpdate(
            { email: record.email },
            { email: record.email, name: record.email.split("@")[0], lastSeen: null },
            { upsert: true, new: true }
        );
        req.session.userId = user._id;
        await MagicToken.deleteOne({ _id: record._id });

        // Process pending invitation if exists
        if (req.session.pendingInvitation) {
            const invitation = await Invitation.findById(req.session.pendingInvitation);
            if (invitation && invitation.status === "pending") {
                await processInvitation(invitation, user._id);
            }
            delete req.session.pendingInvitation;
        }

        res.redirect("/");
    } catch (error) {
        console.error("Magic link verify error:", error);
        res.status(500).send("Login failed");
    }
});

/* ---------- GOOGLE AUTH ---------- */
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

    router.get("/auth/google/callback",
        passport.authenticate("google", { session: false, failureRedirect: "/" }),
        async (req, res) => {
            req.session.userId = req.user._id;

            // Process pending invitation if exists
            if (req.session.pendingInvitation) {
                try {
                    const invitation = await Invitation.findById(req.session.pendingInvitation);
                    if (invitation && invitation.status === "pending") {
                        await processInvitation(invitation, req.user._id);
                    }
                } catch (err) {
                    console.error("Error processing invitation:", err);
                }
                delete req.session.pendingInvitation;
            }

            res.redirect("/");
        }
    );
} else {
    // Placeholder routes that inform the user Google Auth is disabled
    router.get("/auth/google", (req, res) => res.status(503).send("Google Login is not configured."));
    router.get("/auth/google/callback", (req, res) => res.redirect("/"));
}

module.exports = router;

