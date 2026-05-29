/* ===== Picture-in-Picture Module ===== */
const PiP = {
    active: false,
    kind: null, // 'music' | 'video'
    win: null,
    drag: { active: false, startX: 0, startY: 0, originX: 0, originY: 0 },

    init() {
        this.win = document.getElementById('pipWindow');
        // Inject the vinyl element used for music PiP
        const art = document.getElementById('pipAlbumArt');
        if (art) {
            const vinyl = document.createElement('div');
            vinyl.className = 'vinyl-art';
            art.appendChild(vinyl);
        }
    },

    enter(kind) {
        if (kind === 'music' && !Player.currentTrack) {
            App.showToast('warning', 'No Track Playing', 'Start a track first');
            return;
        }
        if (kind === 'video' && (!Player.currentVideo || !Player.videoEl.src)) {
            App.showToast('warning', 'No Video Playing', 'Start a video first');
            return;
        }

        this.kind = kind;
        this.active = true;
        this.win.classList.remove('is-music', 'is-video');
        this.win.classList.add(kind === 'music' ? 'is-music' : 'is-video');
        this.win.style.display = '';

        if (kind === 'music') {
            this.setupMusicPip();
        } else {
            this.setupVideoPip();
        }

        // Close the originating modal so the floating window takes over
        const modalId = kind === 'music' ? 'musicPlayerModal' : 'videoPlayerModal';
        document.getElementById(modalId).classList.remove('active');
        if (kind === 'video' && document.fullscreenElement) document.exitFullscreen();

        this.updateProgress();
        this.updatePlayState(kind === 'music' ? !player.audioEl.paused : !player.videoEl.paused);

        App.showToast('success', 'Picture in Picture', 'Drag the window anywhere on screen');
    },

    setupMusicPip() {
        const track = Player.currentTrack;
        document.getElementById('pipTitle').textContent = 'Music';
        document.getElementById('pipTrackName').textContent = track.title || 'Unknown';
        document.getElementById('pipTrackMeta').textContent = track.artist || 'Unknown Artist';
        // Update the music vinyl spin tied to play state
        this.win.classList.toggle('playing', !Player.audioEl.paused);
    },

    setupVideoPip() {
        const video = Player.currentVideo;
        document.getElementById('pipTitle').textContent = 'Video';
        document.getElementById('pipTrackName').textContent = video.title || 'Unknown';
        const dur = Player.videoEl.duration || 0;
        document.getElementById('pipTrackMeta').textContent = dur ? Storage.formatDuration(dur) : '—';
        // Move the actual video element into the PiP window (no extra video element needed)
        const host = document.getElementById('pipVideoHost');
        host.innerHTML = '';
        host.appendChild(Player.videoEl);
    },

    exit() {
        if (!this.active) return;
        if (this.kind === 'video') {
            // Move the video back to its container so the full player works again
            const container = document.getElementById('videoContainer');
            const controls = document.getElementById('videoControls');
            container.insertBefore(Player.videoEl, controls);
            // Pause when explicitly closing
            Player.videoEl.pause();
        } else {
            Player.audioEl.pause();
        }
        this.active = false;
        this.kind = null;
        this.win.style.display = 'none';
        this.win.classList.remove('is-music', 'is-video', 'playing');
    },

    expandToFullPlayer() {
        if (!this.active) return;
        const kind = this.kind;
        if (kind === 'video') {
            const container = document.getElementById('videoContainer');
            const controls = document.getElementById('videoControls');
            container.insertBefore(Player.videoEl, controls);
            document.getElementById('videoPlayerModal').classList.add('active');
        } else {
            document.getElementById('musicPlayerModal').classList.add('active');
            setTimeout(() => Player.startAudioVisualizer(), 200);
        }
        // Hide PiP but keep playing
        this.active = false;
        this.kind = null;
        this.win.style.display = 'none';
        this.win.classList.remove('is-music', 'is-video', 'playing');
    },

    togglePlay() {
        if (this.kind === 'music') Player.togglePlay();
        else if (this.kind === 'video') Player.toggleVideoPlay();
    },

    updatePlayState(isPlaying) {
        const playBtn = document.getElementById('pipPlayBtn');
        if (playBtn) {
            playBtn.innerHTML = isPlaying
                ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        }
        this.win.classList.toggle('playing', isPlaying);
    },

    updateProgress() {
        const el = this.kind === 'music' ? Player.audioEl : Player.videoEl;
        if (!el) return;
        const current = el.currentTime;
        const duration = el.duration || 0;
        const pct = duration ? (current / duration) * 100 : 0;
        document.getElementById('pipProgressFill').style.width = pct + '%';
        document.getElementById('pipCurrentTime').textContent = Storage.formatDuration(current);
        document.getElementById('pipDuration').textContent = Storage.formatDuration(duration);
    },

    // ===== DRAGGING =====
    setupDrag(handle) {
        const onDown = (clientX, clientY) => {
            this.drag.active = true;
            this.drag.startX = clientX;
            this.drag.startY = clientY;
            const rect = this.win.getBoundingClientRect();
            this.drag.originX = rect.left;
            this.drag.originY = rect.top;
            // Lock width so it doesn't snap once we switch from right anchoring
            this.win.style.right = 'auto';
            this.win.style.bottom = 'auto';
            this.win.style.left = rect.left + 'px';
            this.win.style.top = rect.top + 'px';
            this.win.classList.add('dragging');
        };

        const onMove = (clientX, clientY) => {
            if (!this.drag.active) return;
            const dx = clientX - this.drag.startX;
            const dy = clientY - this.drag.startY;
            const rect = this.win.getBoundingClientRect();
            const maxX = window.innerWidth - rect.width;
            const maxY = window.innerHeight - rect.height;
            const newX = Math.max(0, Math.min(maxX, this.drag.originX + dx));
            const newY = Math.max(0, Math.min(maxY, this.drag.originY + dy));
            this.win.style.left = newX + 'px';
            this.win.style.top = newY + 'px';
        };

        const onUp = () => {
            this.drag.active = false;
            this.win.classList.remove('dragging');
        };

        // Mouse events
        handle.addEventListener('mousedown', (e) => {
            // Don't drag when clicking buttons inside the header
            if (e.target.closest('.pip-action')) return;
            e.preventDefault();
            onDown(e.clientX, e.clientY);
        });
        document.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
        document.addEventListener('mouseup', onUp);

        // Touch events
        handle.addEventListener('touchstart', (e) => {
            if (e.target.closest('.pip-action')) return;
            const t = e.touches[0];
            onDown(t.clientX, t.clientY);
        }, { passive: true });
        document.addEventListener('touchmove', (e) => {
            if (!this.drag.active) return;
            const t = e.touches[0];
            onMove(t.clientX, t.clientY);
        }, { passive: true });
        document.addEventListener('touchend', onUp);
    }
};

// Expose globally so Player can reference it via window.PiP
window.PiP = PiP;
