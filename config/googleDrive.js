const { google } = require('googleapis');
require('dotenv').config();

// Helper to get a Drive client for a specific user
const getUserDriveClient = (accessToken, refreshToken) => {
    if (!accessToken) return null;

    const oAuth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );

    oAuth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken
    });

    return google.drive({ version: 'v3', auth: oAuth2Client });
};

module.exports = { getUserDriveClient };
