// Emoji and Reactions module
export class EmojiManager {
    constructor() {
        this.emojiCategories = {
            'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴'],
            'Gestures': ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤝', '🙏', '💪'],
            'Hearts': ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
            'Objects': ['💬', '💭', '🗨️', '🗯️', '💤', '💢', '💣', '💥', '💦', '💨', '💫']
        };

        this.quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
    }

    initPicker() {
        const picker = document.getElementById('emojiPicker');
        if (!picker) return;

        let html = '';
        for (const [category, emojis] of Object.entries(this.emojiCategories)) {
            html += `<div class="emoji-category">
        <div class="emoji-category-title">${category}</div>
        <div class="emoji-grid">
          ${emojis.map(e => `<span class="emoji-item" onclick="emojiManager.insertEmoji('${e}')">${e}</span>`).join('')}
        </div>
      </div>`;
        }
        picker.innerHTML = html;
    }

    togglePicker() {
        document.getElementById('emojiPicker')?.classList.toggle('show');
    }

    insertEmoji(emoji) {
        const input = document.getElementById('messageInput');
        if (input) {
            input.value += emoji;
            input.focus();
        }
    }

    showReactionPicker(messageId) {
        // Remove existing picker
        const existing = document.querySelector('.reaction-picker');
        if (existing) existing.remove();

        const picker = document.createElement('div');
        picker.className = 'reaction-picker show';
        picker.innerHTML = this.quickReactions.map(e =>
            `<span class="reaction-option" onclick="emojiManager.addReaction('${messageId}', '${e}')">${e}</span>`
        ).join('');

        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) {
            messageEl.style.position = 'relative';
            messageEl.appendChild(picker);

            // Close on outside click
            setTimeout(() => {
                document.addEventListener('click', function closePickerHandler(e) {
                    if (!picker.contains(e.target)) {
                        picker.remove();
                        document.removeEventListener('click', closePickerHandler);
                    }
                });
            }, 100);
        }
    }

    addReaction(messageId, emoji) {
        if (window.socket) {
            window.socket.emit('reaction', { messageId, emoji });
        }
        document.querySelector('.reaction-picker')?.remove();
    }

    renderReactions(reactions, currentUserId, messageId) {
        if (!reactions || reactions.length === 0) return '';

        const html = reactions.map(r => {
            const isMine = r.users.some(u => u === currentUserId || u._id === currentUserId);
            return `<span class="reaction ${isMine ? 'my-reaction' : ''}" onclick="emojiManager.addReaction('${messageId}', '${r.emoji}')">
        <span class="reaction-emoji">${r.emoji}</span>
        <span class="reaction-count">${r.users.length}</span>
      </span>`;
        }).join('');

        return `<div class="message-reactions">${html}</div>`;
    }

    updateReaction(data) {
        const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
        if (!messageEl) return;

        const reactionsContainer = messageEl.querySelector('.message-reactions');
        const currentUserId = window.me?._id;

        if (reactionsContainer) {
            reactionsContainer.outerHTML = this.renderReactions(data.reactions, currentUserId, data.messageId);
        } else {
            const timeEl = messageEl.querySelector('.message-time');
            if (timeEl) {
                timeEl.insertAdjacentHTML('afterend', this.renderReactions(data.reactions, currentUserId, data.messageId));
            }
        }
    }
}

// Create global instance
window.emojiManager = new EmojiManager();
