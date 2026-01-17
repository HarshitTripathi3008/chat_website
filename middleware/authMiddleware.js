
const requireAuth = async (req, res, next) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });

    // Enforce Ban Check
    try {
        const User = require('../models/User'); // Lazy load to avoid circular deps if any
        const user = await User.findById(req.session.userId).select('isBanned');
        if (user && user.isBanned) {
            req.session.destroy();
            return res.status(403).json({ error: "Account Banned" });
        }
    } catch (e) {
        console.error("Auth Middleware Error:", e);
    }

    next();
};

module.exports = { requireAuth };
