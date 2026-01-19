const { getUserDriveClient } = require("../config/googleDrive");
const User = require("../models/User");

class GoogleDriveStorage {
    constructor(opts) { }

    async _handleFile(req, file, cb) {
        try {
            if (!req.session || !req.session.userId) {
                return cb(new Error("Unauthorized: No session."));
            }

            const user = await User.findById(req.session.userId).select('googleAccessToken googleRefreshToken');

            if (!user || !user.googleAccessToken) {
                return cb(new Error("Google Drive Linkage Missing. Please logout and login again with Google."));
            }

            const drive = getUserDriveClient(user.googleAccessToken, user.googleRefreshToken);

            const fileMetadata = {
                name: `${Date.now()}-${file.originalname}`,
                // Upload to root by default. 
                // Optional: We could search/create a "Chat App Uploads" folder here.
            };

            const media = {
                mimeType: file.mimetype,
                body: file.stream,
            };

            drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, name, webViewLink, webContentLink',
            }, async (err, response) => {
                if (err) return cb(err);

                const { id } = response.data;

                // Make public using the user's permission
                try {
                    await drive.permissions.create({
                        fileId: id,
                        requestBody: {
                            role: 'reader',
                            type: 'anyone',
                        },
                    });

                    const directLink = `https://drive.google.com/uc?export=view&id=${id}`;

                    cb(null, {
                        path: directLink,
                        filename: id,
                        originalName: file.originalname,
                        mimeType: file.mimetype,
                        size: file.size
                    });
                } catch (permErr) {
                    console.error("Permission Set Error:", permErr);
                    // Even if making public fails, return success so user sees the broken image? 
                    // No, better to error or just return the private link (which they can see).
                    // Let's hope it works.
                    cb(permErr);
                }
            });

        } catch (error) {
            cb(error);
        }
    }

    _removeFile(req, file, cb) {
        // Deletion is hard because we need the user client again.
        // For now, skip deletion or re-fetch user.
        // We'll skip for MVP.
        cb(null);
    }
}

module.exports = (opts) => new GoogleDriveStorage(opts);
