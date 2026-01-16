// Main application logic
import { ReplyManager } from './reply.js';
import { EditDeleteManager } from './editDelete.js';
import { EmojiManager } from './emoji.js';
import { Toast } from './toast.js';


class ChatApp {
    constructor() {
        this.socket = null;
        this.me = null;
        this.currentConversation = { type: 'channel', id: null };
        this.conversations = [];
        this.channels = [];
        this.onlineUsers = [];
        this.currentTab = 'dms';
        this.isMobile = window.innerWidth <= 900;

        // Handle resize
        window.addEventListener('resize', () => {
            this.isMobile = window.innerWidth <= 900;
            if (!this.isMobile) {
                // Reset styles on desktop if needed
                document.getElementById('sidebar').classList.remove('mobile-hidden');
            }
        });

    }

    async init() {
        // Check if user is logged in
        try {
            const res = await fetch("/me");
            if (!res.ok) throw new Error();
            this.me = await res.json();
            window.me = this.me;

            document.getElementById('login').style.display = "none";
            document.getElementById('app').style.display = "flex";

            this.initSocket();
            this.initManagers();
            this.loadInitialData();

            // Check if user just joined a room via invite link
            const urlParams = new URLSearchParams(window.location.search);
            const joinedRoomId = urlParams.get('joined_room');
            if (joinedRoomId) {
                // Wait for conversations to load, then switch to the room
                setTimeout(async () => {
                    await this.loadConversations();
                    this.switchTab('rooms');
                    this.selectConversation(joinedRoomId, 'group');
                    // Clear URL parameter
                    window.history.replaceState({}, document.title, '/');
                }, 1000);
            }
        } catch (err) {
            document.getElementById('login').style.display = "flex";
            document.getElementById('app').style.display = "none";
        }
    }

    initSocket() {
        this.socket = io();
        window.socket = this.socket;

        this.socket.on("me", user => {
            this.me = user;
            window.me = user;
        });

        this.socket.on("message", (data) => this.addMessage(data));

        this.socket.on("userTyping", d => {
            document.getElementById('typing').innerText = d.username + " is typing...";
        });

        this.socket.on("userStoppedTyping", () => {
            document.getElementById('typing').innerText = "";
        });

        this.socket.on("reaction", (data) => window.emojiManager.updateReaction(data));

        this.socket.on("editMessage", (data) => window.editDeleteManager.handleEditUpdate(data));

        this.socket.on("deleteMessage", (data) => window.editDeleteManager.handleDeleteUpdate(data));

        this.socket.on("onlineUsers", users => {
            this.onlineUsers = users;
            if (this.currentTab === 'global') this.renderOnlineUsers();
        });

        // Offline/Online detection
        this.socket.on('disconnect', () => {
            document.getElementById('currentChatStatus').textContent = 'Connecting...';
        });

        this.socket.on('connect', () => {
            if (this.currentConversation.type === 'global') {
                document.getElementById('currentChatStatus').textContent = 'online';
            }
            // Reload data after reconnection
            this.loadInitialData();
        });
    }

    initManagers() {
        window.emojiManager.initPicker();
        window.editDeleteManager = new EditDeleteManager(this.socket);
        window.callManager = new CallManager(this.socket, this.me);
    }

    loadInitialData() {
        this.loadConversations(); // Load DMs first
        this.loadChannels();
        this.loadOnlineUsers();
        // this.loadHistory(); // Removed global chat history
    }

    async loadChannels() {
        try {
            const res = await fetch("/channels");
            if (!res.ok) throw new Error("Failed to load channels");
            this.channels = await res.json();
            if (this.currentTab === 'channels') this.renderChannels();
        } catch (error) {
            console.error(error);
        }
    }

    renderChannels() {
        const html = this.channels.map(ch => {
            const isSubscribed = ch.participants && ch.participants.some(p => String(p) === String(this.me._id));
            return `
            <div class="chat-item" onclick="app.selectConversation('${ch._id}', 'channel', this)">
                <div class="chat-avatar" style="background: linear-gradient(135deg, #FF9966, #FF5E62)">#</div>
                <div class="chat-info">
                    <div class="chat-name">
                        ${ch.name}
                        ${ch.isNSFW ? '<span style="font-size: 10px; background: #ff4444; padding: 2px 4px; border-radius: 4px; margin-left: 5px;">18+</span>' : ''}
                    </div>
                     <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div class="chat-last">${ch.description || 'Meme Channel'}</div>
                        ${!isSubscribed ? `<button class="list-subscribe-btn" onclick="app.quickSubscribe('${ch._id}', event)">Subscribe</button>` : ''}
                    </div>
                </div>
            </div>
        `}).join('');
        document.getElementById('chatList').innerHTML = html;
    }

    async quickSubscribe(channelId, event) {
        event.stopPropagation(); // Prevent opening the channel view "locked" state
        await this.toggleSubscription(channelId, false); // false = was not subscribed, so join
    }


    async loadOnlineUsers() {
        try {
            const res = await fetch("/online-users");
            if (!res.ok) throw new Error('Failed to load online users');
            this.onlineUsers = await res.json();
            if (this.currentTab === 'global') {
                this.renderOnlineUsers();
            }
        } catch (error) {
            console.error('Error loading online users:', error);
        }
    }

    renderOnlineUsers() {
        const html = this.onlineUsers.map(u =>
            `<div class="chat-item">
        <div class="chat-avatar">
          ${this.getAvatar(u.name, u.avatar)}
          <div class="online-dot"></div>
        </div>
        <div class="chat-info">
          <div class="chat-name">${u.name}</div>
          <div style="font-size: 11px; color: var(--text-secondary);">${u.email}</div>
        </div>
      </div>`
        ).join('');
        document.getElementById('chatList').innerHTML = html;
    }

