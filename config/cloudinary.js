const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        const isRaw = file.mimetype.match(/application\/(pdf|msword|vnd.*|zip)|text\/plain/);

        if (isRaw) {
            return {
                folder: 'chat_app_uploads',
                resource_type: 'raw',
                public_id: file.originalname.replace(/\.[^/.]+$/, "") + "_" + Date.now() // Unique name
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
