const GoogleDriveStorage = require('./googleDriveStorage');
const { storage: cloudinaryStorage } = require('../config/cloudinary');

class HybridStorage {
    constructor(opts) {
        this.driveStorage = GoogleDriveStorage(opts);
        this.cloudinaryStorage = cloudinaryStorage;
    }

    _handleFile(req, file, cb) {
        // Logic: 
        // Images/Videos -> Cloudinary
        // Everything else (PDFs, Docs, Zips) -> Google Drive

        const isMedia = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/');

        if (isMedia) {
            // Delegate to Cloudinary
            this.cloudinaryStorage._handleFile(req, file, cb);
        } else {
            // Delegate to Google Drive
            // Note: This uses User-Delegated upload (requires user to be logged in with Google)
            this.driveStorage._handleFile(req, file, cb);
        }
    }

    _removeFile(req, file, cb) {
        // We don't know easily which one handled it without tracking.
        // For now, no-op or try both? safely no-op.
        cb(null);
    }
}

module.exports = (opts) => new HybridStorage(opts);