    async loadHistory() {
        try {
            const res = await fetch("/messages");
            if (!res.ok) throw new Error('Failed to load message history');
            const msgs = await res.json();
            document.getElementById('messages').innerHTML = '';
            msgs.forEach(msg => this.addMessage(msg));
        } catch (error) {
            console.error('Error loading message history:', error);
            Toast.show('Failed to load messages', 'error');
        }

    }

    sendMessage() {
        const text = document.getElementById('messageInput').value.trim();
        if (!text) return;

        const data = { text };
        if (this.currentConversation.id) {
            data.conversationId = this.currentConversation.id;
        }

        // Add reply data if replying
        const replyData = window.replyManager.getReplyData();
        if (replyData) {
            data.replyTo = replyData;
        }

        this.socket.emit("message", data);
        document.getElementById('messageInput').value = "";
        document.getElementById('emojiPicker').classList.remove('show');
        window.replyManager.cancelReply();
    }

    addMessage(data) {
        // Filter messages based on current conversation
        if (this.currentConversation.type === 'global') {
            // Only show messages without conversationId (community chat)
            if (data.conversationId) return;
        } else {
            // NOTIFICATIONS Logic
            // If message is for a channel I'm subscribed to, but not currently viewing
            if (data.conversationId && this.currentTab === 'channels') {
                // Check if I am subscribed to this channel
                const channel = this.channels.find(c => c._id === data.conversationId);

                // Use robust comparison
                const isSubscribed = channel && channel.participants && channel.participants.some(p => String(p) === String(this.me._id));

                if (isSubscribed) {
                    // Check if I'm not viewing it right now
                    if (this.currentConversation.id !== data.conversationId) {
                        Toast.show(`New meme in ${channel.name}: ${data.text || 'Image'}`, 'info');
                    }
                }
            }


            // Only show messages for the current conversation in the chat area
            if (!data.conversationId || data.conversationId !== this.currentConversation.id) return;
        }


        // Update conversation list if message is for a DM/Room
        if (data.conversationId) {
            this.updateConversationPreview(data);
        }

        const div = document.createElement("div");
        const isMine = data.userId === this.me._id;

        div.className = "message " + (isMine ? "sent" : "received");
        div.dataset.messageId = data._id;

        let content = '';

        // Forwarded label
        if (data.forwardedFrom) {
            content += `<div class="forwarded-label">Forwarded from ${data.forwardedFrom.username}</div>`;
        }

        // Reply display
        if (data.replyTo) {
            content += window.replyManager.renderReplyInMessage(data.replyTo);
        }

        // Message content
        if (data.type === 'voice') {
            content += `
        ${!isMine ? `<b>${data.username}</b><br>` : ""}
        ${window.voiceManager.renderVoiceMessage(data)}
      `;
        } else if (data.type === 'image') {
            content += `
        ${!isMine ? `<b>${data.username}</b><br>` : ""}
        <img src="${data.file.url}" alt="Image" style="max-width: 300px; border-radius: 8px; cursor: pointer;" onclick="window.open('${data.file.url}', '_blank')" onerror="this.style.display='none'; this.parentElement.insertAdjacentHTML('beforeend', '<div class=\'broken-img\' style=\'padding:10px; background:#333; border-radius:8px; color:#fff;\'>⚠️ Image not found</div>');">
        <button class="save-meme-btn" onclick="app.saveMeme('${data._id}')" title="Save to Collection">💾</button>
      `;

        } else if (data.type === 'file') {
            // Fix: Cloudinary sometimes returns image URL for raw files if uploaded incorrectly.
            // valid raw URL should be /raw/upload, but might be /image/upload in DB.
            // enhanced check: if it looks like a doc but has image url, swap it.
            let fileUrl = data.file.url;
            if (fileUrl.includes('/image/upload/') && fileUrl.match(/\.(pdf|doc|docx|zip|rar|txt)$/i)) {
                fileUrl = fileUrl.replace('/image/upload/', '/raw/upload/');
            }

            content += `
        ${!isMine ? `<b>${data.username}</b><br>` : ""}
        <a href="${fileUrl}" download="${data.file.name}" target="_blank" class="file-attachment">📎 ${data.file.name}</a>
      `;
        } else if (data.type === 'room_invite') {
            // Special rendering for room invites
            const roomName = data.metadata?.roomName || 'a room';
            const inviteToken = data.metadata?.inviteToken;
            content += `
                <div class="room-invite-message" style="background: linear-gradient(135deg, rgba(0, 136, 204, 0.1), rgba(0, 136, 204, 0.05)); padding: 15px; border-radius: 12px; border-left: 4px solid var(--telegram-blue);">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <span style="font-size: 24px;">🔗</span>
                        <div>
                            <div style="font-weight: 600; color: var(--text-primary);">Room Invitation</div>
                            <div style="font-size: 14px; color: var(--text-secondary);">You've been invited to join</div>
                        </div>
                    </div>
                    <div style="font-size: 16px; font-weight: 500; margin-bottom: 12px; color: var(--telegram-blue);">${roomName}</div>
                    ${inviteToken ? `<button onclick="joinRoom('${inviteToken}')" style="background: var(--telegram-blue); color: white; border: none; padding: 10px 20px; border-radius: 20px; cursor: pointer; font-weight: 500; transition: all 0.2s;" onmouseover="this.style.background='var(--telegram-blue-light)'" onmouseout="this.style.background='var(--telegram-blue)'">Join Room</button>` : ''}
                </div>
            `;
        } else {
            content += `
        ${!isMine ? `<b>${data.username}</b><br>` : ""}
        <span class="message-text">${data.text}</span>
      `;
        }

        const reactionsHtml = window.emojiManager.renderReactions(data.reactions || [], this.me._id, data._id);

        // Time and edited label
        const timeHtml = `<div class="message-time">
      ${new Date(data.createdAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      ${data.editedAt ? '<span class="edited-label">edited</span>' : ''}
    </div>`;

        // Action buttons
        const actionsHtml = `
      <div class="message-actions">
        <button class="action-btn" onclick="app.replyToMessage('${data._id}', '${data.username}', '${(data.text || '').replace(/'/g, "\\'")}')" title="Reply">↩️</button>
        ${isMine ? `<button class="action-btn" onclick="app.editMessage('${data._id}', '${(data.text || '').replace(/'/g, "\\'")}')" title="Edit">✏️</button>` : ''}
        ${isMine ? `<button class="action-btn" onclick="app.deleteMessage('${data._id}')" title="Delete">🗑️</button>` : ''}
        <button class="action-btn" onclick="emojiManager.showReactionPicker('${data._id}')" title="React">😊</button>
      </div>
    `;

        div.innerHTML = `
      ${actionsHtml}
      ${content}
      ${timeHtml}
      ${reactionsHtml}
    `;

        document.getElementById('messages').appendChild(div);
        document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
    }

    replyToMessage(messageId, username, text) {
        window.replyManager.startReply(messageId, username, text);
    }

    editMessage(messageId, text) {
        window.editDeleteManager.startEdit(messageId, text);
    }

    deleteMessage(messageId) {
        window.editDeleteManager.deleteMessage(messageId, true);
    }

    updateConversationPreview(message) {
        const conv = this.conversations.find(c => c._id === message.conversationId);
        if (conv) {
            conv.lastMessage = {
                text: message.text || 'Media',
                timestamp: new Date(),
                userId: message.userId
            };
            conv.updatedAt = new Date();

            // Re-sort conversations by most recent
            if (this.currentTab === 'dms') {
                this.dmConversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                this.renderConversations(this.dmConversations);
            } else if (this.currentTab === 'rooms') {
                this.roomConversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                this.renderConversations(this.roomConversations);
            }
        }
    }

    getAvatar(name, avatarUrl = null) {
        if (avatarUrl) {
            return `<img src="${avatarUrl}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;" onerror="this.onerror=null;this.parentElement.innerText='${(name || '?').charAt(0).toUpperCase()}';">`;
        }
        if (!name) return '?';
        return name.charAt(0).toUpperCase();
    }

    async loadConversations() {
        try {
            const res = await fetch("/conversations");
            if (!res.ok) throw new Error('Failed to load conversations');
            this.conversations = await res.json();

            // Separate by type
            this.dmConversations = this.conversations.filter(c => c.type === 'direct');
            this.roomConversations = this.conversations.filter(c => c.type === 'group');

            // Render based on current tab
            if (this.currentTab === 'dms') {
                this.renderConversations(this.dmConversations);
            } else if (this.currentTab === 'rooms') {
                this.renderConversations(this.roomConversations);
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
            Toast.show('Failed to load conversations', 'error');
        }

    }

    renderConversations(conversations) {
        if (!conversations || conversations.length === 0) {
            const emptyMessage = this.currentTab === 'dms'
                ? 'No direct messages yet. Click "+ New" to start a conversation!'
                : 'No rooms yet. Click "+ New" to create a room!';
            document.getElementById('chatList').innerHTML =
                `<div style="padding: 20px; text-align: center; color: var(--text-secondary);">${emptyMessage}</div>`;
            return;
        }

        const html = conversations.map(conv => {
            // For DMs, get the other participant
            let displayName = conv.name;
            let avatar = 'G';

            if (conv.type === 'direct') {
                const otherUser = conv.participants.find(p => p._id !== this.me._id);
                displayName = otherUser ? otherUser.name : 'Unknown';
                avatar = this.getAvatar(displayName, otherUser ? otherUser.avatar : null);
            } else {
                avatar = this.getAvatar(conv.name);
            }

            const lastMsg = conv.lastMessage
                ? `<div class="chat-last">${conv.lastMessage.text || 'Media'}</div>`
                : '<div class="chat-last">No messages yet</div>';

            const time = conv.lastMessage
                ? new Date(conv.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';

            return `
                <div class="chat-item" onclick="app.selectConversation('${conv._id}', '${conv.type}', this)">
                    <div class="chat-avatar">${avatar}</div>
                    <div class="chat-info">
                        <div class="chat-name">
                            ${displayName}
                            ${time ? `<span style="font-size: 11px; color: var(--text-secondary);">${time}</span>` : ''}
                        </div>
                        ${conv.type === 'direct' && conv.participants.find(p => p._id !== this.me._id)?.email
                    ? `<div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">${conv.participants.find(p => p._id !== this.me._id).email}</div>`
                    : ''}
                        ${lastMsg}
                    </div>
                </div>
            `;
        }).join('');

        document.getElementById('chatList').innerHTML = html;
    }

    async selectConversation(conversationId, type, clickedElement = null) {
        this.currentConversation = { id: conversationId, type };

        // Find conversation details
        let conv;

        // Fix: Prioritize channels array for channel type because it contains subscriberCount
        if (type === 'channel') {
            conv = this.channels.find(c => c._id === conversationId);
        }

        // If not found (or not channel), check conversations
        if (!conv) {
            conv = this.conversations.find(c => c._id === conversationId);
        }


        if (!conv) {
            console.error('Conversation not found:', conversationId);
            return;
        }


        // Update header
        let displayName = conv.name;
        let avatar = 'G';

        if (type === 'direct') {
            const otherUser = conv.participants.find(p => p._id !== this.me._id);
            displayName = otherUser ? otherUser.name : 'Unknown';
            avatar = this.getAvatar(displayName, otherUser ? otherUser.avatar : null);
            document.getElementById('currentChatStatus').textContent = otherUser ? otherUser.email : '';
        } else if (type === 'channel') {
            avatar = '<div style="width: 100%; height: 100%; border-radius: 50%; background: linear-gradient(135deg, #FF9966, #FF5E62); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">#</div>';
            document.getElementById('currentChatStatus').textContent = `${conv.subscriberCount || 0} subscribers`;
        } else {
            avatar = this.getAvatar(conv.name);
            document.getElementById('currentChatStatus').textContent = `${conv.participants.length} members`;
        }


        document.getElementById('currentChatName').textContent = displayName;
        document.getElementById('currentChatAvatar').innerHTML = avatar;

        // Channel Actions
        const headerRight = document.querySelector('.chat-header-right');
        // Clear previous buttons
        headerRight.innerHTML = '';

        if (type === 'direct') {
            const callBtn = document.createElement('button');
            callBtn.className = 'header-btn';
            callBtn.innerHTML = '📞';
            callBtn.title = 'Audio Call';
            callBtn.onclick = () => {
                const otherUser = conv.participants.find(p => p._id !== this.me._id);
                if (otherUser) window.callManager.startCall(otherUser._id, otherUser);
            };
            headerRight.appendChild(callBtn);
        }

        if (type === 'channel') {
            // Fix: Ensure we compare strings
            const isSubscribed = conv.participants.some(p => String(p) === String(this.me._id));
            const subBtn = document.createElement('button');
            subBtn.className = isSubscribed ? 'header-btn secondary' : 'header-btn primary';
            subBtn.textContent = isSubscribed ? 'Unsubscribe' : 'Subscribe';
            subBtn.onclick = () => this.toggleSubscription(conversationId, isSubscribed);
            headerRight.appendChild(subBtn);

            // Hide input
            document.querySelector('.chat-input').style.display = 'none';
        } else if (type === 'group') {
            // Show input
            document.querySelector('.chat-input').style.display = 'flex';

            // Room Actions
            const isOwner = conv.createdBy === this.me._id;
            const actionBtn = document.createElement('button');

            if (isOwner) {
                actionBtn.className = 'header-btn secondary';
                actionBtn.style.color = '#ff4444';
                actionBtn.textContent = 'Delete Room';
                actionBtn.onclick = () => this.deleteRoom(conversationId);
            } else {
                actionBtn.className = 'header-btn secondary';
                actionBtn.textContent = 'Leave Room';
                actionBtn.onclick = () => this.leaveRoom(conversationId);
            }
            headerRight.appendChild(actionBtn);

            // Invite Button
            if (isOwner) { // Everyone can invite?? Let's allow everyone
                const inviteBtn = document.createElement('button');
                inviteBtn.className = 'header-btn primary';
                inviteBtn.textContent = 'Invite';
                inviteBtn.style.marginLeft = '8px';
                inviteBtn.onclick = () => this.showRoomInviteModal();
                headerRight.appendChild(inviteBtn);
            }

        } else {
            // Direct message logic or fallback
            document.querySelector('.chat-input').style.display = 'flex';
        }


        // Highlight selected conversation
        const chatItem = clickedElement ? clickedElement.closest('.chat-item') : null;
        if (chatItem) {
            document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
            chatItem.classList.add('active');
        }

        // Access Control for Channels
        if (type === 'channel') {
            const isSubscribed = conv.participants.some(p => String(p) === String(this.me._id));
            if (!isSubscribed) {
                // Not subscribed: Show "Locked" view
                const messagesEl = document.getElementById('messages');
                messagesEl.innerHTML = `
                    <div class="locked-channel-view">
                        <div style="font-size: 48px; margin-bottom: 20px;">🔒</div>
                        <h3>Subscribers Only</h3>
                        <p>Subscribe to <b>${conv.name}</b> to view memes and messages.</p>
                    </div>
                `;
                // Hide input
                document.querySelector('.chat-input').style.display = 'none';
                return; // Stop here, don't load messages
            }
        }

        // Load messages for this conversation
        await this.loadConversationMessages(conversationId);

        // Auto hide sidebar on mobile after selection
        this.hideSidebarMobile();
    }



    scrollToBottom() {
        const messages = document.getElementById('messages');
        messages.scrollTop = messages.scrollHeight;
    }

    async loadConversationMessages(conversationId) {
        // Show Skeleton Loading
        const messagesEl = document.getElementById('messages');
        messagesEl.innerHTML = Array(5).fill(0).map((_, i) => `
            <div class="skeleton-message" style="opacity: ${1 - (i * 0.15)}">
                <div class="skeleton-avatar skeleton"></div>
                <div style="flex:1">
                    <div class="skeleton-text skeleton" style="width: 30%"></div>
                    <div class="skeleton-text skeleton" style="height: 40px; width: ${Math.random() * 40 + 40}%"></div>
                </div>
            </div>
        `).join('');

        try {
            const res = await fetch(`/conversations/${conversationId}/messages`);
            if (!res.ok) throw new Error('Failed to load conversation messages');
            const msgs = await res.json();

            messagesEl.innerHTML = ''; // Clear skeleton

            if (msgs.length === 0) {
                messagesEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-secondary)">No messages here yet. Say hi! 👋</div>';
            } else {
                msgs.forEach(msg => this.addMessage(msg));
            }

            // Auto-scroll to latest message
            setTimeout(() => this.scrollToBottom(), 100);
            // Double check for images
            setTimeout(() => this.scrollToBottom(), 500);

        } catch (error) {
            console.error('Error loading conversation messages:', error);
            Toast.show('Failed to load messages for this conversation.', 'error');
            messagesEl.innerHTML = ''; // Clear skeleton on error
        }
    }

    switchTab(tab) {
        this.currentTab = tab;
        this.updateTabButtons(tab); // Extracted helper method

        // Clear search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';

        if (tab === 'channels') {
            this.renderChannels();
        } else if (tab === 'dms') {
            this.renderConversations(this.dmConversations);
        } else if (tab === 'rooms') {
            this.renderConversations(this.roomConversations);
        } else if (tab === 'saved') {
            this.renderSavedMemes();
        }

    }

    updateTabButtons(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.id === `btn-${tab}`) btn.classList.add('active');
        });
    }


    async showRoomInviteModal() {
        // Check if user is actually inside a room (not just on rooms tab)
        if (!this.currentConversation.id || this.currentConversation.type !== 'group') {
            Toast.show('Please select a room first', 'info');
            return;
        }


        const modal = document.getElementById('roomInviteModal');
        const content = document.getElementById('roomInviteContent');

        // Get DM conversations
        const dms = this.dmConversations;

        if (dms.length === 0) {
            content.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No DM conversations yet. Start a DM first!</p>';
        } else {
            const html = `
                <p style="margin-bottom: 15px; color: var(--text-secondary);">Select a conversation to send the invite:</p>
                <div style="max-height: 300px; overflow-y: auto;">
                    ${dms.map(dm => {
                const otherUser = dm.participants.find(p => p._id !== this.me._id);
                if (!otherUser) return '';

                return `
                            <div class="user-item" style="padding: 12px; border-radius: 8px; margin-bottom: 8px; background: var(--bg-secondary); display: flex; align-items: center; justify-content: space-between;">
                                <div style="display: flex; align-items: center;">
                                    <div class="chat-avatar" style="width: 36px; height: 36px; line-height: 36px; margin-right: 12px;">
                                        ${this.getAvatar(otherUser.name, otherUser.avatar)}
                                    </div>
                                    <div>
                                        <div style="font-weight: 500;">${otherUser.name}</div>
                                        <div style="font-size: 11px; color: var(--text-secondary);">${otherUser.email}</div>
                                    </div>
                                </div>
                                <button onclick="app.sendRoomInvite('${dm._id}')" class="header-btn" style="font-size: 13px; padding: 6px 16px;">Invite</button>
                            </div>
                        `;
            }).join('')}
                </div>
            `;
            content.innerHTML = html;
        }

        modal.classList.add('show');
    }

    async sendRoomInvite(conversationId) {
        try {
            const roomId = this.currentConversation.id;

            const res = await fetch(`/rooms/${roomId}/invite/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationId })
            });

            if (!res.ok) throw new Error('Failed to send invite');

            const result = await res.json();

            // Close modal
            document.getElementById('roomInviteModal').classList.remove('show');

            Toast.show('Invite sent successfully!', 'success');
        } catch (error) {
            console.error('Error sending room invite:', error);
            Toast.show('Failed to send invite', 'error');
        }

    }

    async showSettingsModal() {
        const modal = document.getElementById('settingsModal');
        const nameInput = document.getElementById('settingsName');
        const preview = document.getElementById('settingsAvatarPreview');

        nameInput.value = this.me.name;
        preview.innerHTML = this.getAvatar(this.me.name, this.me.avatar);

        // Reset status
        document.getElementById('settingsStatus').innerHTML = '';
        document.getElementById('settingsAvatar').value = '';

        // Handle avatar preview on file selection
        const fileInput = document.getElementById('settingsAvatar');
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    preview.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
                };
                reader.readAsDataURL(file);
            }
        };

        // Add Logout Button (if not already present or just simple re-render)
        const settingsStatus = document.getElementById('settingsStatus');
        // Clear previous buttons if any appended manually
        const existingLogout = document.getElementById('settingsLogoutBtn');
        if (existingLogout) existingLogout.remove();

        const logoutBtn = document.createElement('button');
        logoutBtn.id = 'settingsLogoutBtn';
        logoutBtn.className = 'btn secondary';
        logoutBtn.style.marginTop = '15px';
        logoutBtn.style.width = '100%';
        logoutBtn.style.color = '#ff4444';
        logoutBtn.style.borderColor = '#ff4444';
        logoutBtn.textContent = 'Log Out';
        logoutBtn.onclick = () => window.location.href = '/auth/logout';

        // Append after the save button if possible, or to the modal content end.
        // The modal HTML structure in index.html is likely static. 
        // Let's append it to the settings status container for now, or the form container.
        // Actually, let's just insert it after the Save button.
        const saveBtn = document.querySelector('#settingsModal .btn.primary');
        if (saveBtn && saveBtn.parentNode) {
            saveBtn.parentNode.insertBefore(logoutBtn, saveBtn.nextSibling);
        } else {
            // Fallback
            settingsStatus.appendChild(logoutBtn);
        }

        modal.classList.add('show');
    }

    async toggleSubscription(channelId, isSubscribed) {
        try {
            const endpoint = isSubscribed ? 'leave' : 'join';
            const res = await fetch(`/channels/${channelId}/${endpoint}`, { method: 'POST' });
            if (!res.ok) throw new Error(`Failed to ${endpoint} channel`);

            // Reload channel data
            await this.loadChannels();
            // Reload current view
            const conv = this.channels.find(c => c._id === channelId);
            if (conv && this.currentConversation.id === channelId) {
                // Update header
                document.getElementById('currentChatStatus').textContent = `${conv.participants.length} subscribers`;
                // Re-run selectConversation logic to update button
                this.selectConversation(channelId, 'channel');
            }
            Toast.show(isSubscribed ? 'Unsubscribed' : 'Subscribed!', 'success');
        } catch (err) {
            console.error(err);
            Toast.show('Action failed', 'error');
        }
    }

    async saveProfile() {

        const name = document.getElementById('settingsName').value.trim();
        const fileInput = document.getElementById('settingsAvatar');
        const statusDiv = document.getElementById('settingsStatus');
        const file = fileInput.files[0];

        if (!name) {
            statusDiv.innerHTML = '<span style="color: #ff4444;">Name cannot be empty</span>';
            return;
        }

        const formData = new FormData();
        formData.append('name', name);
        if (file) {
            formData.append('avatar', file);
        }

        try {
            statusDiv.innerHTML = '<span style="color: var(--text-secondary);">Saving...</span>';

            const res = await fetch('/me/update', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error('Failed to update profile');

            const updatedUser = await res.json();
            this.me = updatedUser;
            window.me = updatedUser;

            statusDiv.innerHTML = '<span style="color: var(--accent-green);">Profile updated! Reloading...</span>';

            setTimeout(() => {
                location.reload();
            }, 1000);

        } catch (error) {
            console.error('Error updating profile:', error);
            statusDiv.innerHTML = '<span style="color: #ff4444;">Failed to update profile</span>';
        }
    }

    // ===== SIDEBAR NAVIGATION =====
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const chatArea = document.getElementById('chatArea');

        if (this.isMobile) {
            // Mobile: Toggle visibility
            sidebar.classList.toggle('mobile-hidden');
        } else {
            // Desktop: Toggle collapsed state
            sidebar.classList.toggle('closed');
            chatArea.classList.toggle('expanded');
        }
    }

    showSidebar() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('mobile-hidden');
    }

    hideSidebarMobile() {
        if (this.isMobile) {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.add('mobile-hidden');
        }
    }

    async renderSavedMemes() {
        try {
            const res = await fetch('/memes/saved');
            if (!res.ok) throw new Error('Failed to fetch saved memes');
            const savedIds = await res.json();
            const messages = savedIds;

            if (messages.length === 0) {
                document.getElementById('chatList').innerHTML =
                    '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No saved memes yet.</div>';
                return;
            }

            const html = messages.map(msg => {
                const isImage = msg.type === 'image';
                const preview = isImage ? '📷 Image' : msg.text;
                const source = msg.metadata && msg.metadata.source ? msg.metadata.source : 'Unknown Source';
                // Use single quotes for HTML attributes, escaping inner single quotes if necessary
                return `
                    <div class="chat-item" onclick="app.viewSavedMeme('${msg._id}')">
                        <div class="chat-avatar" style="background: var(--telegram-blue); color: white;">💾</div>
                        <div class="chat-info">
                            <div class="chat-name">${source}</div>
                            <div class="chat-last">${preview}</div>
                        </div>
                    </div>`;
            }).join('');

            document.getElementById('chatList').innerHTML = html;
            this.savedMessagesCache = messages;

        } catch (error) {
            console.error(error);
            Toast.show('Failed to load saved memes', 'error');
        }
    }

    async deleteSavedMeme(msgId) {
        // if (!confirm('Remove this meme from collection?')) return;

        try {
            const res = await fetch(`/memes/${msgId}/save`, { method: 'DELETE' });
            if (res.ok) {
                Toast.show('Meme removed', 'success');
                this.renderSavedMemes(); // Refresh list
                document.getElementById('messages').innerHTML = ''; // Clear view
            }
        } catch (e) {
            Toast.show('Failed to remove meme', 'error');
        }
    }

    async deleteRoom(roomId) {
        if (!confirm('Are you sure you want to delete this room? This cannot be undone.')) return;
        try {
            const res = await fetch(`/rooms/${roomId}`, { method: 'DELETE' });
            if (res.ok) {
                Toast.show('Room deleted', 'success');
                // Remove locally
                this.conversations = this.conversations.filter(c => c._id !== roomId);
                this.roomConversations = this.roomConversations.filter(c => c._id !== roomId);
                this.switchTab('rooms');
            } else {
                Toast.show('Failed to delete room', 'error');
            }
        } catch (e) {
            Toast.show('Error deleting room', 'error');
        }
    }

    async leaveRoom(roomId) {
        if (!confirm('Leave this room?')) return;
        try {
            const res = await fetch(`/rooms/${roomId}/leave`, { method: 'POST' });
            if (res.ok) {
                Toast.show('Left room', 'success');
                // Remove locally
                this.conversations = this.conversations.filter(c => c._id !== roomId);
                this.roomConversations = this.roomConversations.filter(c => c._id !== roomId);
                this.switchTab('rooms');
            }
        } catch (e) {
            Toast.show('Error leaving room', 'error');
        }
    }

    viewSavedMeme(msgId) {
        // Show the meme in the main chat area (as if it's a single message conversation)
        // This is a quick hack to reuse the view
        const msg = this.savedMessagesCache.find(m => m._id === msgId);
        if (!msg) return;

        document.getElementById('messages').innerHTML = '';
        // Show Source as Name
        const source = msg.metadata && msg.metadata.source ? msg.metadata.source : (msg.username || 'MemeBot');
        document.getElementById('currentChatName').textContent = source;
        document.getElementById('currentChatStatus').textContent = "Saved from " + (msg.username || 'MemeBot');
        document.getElementById('currentChatAvatar').innerHTML = '<div style="width:100%;height:100%;border-radius:50%;background:var(--telegram-blue);display:flex;align-items:center;justify-content:center;color:white;">💾</div>';

        this.addMessage(msg, true);

        // Hide input
        document.querySelector('.chat-input').style.display = 'none';
        // Clear header buttons
        document.querySelector('.chat-header-right').innerHTML = '';
        // Add Unsave Button 
        const headerRight = document.querySelector('.chat-header-right');
        headerRight.innerHTML = '';
        const unsaveBtn = document.createElement('button');
        unsaveBtn.className = 'header-btn secondary'; // changed style
        unsaveBtn.textContent = 'Unsave';
        unsaveBtn.onclick = () => this.deleteSavedMeme(msg._id);
        headerRight.appendChild(unsaveBtn);
    }

    async saveMeme(msgId) {
        try {
            const res = await fetch(`/memes/${msgId}/save`, { method: 'POST' });
            if (res.ok) {
                Toast.show('Meme saved to collection!', 'success');
            } else {
                Throw('Failed');
            }
        } catch (e) {
            Toast.show('Failed to save meme', 'error');
        }
    }

    async showNewChatModal() {

        const modal = document.getElementById('newChatModal');
        const modalBody = document.getElementById('modalBody');

        if (this.currentTab === 'dms') {
            document.getElementById('modalTitle').textContent = 'New Direct Message';

            // Fetch all users
            const res = await fetch('/users');
            const users = await res.json();

            // Filter out current user
            const otherUsers = users.filter(u => u._id !== this.me._id);

            modalBody.innerHTML = `
                <div style="margin-bottom: 20px;">
                    <h4 style="margin-bottom: 10px; color: var(--text-primary);">Select a user:</h4>
                    <div id="userList" style="max-height: 300px; overflow-y: auto;">
                        ${otherUsers.map(u => `
                            <div class="user-item" onclick="app.startDirectConversation('${u._id}')" 
                                 style="padding: 12px; cursor: pointer; border-radius: 8px; margin-bottom: 8px; 
                                        background: var(--bg-darker); display: flex; align-items: center; gap: 12px;
                                        transition: background 0.2s;">
                                <div class="chat-avatar" style="width: 40px; height: 40px; font-size: 16px;">
                                    ${this.getAvatar(u.name, u.avatar)}
                                </div>
                                <div>
                                    <div style="font-weight: 500; color: var(--text-primary);">${u.name}</div>
                                    <div style="font-size: 12px; color: var(--text-secondary);">${u.email}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div style="border-top: 1px solid var(--border-color); padding-top: 20px; margin-top: 20px;">
                    <h4 style="margin-bottom: 10px; color: var(--text-primary);">Or invite by email:</h4>
                    <div style="display: flex; gap: 10px;">
                        <input type="email" id="inviteEmail" placeholder="Enter email address" 
                               style="flex: 1; padding: 10px; background: var(--bg-darker); border: 1px solid var(--border-color);
                                      border-radius: 6px; color: var(--text-primary);">
                        <button onclick="app.sendInvitation()" 
                                style="padding: 10px 20px; background: var(--telegram-blue); color: white; border: none;
                                       border-radius: 6px; cursor: pointer; font-weight: 500;">
                            Send Invite
                        </button>
                    </div>
                    <div id="inviteStatus" style="margin-top: 10px; font-size: 13px;"></div>
                </div>
            `;
        } else if (this.currentTab === 'rooms') {
            document.getElementById('modalTitle').textContent = 'Create Room';
            modalBody.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <input type="text" id="roomName" placeholder="Room name" 
                           style="padding: 10px; background: var(--bg-darker); border: 1px solid var(--border-color);
                                  border-radius: 6px; color: var(--text-primary);">
                    <textarea id="roomDescription" placeholder="Description (optional)" rows="3"
                              style="padding: 10px; background: var(--bg-darker); border: 1px solid var(--border-color);
                                     border-radius: 6px; color: var(--text-primary); resize: vertical;"></textarea>
                    <button onclick="app.createRoom()" 
                            style="padding: 12px; background: var(--telegram-blue); color: white; border: none;
                                   border-radius: 6px; cursor: pointer; font-weight: 500;">
                        Create Room
                    </button>
                </div>
            `;
        }

        modal.classList.add('show');
    }

    async startDirectConversation(userId) {
        try {
            const res = await fetch('/conversations/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            if (!res.ok) throw new Error('Failed to start conversation');
            const conv = await res.json();

            // Add to conversations list if new
            if (!this.conversations.find(c => c._id === conv._id)) {
                this.conversations.push(conv);
                this.dmConversations.push(conv);
            }

            // Close modal and select conversation
            document.getElementById('newChatModal').classList.remove('show');
            await this.loadConversations();
            this.selectConversation(conv._id, 'direct');
        } catch (error) {

            console.error('Error starting conversation:', error);
            Toast.show('Failed to start conversation', 'error');
        }

    }

    async sendInvitation() {
        const email = document.getElementById('inviteEmail').value.trim();
        const statusDiv = document.getElementById('inviteStatus');

        if (!email) {
            statusDiv.innerHTML = '<span style="color: #ff4444;">Please enter an email address</span>';
            return;
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            statusDiv.innerHTML = '<span style="color: #ff4444;">Please enter a valid email address</span>';
            return;
        }

        try {
            const res = await fetch('/invitations/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toEmail: email })
            });

            const data = await res.json();

            if (res.ok) {
                statusDiv.innerHTML = '<span style="color: var(--accent-green);">✓ Invitation sent successfully!</span>';
                document.getElementById('inviteEmail').value = '';
                setTimeout(() => {
                    document.getElementById('newChatModal').classList.remove('show');
                }, 2000);
            } else {
                statusDiv.innerHTML = `<span style="color: #ff4444;">${data.error}</span>`;
            }
        } catch (err) {
            statusDiv.innerHTML = '<span style="color: #ff4444;">Failed to send invitation</span>';
        }
    }

    async createRoom() {
        const name = document.getElementById('roomName').value.trim();
        const description = document.getElementById('roomDescription').value.trim();

        if (!name) {
            Toast.show('Please enter a room name', 'warning');
            return;
        }


        try {
            const res = await fetch('/rooms/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description })
            });

            if (!res.ok) throw new Error('Failed to create room');
            const room = await res.json();

            // Add to conversations
            this.conversations.push(room);
            this.roomConversations.push(room);

            // Close modal and switch to rooms tab
            document.getElementById('newChatModal').classList.remove('show');
            this.currentTab = 'rooms';
            this.renderConversations(this.roomConversations);
        } catch (error) {
            console.error('Error creating room:', error);
            Toast.show('Failed to create room', 'error');
        }

    }

    async toggleSubscription(channelId, isSubscribed) {
        const endpoint = isSubscribed ? 'leave' : 'join';
        try {
            const res = await fetch(`/channels/${channelId}/${endpoint}`, { method: 'POST' });
            if (!res.ok) throw new Error('Action failed');

            const data = await res.json();

            // Optimization: Update local state without full reload
            const channel = this.channels.find(c => c._id === channelId);
            if (channel) {
                if (isSubscribed) {
                    channel.participants = channel.participants.filter(p => String(p) !== String(this.me._id));
                } else {
                    channel.participants.push(this.me._id);
                }
                channel.subscriberCount = data.count;
            }

            Toast.show(isSubscribed ? 'Unsubscribed' : 'Subscribed!', 'success');

            // Refresh Header UI
            this.selectConversation(channelId, 'channel');

        } catch (error) {
            console.error(error);
            Toast.show('Failed to update subscription', 'error');
        }
    }

}

