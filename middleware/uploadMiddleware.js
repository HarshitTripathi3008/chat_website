const multer = require("multer");
const HybridStorage = require("./hybridStorage");

const storage = HybridStorage();

const upload = multer({ storage });

module.exports = upload;
