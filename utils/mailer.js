const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Verify connection configuration on startup
transporter.verify(function (error, success) {
  if (error) {
    console.warn("❌ SMTP Connection Error:", error);
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn("   -> Check if EMAIL_USER and EMAIL_PASS are set in Render Environment Variables.");
    }
  } else {
    console.log("✅ SMTP Server is ready to send emails");
  }
});

module.exports = transporter;
