const sgMail = require('@sendgrid/mail');

// Set API Key
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
} else {
    console.warn("⚠️ SendGrid API Key missing!");
}

const sendEmail = async ({ to, subject, html }) => {
    const msg = {
        to,
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER, // Your verified sender identity
        subject,
        html,
    };

    try {
        await sgMail.send(msg);
        console.log(`✅ Email sent to ${to}`);
        return true;
    } catch (error) {
        console.error("❌ SendGrid Error:", error);
        if (error.response) {
            console.error(error.response.body);
        }
        throw error;
    }
};

module.exports = { sendEmail };