// Initialize app
const app = new ChatApp();
window.app = app;

// Magic link login
window.sendMagicLink = async function () {
    const email = document.getElementById('emailInput').value.trim();
    if (!email) return Toast.show("Enter email", 'warning');


    try {
        const res = await fetch("/auth/magic-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email })
        });
        const data = await res.json();

        if (data.message) {
            // Backend might send success=true but with a warning message (e.g. email failed)
            Toast.show(data.message, data.success ? 'warning' : 'error');
        } else if (data.success) {
            Toast.show("Check your email for login link", 'success');
        } else {
            Toast.show(data.error || "Failed to send link", 'error');
        }
    } catch (e) {
        console.error(e);
        Toast.show("Network error sending link", 'error');
    }
};


// Single DOMContentLoaded listener
document.addEventListener('DOMContentLoaded', () => {
    // Initialize app
    app.init();

    // Input handlers
    const messageInput = document.getElementById('messageInput');

    messageInput?.addEventListener("input", () => {
        if (window.socket && window.app) {
            const conversationId = window.app.currentConversation.id || null;
            window.socket.emit("typing", { conversationId });
        }
    });

    messageInput?.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            app.sendMessage();
        }
    });

    // File upload
    document.getElementById('fileInput')?.addEventListener("change", async () => {
        const file = document.getElementById('fileInput').files[0];
        if (!file) return;

        const fd = new FormData();
        fd.append("file", file);
        if (app.currentConversation.id) {
            fd.append("conversationId", app.currentConversation.id);
        }

        await fetch("/upload", {
            method: "POST",
            body: fd
        });

        document.getElementById('fileInput').value = "";
    });

    // Search functionality
    const searchInput = document.getElementById('searchInput');
    searchInput?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();

        if (!query) {
            // Show all items based on current tab
            if (app.currentTab === 'global') {
                app.renderOnlineUsers();
            } else if (app.currentTab === 'dms') {
                app.renderConversations(app.dmConversations);
            } else if (app.currentTab === 'rooms') {
                app.renderConversations(app.roomConversations);
            }
            return;
        }

        // Filter based on current tab
        if (app.currentTab === 'global') {
            const filtered = app.onlineUsers.filter(u =>
                u.name.toLowerCase().includes(query) ||
                u.email.toLowerCase().includes(query)
            );

            // Render filtered users
            const html = filtered.map(u => `
                <div class="chat-item">
                    <div class="chat-avatar">
                        ${app.getAvatar(u.name)}
                        <div class="online-dot"></div>
                    </div>
                    <div class="chat-info">
                        <div class="chat-name">${u.name}</div>
                        <div style="font-size: 11px; color: var(--text-secondary);">${u.email}</div>
                    </div>
                </div>
            `).join('');

            document.getElementById('chatList').innerHTML = html ||
                '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No users found</div>';

        } else if (app.currentTab === 'dms') {
            if (!app.me) return; // Guard against missing user data
            const filtered = app.dmConversations.filter(c => {
                const otherUser = c.participants.find(p => p._id !== app.me._id);
                return otherUser && (
                    otherUser.name.toLowerCase().includes(query) ||
                    otherUser.email.toLowerCase().includes(query)
                );
            });
            app.renderConversations(filtered);

        } else if (app.currentTab === 'rooms') {
            const filtered = app.roomConversations.filter(c =>
                c.name.toLowerCase().includes(query) ||
                (c.description && c.description.toLowerCase().includes(query))
            );
            app.renderConversations(filtered);
        }
    });

    // Close emoji picker on outside click
    document.addEventListener('click', (e) => {
        const picker = document.getElementById('emojiPicker');
        const emojiBtn = document.querySelector('.emoji-btn');
        if (picker && !picker.contains(e.target) && e.target !== emojiBtn) {
            picker.classList.remove('show');
        }
    });
});
