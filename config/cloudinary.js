const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

// If CLOUDINARY_URL is provided (e.g. in Render/Heroku), the SDK auto-configures.
// Only manually config if using individual keys.
if (!process.env.CLOUDINARY_URL) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true
    });
}

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        const isRaw = file.mimetype.match(/application\/(pdf|msword|vnd.*|zip)|text\/plain/);

        if (isRaw) {
            return {
                folder: 'chat_app_uploads',
                resource_type: 'raw',
                // Keep extension for raw files so URL ends in .pdf/.doc etc
                public_id: file.originalname.replace(/\.[^/.]+$/, "") + "_" + Date.now() + (file.originalname.match(/\.[^/.]+$/)?.[0] || "")
            };
        }

        return {
            folder: 'chat_app_uploads',
            allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'mp3', 'wav', 'ogg', 'webm', 'mp4', 'mov', 'avi', 'mkv'],
            resource_type: 'auto'
        };
    }
});

module.exports = { cloudinary, storage };
