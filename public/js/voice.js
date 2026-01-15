// Voice Messages Module - Recording and Playback
export class VoiceManager {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.recordingStartTime = null;
        this.timerInterval = null;
        this.audioContext = null;
        this.analyser = null;
        this.waveformData = [];
        this.currentPlayer = null;
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Create audio context for waveform
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            source.connect(this.analyser);

            // Setup MediaRecorder
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            this.waveformData = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => {
                this.handleRecordingStop();
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            this.recordingStartTime = Date.now();

            // Show recording UI
            this.showRecordingUI();

            // Start timer
            this.startTimer();

            // Start waveform visualization
            this.visualizeWaveform();

            return true;
        } catch (error) {
            console.error('Error starting recording:', error);
            alert('Could not access microphone. Please grant permission.');
            return false;
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            this.stopTimer();

            // Stop all tracks
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    }

    cancelRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.isRecording = false;
            this.mediaRecorder.stop();
            this.stopTimer();
            this.audioChunks = [];
            this.waveformData = [];

            // Stop all tracks
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());

            // Hide recording UI
            this.hideRecordingUI();
        }
    }

    async handleRecordingStop() {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const duration = (Date.now() - this.recordingStartTime) / 1000;

        // Generate simplified waveform
        const waveform = this.generateSimplifiedWaveform();

        // Upload to server
        await this.uploadVoiceMessage(audioBlob, duration, waveform);

        // Hide recording UI
        this.hideRecordingUI();
    }

    async uploadVoiceMessage(audioBlob, duration, waveform) {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice-message.webm');
        formData.append('duration', duration);
        formData.append('waveform', JSON.stringify(waveform));

        if (window.app && window.app.currentConversation.id) {
            formData.append('conversationId', window.app.currentConversation.id);
        }

        try {
            const response = await fetch('/upload/voice', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

        } catch (error) {
            console.error('Error uploading voice message:', error);
            alert('Failed to send voice message');
        }
    }

    visualizeWaveform() {
        if (!this.isRecording || !this.analyser) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            if (!this.isRecording) return;

            this.analyser.getByteFrequencyData(dataArray);

            // Calculate average amplitude
            const average = dataArray.reduce((a, b) => a + b) / bufferLength;
            this.waveformData.push(Math.floor(average));

            // Update live waveform display
            this.updateLiveWaveform(average);

            requestAnimationFrame(draw);
        };

        draw();
    }

    generateSimplifiedWaveform() {
        // Reduce waveform data to ~50 points for storage
        const targetLength = 50;
        const step = Math.ceil(this.waveformData.length / targetLength);
        const simplified = [];

        for (let i = 0; i < this.waveformData.length; i += step) {
            const chunk = this.waveformData.slice(i, i + step);
            const avg = chunk.reduce((a, b) => a + b, 0) / chunk.length;
            simplified.push(Math.floor(avg));
        }

        return simplified;
    }

    showRecordingUI() {
        const recordingUI = document.getElementById('voiceRecordingUI');
        if (recordingUI) {
            recordingUI.classList.add('show');
        }
    }

    hideRecordingUI() {
        const recordingUI = document.getElementById('voiceRecordingUI');
        if (recordingUI) {
            recordingUI.classList.remove('show');
        }
    }

    startTimer() {
        const timerEl = document.getElementById('recordingTimer');
        if (!timerEl) return;

        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

            // Auto-stop at 5 minutes
            if (elapsed >= 300) {
                this.stopRecording();
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    updateLiveWaveform(amplitude) {
        const waveformContainer = document.getElementById('liveWaveform');
        if (!waveformContainer) return;

        // Keep only last 30 bars
        const bars = waveformContainer.querySelectorAll('.waveform-bar');
        if (bars.length >= 30) {
            bars[0].remove();
        }

        // Add new bar
        const bar = document.createElement('div');
        bar.className = 'waveform-bar';
        const height = Math.max(4, (amplitude / 255) * 30);
        bar.style.height = `${height}px`;
        waveformContainer.appendChild(bar);
    }

    // Voice Player Methods
    playVoiceMessage(messageId, audioUrl, waveform, duration) {
        const playerEl = document.querySelector(`[data-voice-id="${messageId}"]`);
        if (!playerEl) return;

        const audio = playerEl.querySelector('audio');
        const playBtn = playerEl.querySelector('.voice-play-btn');

        if (audio.paused) {
            // Pause any other playing audio
            document.querySelectorAll('.voice-message audio').forEach(a => {
                if (a !== audio) a.pause();
            });

            audio.play();
            playBtn.textContent = '⏸';
            this.currentPlayer = { audio, playerEl, messageId };

            // Update progress
            audio.ontimeupdate = () => this.updatePlaybackProgress(messageId, audio, waveform);
            audio.onended = () => {
                playBtn.textContent = '▶';
                this.resetWaveform(messageId);
            };
        } else {
            audio.pause();
            playBtn.textContent = '▶';
        }
    }

    updatePlaybackProgress(messageId, audio, waveform) {
        const playerEl = document.querySelector(`[data-voice-id="${messageId}"]`);
        if (!playerEl) return;

        const progress = audio.currentTime / audio.duration;
        const bars = playerEl.querySelectorAll('.voice-waveform-bar');
        const playedBars = Math.floor(bars.length * progress);

        bars.forEach((bar, index) => {
            if (index < playedBars) {
                bar.classList.add('played');
            } else {
                bar.classList.remove('played');
            }
        });

        // Update time display
        const timeEl = playerEl.querySelector('.voice-duration');
        if (timeEl) {
            const remaining = audio.duration - audio.currentTime;
            const minutes = Math.floor(remaining / 60);
            const seconds = Math.floor(remaining % 60);
            timeEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    resetWaveform(messageId) {
        const playerEl = document.querySelector(`[data-voice-id="${messageId}"]`);
        if (!playerEl) return;

        const bars = playerEl.querySelectorAll('.voice-waveform-bar');
        bars.forEach(bar => bar.classList.remove('played'));
    }

    seekVoiceMessage(messageId, event) {
        const playerEl = document.querySelector(`[data-voice-id="${messageId}"]`);
        if (!playerEl) return;

        const audio = playerEl.querySelector('audio');
        const waveformEl = event.currentTarget;
        const rect = waveformEl.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const percentage = x / rect.width;

        audio.currentTime = audio.duration * percentage;
    }

    changeSpeed(messageId) {
        const playerEl = document.querySelector(`[data-voice-id="${messageId}"]`);
        if (!playerEl) return;

        const audio = playerEl.querySelector('audio');
        const speedBtn = playerEl.querySelector('.voice-speed');

        const speeds = [1, 1.5, 2];
        const currentIndex = speeds.indexOf(audio.playbackRate);
        const nextIndex = (currentIndex + 1) % speeds.length;

        audio.playbackRate = speeds[nextIndex];
        speedBtn.textContent = `${speeds[nextIndex]}x`;
    }

    renderVoiceMessage(data) {
        const waveformBars = data.file.waveform.map((amplitude, index) => {
            const height = Math.max(4, (amplitude / 255) * 24);
            return `<div class="voice-waveform-bar" style="height: ${height}px"></div>`;
        }).join('');

        const minutes = Math.floor(data.file.duration / 60);
        const seconds = Math.floor(data.file.duration % 60);
        const durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        return `
      <div class="voice-message" data-voice-id="${data._id}">
        <audio src="${data.file.url}" preload="metadata"></audio>
        <button class="voice-play-btn" onclick="voiceManager.playVoiceMessage('${data._id}', '${data.file.url}', ${JSON.stringify(data.file.waveform)}, ${data.file.duration})">▶</button>
        <div class="voice-waveform" onclick="voiceManager.seekVoiceMessage('${data._id}', event)">
          ${waveformBars}
        </div>
        <div class="voice-duration">${durationText}</div>
        <button class="voice-speed" onclick="voiceManager.changeSpeed('${data._id}')">1x</button>
      </div>
    `;
    }
}

// Create global instance
window.voiceManager = new VoiceManager();
