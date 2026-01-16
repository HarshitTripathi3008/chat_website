class CallManager {
    constructor(socket, myUser) {
        this.socket = socket;
        this.me = myUser;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteAudio = document.createElement('audio');
        this.remoteAudio.autoplay = true;

        this.activeCall = null; // { userId, socketId, isIncoming }
        this.isMuted = false;

        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        this.initUI();
        this.initSocket();
    }

    initUI() {
        // Inject modal HTML if not exists
        if (!document.getElementById('callModal')) {
            const modal = document.createElement('div');
            modal.id = 'callModal';
            modal.className = 'call-modal';
            modal.innerHTML = `
                <div class="call-card">
                    <div class="call-avatar" id="callAvatar">
                         <img src="" alt="" onerror="this.onerror=null;this.parentElement.innerText=this.alt;">
                    </div>
                    <div class="call-name" id="callName">User</div>
                    <div class="call-status" id="callStatus">Calling...</div>
                    <div class="call-actions" id="callActions">
                        <!-- Buttons injected dynamically -->
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        this.modal = document.getElementById('callModal');
        this.dom = {
            name: document.getElementById('callName'),
            status: document.getElementById('callStatus'),
            avatar: document.getElementById('callAvatar').querySelector('img'),
            actions: document.getElementById('callActions')
        };
    }

    initSocket() {
        this.socket.on('call-made', async (data) => {
            if (this.activeCall) {
                // Busy: reject implicitly or handle waiting (simple reject for now)
                this.socket.emit('hang-up', { toUserId: data.callerId });
                return;
            }

            this.activeCall = {
                userId: data.callerId,
                socketId: data.socket,
                offer: data.offer,
                isIncoming: true
            };
            this.showIncomingCallUI(data);
        });

        this.socket.on('answer-made', async (data) => {
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                this.dom.status.textContent = "Connected";
                document.querySelector('.call-avatar').classList.remove('pulse');
                this.showActiveCallUI(); // Ensure UI updates to connected state
            }
        });

        this.socket.on('ice-candidate', async (data) => {
            if (this.peerConnection) {
                try {
                    await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (e) {
                    console.error("Error adding ice candidate", e);
                }
            }
        });

        this.socket.on('call-ended', () => {
            this.endCall(false); // False means don't emit hang-up again
        });
    }

    showIncomingCallUI(data) {
        this.dom.name.textContent = data.callerName || 'Unknown';
        this.dom.avatar.src = data.callerAvatar || '';
        this.dom.avatar.alt = (data.callerName || '?').charAt(0).toUpperCase();
        this.dom.status.textContent = "Incoming Audio Call...";
        document.querySelector('.call-avatar').classList.add('pulse');

        this.modal.classList.add('show');

        // Render Buttons
        this.dom.actions.innerHTML = `
            <button class="call-btn mute ${this.isMuted ? 'active' : ''}" onclick="callManager.toggleMute(this)">
                🎤
            </button>
            <button class="call-btn reject" onclick="callManager.rejectCall()">
                ❌
            </button>
            <button class="call-btn accept" onclick="callManager.acceptCall()">
                📞
            </button>
        `;
    }

    showOutgoingCallUI(targetUser) {
        this.dom.name.textContent = targetUser.name;
        this.dom.avatar.src = targetUser.avatar || '';
        this.dom.avatar.alt = (targetUser.name || '?').charAt(0).toUpperCase();
        this.dom.status.textContent = "Calling...";
        document.querySelector('.call-avatar').classList.add('pulse');

        this.modal.classList.add('show');

        this.dom.actions.innerHTML = `
            <button class="call-btn mute ${this.isMuted ? 'active' : ''}" onclick="callManager.toggleMute(this)">
                🎤
            </button>
            <button class="call-btn reject" onclick="callManager.endCall(true)">
                ❌
            </button>
        `;
    }

    showActiveCallUI() {
        this.dom.status.textContent = "Connected";
        document.querySelector('.call-avatar').classList.remove('pulse');
        this.dom.actions.innerHTML = `
            <button class="call-btn mute ${this.isMuted ? 'active' : ''}" onclick="callManager.toggleMute(this)">
                🎤
            </button>
            <button class="call-btn reject" onclick="callManager.endCall(true)">
                ❌
            </button>
        `;
    }

    /* ================= LOGIC ================= */

    async startCall(targetUserId, targetUser) {
        this.activeCall = { userId: targetUserId, isIncoming: false };
        this.showOutgoingCallUI(targetUser);

        await this.setupPeerConnection();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
            this.localStream = stream;

            // Apply mute state immediately if set
            if (this.isMuted) {
                this.localStream.getAudioTracks()[0].enabled = false;
            }

            stream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, stream);
            });

            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            this.socket.emit('call-user', {
                toUserId: targetUserId,
                offer: offer
            });

        } catch (e) {
            console.error("Start call error:", e);
            Toast.show("Microphone access failed", 'error');
            this.endCall(false);
        }
    }

    async acceptCall() {
        this.showActiveCallUI();
        await this.setupPeerConnection();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
            this.localStream = stream;

            // Apply mute state immediately if set
            if (this.isMuted) {
                this.localStream.getAudioTracks()[0].enabled = false;
            }

            stream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, stream);
            });

            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(this.activeCall.offer));

            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            this.socket.emit('make-answer', {
                toUserId: this.activeCall.userId,
                answer: answer
            });

        } catch (e) {
            console.error("Accept call error:", e);
            Toast.show("Call failed", 'error');
            this.endCall(true);
        }
    }

    rejectCall() {
        this.endCall(true);
    }

    async setupPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.config);

        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    toUserId: this.activeCall.userId,
                    candidate: event.candidate
                });
            }
        };

        this.peerConnection.ontrack = (event) => {
            this.remoteAudio.srcObject = event.streams[0];
        };
    }

    endCall(notifyRemote = true) {
        if (notifyRemote && this.activeCall) {
            this.socket.emit('hang-up', { toUserId: this.activeCall.userId });
        }

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        this.activeCall = null;
        this.modal.classList.remove('show');

        // Reset mute state for next call? Or keep it? keeping it is fine but reset is safer
        this.isMuted = false;
    }

    toggleMute(btn) {
        this.isMuted = !this.isMuted;

        if (this.localStream) {
            const track = this.localStream.getAudioTracks()[0];
            track.enabled = !this.isMuted;
        }

        if (btn) {
            // If btn passed, toggle class. 
            // Better to query all mute buttons just in case to sync UI
            const muteBtns = document.querySelectorAll('.call-btn.mute');
            muteBtns.forEach(b => b.classList.toggle('active', this.isMuted));
        }
    }
}
