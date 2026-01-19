const multer = require("multer");
const GoogleDriveStorage = require("./googleDriveStorage");

const storage = GoogleDriveStorage();

const upload = multer({ storage });

module.exports = upload;
