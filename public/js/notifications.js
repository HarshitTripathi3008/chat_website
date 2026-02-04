
export class NotificationManager {
    constructor() {
        this.permission = null;
        this.audio = new Audio('data:audio/mp3;base64,//uQRAAAAWMSLwUIYAAsYkXgoQwAEaYLWfkWgAI0wWs/ItAAAG84AAk5z//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQRLCgwpBGMlJkIz8jKhGvj4k6jzRnqasNKIeOHOrLd6DgQITIIZKFwZryUMgzCgNlxZMg6kw40x707mnRCvx9Jzw4imZyrloLUaiHMElFXbcf//8x1mCCxEs1i5v27zQwLMnm+fv/+AuxYgKUcAAA+/OuaZgo05oGuyf//3urNWoABIAAA/D/O4joigI9MSIHgd+Qm4INewCMECw8gTdcdBClIQ7oXZYjOfnowVEGM7zggx6nlMcZ8DerGP7/v//45MGceDAAAA//uQZAUAB1WI0PZugAAAAAoQwAAAEk3nRd2qAAAAACiDgAAAAAAABCqEEQRLCgwpBGMlJkIz8jKhGvj4k6jzRnqasNKIeOHOrLd6DgQITIIZKFwZryUMgzCgNlxZMg6kw40x707mnRCvx9Jzw4imZyrloLUaiHMElFXbcf//8x1mCCxEs1i5v27zQwLMnm+fv/+AuxYgKUcAAA+/OuaZgo05oGuyf//3urNWoABIAAA/D/O4joigI9MSIHgd+Qm4INewCMECw8gTdcdBClIQ7oXZYjOfnowVEGM7zggx6nlMcZ8DerGP7/v//45MGceDAAAA');
        this.init();
    }

    async init() {
        if ('Notification' in window) {
            this.permission = Notification.permission;
            if (this.permission === 'default') {
                // We'll wait for user interaction to request
            }
        }
    }

    async requestPermission() {
        if (!('Notification' in window)) return;

        try {
            this.permission = await Notification.requestPermission();
        } catch (err) {
            console.error("Error requesting notification permission:", err);
        }
    }

    playIncomingSound() {
        // User must have interacted with document first
        this.audio.currentTime = 0;
        this.audio.play().catch(e => console.log("Audio play failed (interaction needed):", e));
    }

    shouldNotify(message, currentConversationId) {
        // 1. If we are the sender, no notification needed
        if (message.userId === window.me._id) return false;

        // 2. If app is hidden (tab switching/minimized), ALWAYS notify
        if (document.hidden) return true;

        // 3. If app is visible but user is in a different conversation, notify
        if (message.conversationId !== currentConversationId) return true;

        // 4. If current conversation matches, just play sound maybe? (WhatsApp style - soft sound, no pop-up)
        // We will return 'sound-only' string to differentiate
        return 'sound-only';
    }

    async handleMessage(message, currentConversation) {
        if (!('Notification' in window)) return;

        const status = this.shouldNotify(message, currentConversation.id);

        if (!status) return;

        // Play sound in all valid notification cases
        this.playIncomingSound();

        // If status is 'sound-only', we stop here (user is looking at the chat)
        if (status === 'sound-only') return;

        // Prepare Notification Content
        let title = "New Message";
        let body = message.text;

        // Customize based on message type
        if (message.type === 'image') body = "📷 Photo";
        else if (message.type === 'voice') body = "🎤 Voice Message";
        else if (message.type === 'file') body = "qh File: " + (message.file.name || 'Attachment');

        // Add sender name
        if (message.username) {
            title = message.username;
        }

        // Show Browser Notification
        if (this.permission === 'granted') {
            try {
                const n = new Notification(title, {
                    body: body,
                    icon: '/images/logo.png', // Ensure this exists or use a default
                    tag: message.conversationId // Groups notifications by conversation
                });

                n.onclick = function () {
                    window.focus();
                    n.close();

                    // Optional: logic to switch to that chat if needed
                    // if (window.app) window.app.selectConversation(...)
                };
            } catch (e) {
                console.error("Notification creation failed:", e);
            }
        }
    }
}

// Global instance
window.NotificationManager = NotificationManager;
