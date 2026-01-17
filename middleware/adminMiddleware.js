const User = require('../models/User');

const requireAdmin = async (req, res, next) => {
    try {
        if (!req.session.userId) {
            return res.status(401).json({ error: "Authentication required" });
        }

        const user = await User.findById(req.session.userId);
        if (!user || user.email !== 'harshtripathi9559@gmail.com') {
            return res.status(403).json({ error: "Access Denied: Admins Only" });
        }

        req.admin = user;
        next();
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
};

module.exports = { requireAdmin };
