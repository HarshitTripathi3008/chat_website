const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 magic link requests per windowMs
    message: { error: "Too many login attempts, please try again later." }
});

const inviteLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Limit each IP to 20 invites per hour
    message: { error: "Too many invites sent, please try again later." }
});

module.exports = { authLimiter, inviteLimiter };
