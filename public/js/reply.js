// Reply feature module
export class ReplyManager {
    constructor() {
        this.replyingTo = null;
    }

    startReply(messageId, username, text) {
        this.replyingTo = { _id: messageId, username, text };

        document.getElementById('replyToLabel').textContent = `Reply to ${username}`;
        document.getElementById('replyText').textContent = text;
        document.getElementById('replyPreview').classList.add('show');
        document.getElementById('messageInput').focus();
    }

    cancelReply() {
        this.replyingTo = null;
        document.getElementById('replyPreview').classList.remove('show');
    }

    getReplyData() {
        if (!this.replyingTo) return null;

        return {
            messageId: this.replyingTo._id,
            text: this.replyingTo.text,
            username: this.replyingTo.username
        };
    }

    jumpToMessage(messageId) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) {
            messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            messageEl.style.backgroundColor = '#2a3942';
            setTimeout(() => {
                messageEl.style.backgroundColor = '';
            }, 1000);
        }
    }

    renderReplyInMessage(replyData) {
        if (!replyData) return '';

        return `
      <div class="message-reply" onclick="replyManager.jumpToMessage('${replyData.messageId}')">
        <div class="message-reply-label">Reply to ${replyData.username}</div>
        <div class="message-reply-text">${replyData.text || 'Media'}</div>
      </div>
    `;
    }
}

// Create global instance
window.replyManager = new ReplyManager();
