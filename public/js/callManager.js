class CallManager {
    constructor(socket, myUser) {
        this.socket = socket;
        this.me = myUser;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = new MediaStream();

        // Element references
        this.remoteVideo = null;
        this.localVideo = null;

        this.activeCall = null; // { userId, socketId, isIncoming, type: 'audio'|'video' }
        this.isMuted = false;
        this.isCameraOff = false;
        this.isSpeakerOn = false; // For mobile/device switching if needed
        this.isMinimized = false;

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
        if (!document.getElementById('callModal')) {
            const modal = document.createElement('div');
            modal.id = 'callModal';
            modal.className = 'call-modal';
            modal.innerHTML = `
                <div class="call-card" id="callCard">
                    
                    <div class="call-top-controls">
                        <button class="control-btn" title="Minimize" onclick="callManager.toggleMinimize()">
                            ↘
                        </button>
                    </div>

                    <!-- Video Container -->
                    <div class="video-container" id="videoContainer">
                        <video id="remoteVideo" autoplay playsinline></video>
                        <video id="localVideo" autoplay playsinline muted></video>
                    </div>

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
        this.card = document.getElementById('callCard');
        this.dom = {
            name: document.getElementById('callName'),
            status: document.getElementById('callStatus'),
            avatar: document.getElementById('callAvatar').querySelector('img'),
            actions: document.getElementById('callActions'),
            videoContainer: document.getElementById('videoContainer')
        };

        this.remoteVideo = document.getElementById('remoteVideo');
        this.localVideo = document.getElementById('localVideo');
        this.remoteVideo.srcObject = this.remoteStream;

        // Initialize Drag Logic
        this.makeDraggable(this.modal);
    }

    makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const card = element.querySelector('.call-card');

        card.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            // Only allow dragging if minimized
            if (!element.classList.contains('minimized')) return;

            e = e || window.event;
            e.preventDefault();
            // get the mouse cursor position at startup:
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            // call a function whenever the cursor moves:
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            // calculate the new cursor position:
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            // set the element's new position:
            // The modal wrapper is fixed 100% w/h, but in minimized mode acts differently.
            // Actually, we should move the CARD if it's minimized, but because the CSS structure is
            // .call-modal.minimized (fixed bottom right) -> .call-card
            // It is valid to move the modal wrapper if we change its styles, OR just move the card.
            // Given the CSS structure: .call-modal.minimized is fixed position.
            // We should modify the .call-modal.minimized 'top' and 'left' and unset bottom/right.

            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            element.style.bottom = 'auto';
            element.style.right = 'auto';
        }

        function closeDragElement() {
            // stop moving when mouse button is released:
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    initSocket() {
        this.socket.on('call-made', async (data) => {
            if (this.activeCall) {
                this.socket.emit('hang-up', { toUserId: data.callerId });
                return;
            }

            this.activeCall = {
                userId: data.callerId,
                socketId: data.socket,
                offer: data.offer,
                isIncoming: true,
                type: data.type || 'audio'
            };
            this.showIncomingCallUI(data);
        });

        this.socket.on('answer-made', async (data) => {
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
                this.dom.status.textContent = "Connected";
                document.querySelector('.call-avatar').classList.remove('pulse');
                this.showActiveCallUI();
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
            this.endCall(false);
        });
    }

    /* ================= UI RENDERERS ================= */

    showIncomingCallUI(data) {
        this.toggleVideoMode(data.type === 'video'); // Setup layout

        this.dom.name.textContent = data.callerName || 'Unknown';
        this.dom.avatar.src = data.callerAvatar || '';
        this.dom.avatar.alt = (data.callerName || '?').charAt(0).toUpperCase();
        this.dom.status.textContent = `Incoming ${data.type === 'video' ? 'Video' : 'Audio'} Call...`;
        document.querySelector('.call-avatar').classList.add('pulse');

        this.modal.classList.add('show');
        this.isMinimized = false;
        this.modal.classList.remove('minimized');

        // Actions: Accept/Reject
        this.dom.actions.innerHTML = `
            <button class="call-btn reject" onclick="callManager.rejectCall()">
                ❌
            </button>
            <button class="call-btn accept" onclick="callManager.acceptCall()">
                ${data.type === 'video' ? '📹' : '📞'}
            </button>
        `;
    }

    showOutgoingCallUI(targetUser, type) {
        this.toggleVideoMode(type === 'video');

        this.dom.name.textContent = targetUser.name;
        this.dom.avatar.src = targetUser.avatar || '';
        this.dom.avatar.alt = (targetUser.name || '?').charAt(0).toUpperCase();
        this.dom.status.textContent = "Calling...";
        document.querySelector('.call-avatar').classList.add('pulse');

        this.modal.classList.add('show');
        this.isMinimized = false;
        this.modal.classList.remove('minimized');

        this.dom.actions.innerHTML = `
            <button class="call-btn mute ${this.isMuted ? 'active' : ''}" onclick="callManager.toggleMute(this)">
                🎤
            </button>
            <button class="call-btn reject" onclick="callManager.endCall(true)">
                ❌
            </button>
        `;

        /* If video, show camera toggle immediately? Only if stream ready. 
           But stream loads async. Wait for stream to load to update buttons is better. */
    }

    showActiveCallUI() {
        this.dom.status.textContent = "Connected";
        document.querySelector('.call-avatar').classList.remove('pulse');

        const isVideo = this.activeCall && this.activeCall.type === 'video';

        this.dom.actions.innerHTML = `
            <button class="call-btn mute ${this.isMuted ? 'active' : ''}" title="Mute" onclick="callManager.toggleMute(this)">
                🎤
            </button>
            
            ${isVideo ? `
            <button class="call-btn ${this.isCameraOff ? 'active' : ''}" title="Toggle Camera" onclick="callManager.toggleVideo(this)">
                📷
            </button>` : ''}

            <button class="call-btn" title="Speaker" onclick="callManager.toggleSpeaker(this)">
                🔊
            </button>

            <button class="call-btn reject" title="End Call" onclick="callManager.endCall(true)">
                ❌
            </button>
        `;
    }

    toggleVideoMode(isVideo) {
        if (isVideo) {
            this.card.classList.add('video-active');
            this.dom.videoContainer.classList.add('active');
        } else {
            this.card.classList.remove('video-active');
            this.dom.videoContainer.classList.remove('active');
        }
    }

    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        if (this.isMinimized) {
            this.modal.classList.add('minimized');
            // Change button icon?
        } else {
            this.modal.classList.remove('minimized');
        }
    }

    /* ================= AUDIO/VIDEO LOGIC ================= */

    async startCall(targetUserId, targetUser, type = 'audio') {
        this.activeCall = { userId: targetUserId, isIncoming: false, type: type };
        this.showOutgoingCallUI(targetUser, type);

        await this.setupPeerConnection();

        try {
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: type === 'video' ? {
                    facingMode: 'user', // Selfie cam default
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                } : false
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.localStream = stream;

            if (type === 'video') {
                this.localVideo.srcObject = stream;
                this.localVideo.classList.remove('hidden');
            } else {
                this.localVideo.classList.add('hidden');
            }

            if (this.isMuted) {
                this.localStream.getAudioTracks().forEach(t => t.enabled = false);
            }

            stream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, stream);
            });

            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            this.socket.emit('call-user', {
                toUserId: targetUserId,
                offer: offer,
                type: type
            });

        } catch (e) {
            console.error("Start call error:", e);
            // Toast.show("Access failed", 'error'); // If Toast exists
            alert("Could not access Camera/Microphone");
            this.endCall(false);
        }
    }

    async acceptCall() {
        // Stop ringing UI
        await this.setupPeerConnection();

        const type = this.activeCall.type;

        try {
            const constraints = {
                audio: true,
                video: type === 'video'
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.localStream = stream;

            if (type === 'video') {
                this.localVideo.srcObject = stream;
                this.localVideo.classList.remove('hidden');
            } else {
                this.localVideo.classList.add('hidden');
            }

            if (this.isMuted) {
                this.localStream.getAudioTracks().forEach(t => t.enabled = false);
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

            this.showActiveCallUI();

        } catch (e) {
            console.error("Accept call error:", e);
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
            // Check if stream already added
            // this.remoteStream.addTrack(event.track) ?
            event.streams[0].getTracks().forEach(track => {
                this.remoteStream.addTrack(track);
            });
            // Force refresh srcObject if needed
            this.remoteVideo.srcObject = this.remoteStream;
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

        // Reset Video Elements
        if (this.remoteVideo) this.remoteVideo.srcObject = null;
        if (this.localVideo) this.localVideo.srcObject = null;
        this.remoteStream = new MediaStream(); // Reset remote stream holder

        this.activeCall = null;
        this.modal.classList.remove('show', 'minimized');
        this.toggleVideoMode(false);
        this.isMuted = false;
        this.isCameraOff = false;

        // Reset Speaker
        if (this.remoteVideo && typeof this.remoteVideo.setSinkId === 'function') {
            this.remoteVideo.setSinkId(''); // Reset to default
        }
    }

    toggleMute(btn) {
        this.isMuted = !this.isMuted;
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(t => t.enabled = !this.isMuted);
        }
        if (btn) btn.classList.toggle('active', this.isMuted);
    }

    toggleVideo(btn) {
        this.isCameraOff = !this.isCameraOff;
        if (this.localStream) {
            this.localStream.getVideoTracks().forEach(t => t.enabled = !this.isCameraOff);
        }
        if (btn) btn.classList.toggle('active', this.isCameraOff);
    }

    async toggleSpeaker(btn) {
        // Note: setSinkId is not supported in all browsers (mostly Chrome/Edge)
        if (!this.remoteVideo || typeof this.remoteVideo.setSinkId !== 'function') {
            alert("Speaker switching not supported in this browser.");
            return;
        }

        // Ideally, we list devices and toggle between e.g. 'default' vs others.
        // For simplicity: Toggle between 'default' and the first non-default output if available?
        // Or just let user know it's not fully implemented UI-wise.
        // Let's cycle devices.

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

            if (audioOutputs.length <= 1) {
                alert("No other speaker devices found.");
                return;
            }

            // Current sinkId
            const currentId = this.remoteVideo.sinkId;
            // Find index
            let idx = audioOutputs.findIndex(d => d.deviceId === currentId);
            // Next
            let nextDevice = audioOutputs[(idx + 1) % audioOutputs.length];

            await this.remoteVideo.setSinkId(nextDevice.deviceId);
            // alert(`Switched to: ${nextDevice.label}`);
            btn.classList.toggle('active', nextDevice.deviceId !== 'default' && nextDevice.deviceId !== '');

        } catch (e) {
            console.error("Speaker toggle error", e);
        }
    }
}
