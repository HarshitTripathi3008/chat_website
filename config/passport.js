
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

// Only configure Google Strategy if credentials are present
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "/auth/google/callback"
    },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const email = profile.emails[0].value;
                const avatar = profile.photos && profile.photos[0] ? profile.photos[0].value : null;
                const name = profile.displayName;

                let user = await User.findOne({ email });

                if (user) {
                    if (user.isBanned) {
                        return done(null, false, { message: "Account Banned" });
                    }
                    return done(null, user);
                } else {
                    // Create new user
                    user = await User.create({
                        email,
                        name: name || email.split("@")[0],
                        avatar: avatar,
                        isBanned: false
                    });
                    return done(null, user);
                }
            } catch (err) {
                done(err, null);
            }
        }
    ));
} else {
    console.warn("⚠️  Google OAuth credentials missing in .env - Google Login disabled.");
}

module.exports = passport;
