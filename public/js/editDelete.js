// Edit and Delete feature module
export class EditDeleteManager {
    constructor(socket) {
        this.socket = socket;
    }

    startEdit(messageId, currentText) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageEl) return;

        const textContainer = messageEl.querySelector('.message-text');
        if (!textContainer) return;

        const originalHTML = textContainer.innerHTML;

        textContainer.innerHTML = `
      <input type="text" class="edit-input" value="${this.escapeHtml(currentText)}" id="editInput-${messageId}">
      <div class="edit-actions">
        <button class="edit-btn edit-cancel" onclick="editDeleteManager.cancelEdit('${messageId}', \`${originalHTML.replace(/`/g, '\\`')}\`)">Cancel</button>
        <button class="edit-btn edit-save" onclick="editDeleteManager.saveEdit('${messageId}')">Save</button>
      </div>
    `;

        const input = document.getElementById(`editInput-${messageId}`);
        input.focus();
        input.select();
    }

    cancelEdit(messageId, originalHTML) {
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageEl) return;

        const textContainer = messageEl.querySelector('.message-text');
        if (textContainer) {
            textContainer.innerHTML = originalHTML;
        }
    }

    saveEdit(messageId) {
        const newText = document.getElementById(`editInput-${messageId}`)?.value.trim();
        if (!newText) return;

        this.socket.emit('editMessage', { messageId, newText });
    }

    deleteMessage(messageId, deleteForEveryone = false) {
        const confirmed = confirm(deleteForEveryone ?
            'Delete this message for everyone?' :
            'Delete this message for you?');

        if (confirmed) {
            this.socket.emit('deleteMessage', { messageId, deleteForEveryone });
        }
    }

    handleEditUpdate(data) {
        const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
        if (!messageEl) return;

        const textContainer = messageEl.querySelector('.message-text');
        if (textContainer) {
            textContainer.textContent = data.newText;
        }

        // Add edited label
        const timeEl = messageEl.querySelector('.message-time');
        if (timeEl && !timeEl.querySelector('.edited-label')) {
            timeEl.innerHTML += '<span class="edited-label">edited</span>';
        }
    }

    handleDeleteUpdate(data) {
        const messageEl = document.querySelector(`[data-message-id="${data.messageId}"]`);
        if (!messageEl) return;

        // Always remove the message completely (Telegram-style)
        messageEl.remove();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Will be initialized with socket
window.editDeleteManager = null;
