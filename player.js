/* ===== Player Module - Audio & Video Playback ===== */
const Player = {
    audioEl: null,
    videoEl: null,
    audioCtx: null,
    sourceNode: null,
    gainNode: null,
    analyser: null,
    eqFilters: [],
    currentTrack: null,
    currentVideo: null,
    playlist: [],
    currentIndex: -1,
    isShuffling: false,
    repeatMode: 'off', // 'off' | 'one' | 'all'
    visualizerType: 'bars',
    visualizerCtx: null,
    visualizerRaf: null,
    videoVisualizerRaf: null,
    miniVisualizerRaf: null,
    currentFilter: 'none',
    currentObjectUrl: null,
    currentVideoUrl: null,
    idleTimeout: null,

    // ===== AUDIO =====
    initAudio() {
        this.audioEl = document.getElementById('audioPlayer');
        const initWebAudio = () => {
            if (this.audioCtx) return;
            try {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                this.sourceNode = this.audioCtx.createMediaElementSource(this.audioEl);
                this.gainNode = this.audioCtx.createGain();
                this.analyser = this.audioCtx.createAnalyser();
                this.analyser.fftSize = 256;
                this.setupEqualizer();
                this.connectAudioGraph();
            } catch (e) {
                console.warn('Web Audio init failed:', e);
            }
        };

        this.audioEl.addEventListener('play', () => {
            initWebAudio();
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
        });

        this.audioEl.addEventListener('timeupdate', () => this.updateAudioProgress());
        this.audioEl.addEventListener('loadedmetadata', () => {
            this.updateDuration();
            this.resumeIfSaved('audio');
        });
        this.audioEl.addEventListener('ended', () => this.onTrackEnded());
        this.audioEl.addEventListener('play', () => this.onPlayState(true));
        this.audioEl.addEventListener('pause', () => {
            this.onPlayState(false);
            this.savePosition('audio');
        });
        this.audioEl.addEventListener('error', (e) => {
            const errorCode = this.audioEl.error ? this.audioEl.error.code : 0;
            const errorMessages = {
                1: 'Playback was aborted',
                2: 'Network error',
                3: 'Audio decoding failed',
                4: 'Audio format not supported'
            };
            App.showToast('error', 'Playback Error', errorMessages[errorCode] || 'Unable to play this file');
        });
    },

    setupEqualizer() {
        const frequencies = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
        this.eqFilters = frequencies.map(freq => {
            const filter = this.audioCtx.createBiquadFilter();
            filter.type = freq === 60 ? 'lowshelf' : freq === 16000 ? 'highshelf' : 'peaking';
            filter.frequency.value = freq;
            filter.Q.value = 1;
            filter.gain.value = 0;
            return filter;
        });
    },

    connectAudioGraph() {
        if (!this.sourceNode) return;
        let last = this.sourceNode;
        this.eqFilters.forEach(filter => {
            last.connect(filter);
            last = filter;
        });
        last.connect(this.gainNode);
        this.gainNode.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
    },

    setEqualizerBand(index, value) {
        if (this.eqFilters[index]) {
            this.eqFilters[index].gain.value = value;
        }
    },

    applyEQPreset(preset) {
        const presets = {
            flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            bass: [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
            treble: [0, 0, 0, 0, 0, 2, 4, 6, 7, 8],
            vocal: [-2, -1, 0, 3, 5, 5, 3, 1, 0, -1],
            rock: [5, 3, -2, -3, -1, 2, 4, 6, 6, 6],
            pop: [-1, 2, 4, 5, 3, 0, -1, -1, 1, 2],
            jazz: [4, 3, 1, 2, -1, -1, 0, 1, 3, 4],
            classical: [5, 4, 3, 2, -1, -1, 0, 2, 3, 4]
        };
        const values = presets[preset] || presets.flat;
        values.forEach((val, i) => {
            this.setEqualizerBand(i, val);
            const slider = document.querySelector(`.eq-slider[data-band="${i}"]`);
            if (slider) slider.value = val;
        });
    },

    playTrack(track, playlist = null) {
        if (playlist) {
            this.playlist = playlist;
            this.currentIndex = playlist.findIndex(t => t.id === track.id);
        }
        // Capture saved position BEFORE swapping src (which triggers a spurious pause event)
        this._pendingResume = Storage.getPosition(track.id);
        this._loadingNewMedia = true;
        this.currentTrack = track;
        if (this.currentObjectUrl) URL.revokeObjectURL(this.currentObjectUrl);
        this.currentObjectUrl = URL.createObjectURL(track.file);
        this.audioEl.src = this.currentObjectUrl;
        this.audioEl.play().catch(e => console.warn('Play prevented:', e));

        // Update UI
        document.getElementById('trackTitle').textContent = track.title;
        document.getElementById('trackArtist').textContent = track.artist || 'Unknown Artist';
        document.getElementById('miniTrackName').textContent = track.title;
        document.getElementById('miniTrackArtist').textContent = track.artist || 'Unknown Artist';

        document.getElementById('miniPlayer').classList.add('active');

        // Add to history
        Storage.addToHistory({
            id: track.id,
            title: track.title,
            artist: track.artist,
            type: 'music',
            duration: track.duration,
            size: track.size
        });

        // Start visualizer when modal is open
        if (document.getElementById('musicPlayerModal').classList.contains('active')) {
            this.startAudioVisualizer();
        }
    },

    pauseAudio() {
        this.audioEl.pause();
    },

    resumeAudio() {
        this.audioEl.play();
    },

    togglePlay() {
        if (this.audioEl.paused) {
            this.resumeAudio();
        } else {
            this.pauseAudio();
        }
    },

    seek(percent) {
        if (this.audioEl.duration) {
            this.audioEl.currentTime = (percent / 100) * this.audioEl.duration;
        }
    },

    setVolume(volume) {
        this.audioEl.volume = volume / 100;
    },

    setSpeed(speed) {
        this.audioEl.playbackRate = parseFloat(speed);
    },

    nextTrack() {
        if (this.playlist.length === 0) return;
        if (this.isShuffling) {
            this.currentIndex = Math.floor(Math.random() * this.playlist.length);
        } else {
            this.currentIndex = (this.currentIndex + 1) % this.playlist.length;
        }
        this.playTrack(this.playlist[this.currentIndex]);
    },

    prevTrack() {
        if (this.playlist.length === 0) return;
        if (this.audioEl.currentTime > 3) {
            this.audioEl.currentTime = 0;
            return;
        }
        this.currentIndex = this.currentIndex - 1;
        if (this.currentIndex < 0) this.currentIndex = this.playlist.length - 1;
        this.playTrack(this.playlist[this.currentIndex]);
    },

    onTrackEnded() {
        if (this.repeatMode === 'one') {
            this.audioEl.currentTime = 0;
            this.audioEl.play();
        } else if (this.repeatMode === 'all' || Storage.getSettings().autoPlayNext) {
            this.nextTrack();
        }
    },

    onPlayState(isPlaying) {
        // Update play buttons
        const mainPlayBtn = document.getElementById('playBtn');
        const miniPlayBtn = document.getElementById('miniPlayBtn');
        const playIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        const pauseIcon = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
        if (mainPlayBtn) mainPlayBtn.innerHTML = isPlaying ? pauseIcon : playIcon;
        if (miniPlayBtn) miniPlayBtn.innerHTML = isPlaying ? pauseIcon : playIcon;

        const modal = document.getElementById('musicPlayerModal');
        if (modal) modal.classList.toggle('playing', isPlaying);

        if (window.PiP && PiP.active && PiP.kind === 'music') PiP.updatePlayState(isPlaying);
    },

    updateAudioProgress() {
        const current = this.audioEl.currentTime;
        const duration = this.audioEl.duration || 0;
        const percent = duration ? (current / duration) * 100 : 0;
        document.getElementById('mainProgressFill').style.width = percent + '%';
        document.getElementById('miniProgressFill').style.width = percent + '%';
        document.getElementById('currentTime').textContent = Storage.formatDuration(current);
        document.getElementById('miniCurrentTime').textContent = Storage.formatDuration(current);

        if (window.PiP && PiP.active && PiP.kind === 'music') PiP.updateProgress();

        // Persist position every ~5s
        if (Math.floor(current) % 5 === 0 && Math.floor(current) !== this._lastAudioSave) {
            this._lastAudioSave = Math.floor(current);
            this.savePosition('audio');
        }
    },

    updateDuration() {
        const duration = this.audioEl.duration;
        document.getElementById('duration').textContent = Storage.formatDuration(duration);
        document.getElementById('miniDuration').textContent = Storage.formatDuration(duration);
        if (this.currentTrack) {
            this.currentTrack.duration = duration;
        }
    },

    // ===== AUDIO VISUALIZER =====
    startAudioVisualizer() {
        if (!this.analyser) return;
        const canvas = document.getElementById('audioVisualizer');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth * 2;
        canvas.height = canvas.offsetHeight * 2;
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            this.visualizerRaf = requestAnimationFrame(draw);
            this.analyser.getByteFrequencyData(dataArray);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const barWidth = canvas.width / bufferLength * 2;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height;
                const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
                gradient.addColorStop(0, 'rgba(255,255,255,0.4)');
                gradient.addColorStop(1, 'rgba(255,255,255,0.9)');
                ctx.fillStyle = gradient;
                ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
                x += barWidth;
            }
        };
        draw();
    },

    stopAudioVisualizer() {
        if (this.visualizerRaf) {
            cancelAnimationFrame(this.visualizerRaf);
            this.visualizerRaf = null;
        }
    },

    // ===== STANDALONE VISUALIZER VIEW =====
    startStandaloneVisualizer(type) {
        this.visualizerType = type;
        if (!this.analyser) {
            // Audio context not ready — initialize on next play
            App.showToast('info', 'Play music first', 'Start playing a track to see the visualizer in action');
            return;
        }
        const canvas = document.getElementById('visualizerCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth * 2;
        canvas.height = canvas.offsetHeight * 2;
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        const timeData = new Uint8Array(bufferLength);
        const particles = [];

        // Pre-seed particles
        for (let i = 0; i < 100; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                size: Math.random() * 3 + 1,
                hue: Math.random() * 360
            });
        }

        const draw = () => {
            this.standaloneVizRaf = requestAnimationFrame(draw);
            this.analyser.getByteFrequencyData(dataArray);
            this.analyser.getByteTimeDomainData(timeData);
            ctx.fillStyle = 'rgba(28, 28, 38, 0.2)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (this.visualizerType === 'bars') {
                const barWidth = canvas.width / bufferLength * 2;
                let x = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;
                    const hue = (i / bufferLength) * 360;
                    const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
                    gradient.addColorStop(0, `hsl(${hue}, 80%, 50%)`);
                    gradient.addColorStop(1, `hsl(${hue + 60}, 80%, 70%)`);
                    ctx.fillStyle = gradient;
                    ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
                    x += barWidth;
                }
            } else if (this.visualizerType === 'wave') {
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'hsl(280, 80%, 60%)';
                ctx.beginPath();
                const sliceWidth = canvas.width / bufferLength;
                let x = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const v = timeData[i] / 128.0;
                    const y = v * canvas.height / 2;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                    x += sliceWidth;
                }
                ctx.stroke();
            } else if (this.visualizerType === 'circle') {
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                const radius = Math.min(centerX, centerY) * 0.4;
                for (let i = 0; i < bufferLength; i++) {
                    const angle = (i / bufferLength) * Math.PI * 2;
                    const amp = (dataArray[i] / 255) * radius;
                    const x1 = centerX + Math.cos(angle) * radius;
                    const y1 = centerY + Math.sin(angle) * radius;
                    const x2 = centerX + Math.cos(angle) * (radius + amp);
                    const y2 = centerY + Math.sin(angle) * (radius + amp);
                    ctx.strokeStyle = `hsl(${(i / bufferLength) * 360}, 80%, 60%)`;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
            } else if (this.visualizerType === 'particles') {
                const avgFreq = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
                const energy = avgFreq / 255;
                particles.forEach(p => {
                    p.x += p.vx * (1 + energy * 4);
                    p.y += p.vy * (1 + energy * 4);
                    if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
                    if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
                    const size = p.size + energy * 8;
                    ctx.fillStyle = `hsl(${p.hue + energy * 100}, 80%, 60%)`;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
                    ctx.fill();
                });
            }
        };
        draw();
    },

    stopStandaloneVisualizer() {
        if (this.standaloneVizRaf) {
            cancelAnimationFrame(this.standaloneVizRaf);
            this.standaloneVizRaf = null;
        }
    },

    // ===== VIDEO =====
    initVideo() {
        this.videoEl = document.getElementById('videoPlayer');
        this.videoEl.addEventListener('timeupdate', () => this.updateVideoProgress());
        this.videoEl.addEventListener('loadedmetadata', () => {
            this.updateVideoDuration();
            this.resumeIfSaved('video');
        });
        this.videoEl.addEventListener('play', () => this.onVideoPlayState(true));
        this.videoEl.addEventListener('pause', () => {
            this.onVideoPlayState(false);
            this.savePosition('video');
        });
        this.videoEl.addEventListener('waiting', () => document.getElementById('videoLoading').classList.add('active'));
        this.videoEl.addEventListener('canplay', () => document.getElementById('videoLoading').classList.remove('active'));
        this.videoEl.addEventListener('ended', () => this.onVideoEnded());
        this.videoEl.addEventListener('error', (e) => {
            App.showToast('error', 'Video Error', 'Unable to play this video. Format may not be supported.');
        });
    },

    playVideo(video) {
        // Capture saved position BEFORE swapping src
        this._pendingResume = Storage.getPosition(video.id);
        this._loadingNewMedia = true;
        this.currentVideo = video;
        if (this.currentVideoUrl) URL.revokeObjectURL(this.currentVideoUrl);
        this.currentVideoUrl = URL.createObjectURL(video.file);
        this.videoEl.src = this.currentVideoUrl;
        this.videoEl.play().catch(e => console.warn('Play prevented:', e));

        document.getElementById('videoTitle').textContent = video.title;

        // Add to history
        Storage.addToHistory({
            id: video.id,
            title: video.title,
            type: 'video',
            duration: video.duration,
            size: video.size
        });

        this.setupVideoIdleDetection();
    },

    setupVideoIdleDetection() {
        const container = document.getElementById('videoContainer');
        const reset = () => {
            container.classList.remove('idle');
            clearTimeout(this.idleTimeout);
            this.idleTimeout = setTimeout(() => {
                if (!this.videoEl.paused) container.classList.add('idle');
            }, 3000);
        };
        container.addEventListener('mousemove', reset);
        container.addEventListener('click', reset);
        reset();
    },

    toggleVideoPlay() {
        if (this.videoEl.paused) {
            this.videoEl.play();
        } else {
            this.videoEl.pause();
        }
    },

    seekVideo(percent) {
        if (this.videoEl.duration) {
            this.videoEl.currentTime = (percent / 100) * this.videoEl.duration;
        }
    },

    setVideoSpeed(speed) {
        this.videoEl.playbackRate = parseFloat(speed);
    },

    setVideoVolume(volume) {
        this.videoEl.volume = volume / 100;
    },

    skipVideo(seconds) {
        this.videoEl.currentTime = Math.max(0, Math.min(this.videoEl.duration, this.videoEl.currentTime + seconds));
    },

    applyVideoFilter(filter) {
        this.currentFilter = filter;
        this.videoEl.style.filter = filter === 'none' ? '' : filter;
    },

    setVideoQuality(quality) {
        // For local files, browser handles native quality. We adjust display container.
        const sizeMap = {
            'auto': null,
            '4k': '3840px',
            '1440p': '2560px',
            '1080p': '1920px',
            '720p': '1280px',
            '480p': '854px',
            '360p': '640px'
        };
        const maxWidth = sizeMap[quality];
        if (maxWidth) {
            this.videoEl.style.maxWidth = maxWidth;
        } else {
            this.videoEl.style.maxWidth = '';
        }
        App.showToast('success', 'Quality Updated', `Display set to ${quality.toUpperCase()}`);
    },

    toggleFullscreen() {
        const container = document.getElementById('videoContainer');
        if (!document.fullscreenElement) {
            (container.requestFullscreen || container.webkitRequestFullscreen || container.mozRequestFullScreen).call(container);
        } else {
            (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen).call(document);
        }
    },

    async togglePiP() {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (this.videoEl.requestPictureInPicture) {
                await this.videoEl.requestPictureInPicture();
            }
        } catch (e) {
            App.showToast('warning', 'PiP Unavailable', 'Picture-in-Picture not supported');
        }
    },

    updateVideoProgress() {
        const current = this.videoEl.currentTime;
        const duration = this.videoEl.duration || 0;
        const percent = duration ? (current / duration) * 100 : 0;
        document.getElementById('videoProgressFill').style.width = percent + '%';
        document.getElementById('videoCurrentTime').textContent = Storage.formatDuration(current);

        // Sync to PiP if active for this video
        if (window.PiP && PiP.active && PiP.kind === 'video') PiP.updateProgress();
        // Persist position every ~5s
        if (Math.floor(current) % 5 === 0 && Math.floor(current) !== this._lastVideoSave) {
            this._lastVideoSave = Math.floor(current);
            this.savePosition('video');
        }
    },

    updateVideoDuration() {
        const duration = this.videoEl.duration;
        document.getElementById('videoDuration').textContent = Storage.formatDuration(duration);
        if (this.currentVideo) this.currentVideo.duration = duration;
    },

    onVideoPlayState(isPlaying) {
        const btn = document.getElementById('videoPlayBtn');
        if (!btn) return;
        btn.innerHTML = isPlaying
            ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        if (window.PiP && PiP.active && PiP.kind === 'video') PiP.updatePlayState(isPlaying);
    },

    onVideoEnded() {
        if (Storage.getSettings().autoPlayNext && App.state.videos.length > 0) {
            const idx = App.state.videos.findIndex(v => v.id === this.currentVideo.id);
            const next = App.state.videos[(idx + 1) % App.state.videos.length];
            if (next && next.id !== this.currentVideo.id) {
                this.playVideo(next);
            }
        }
    },

    closeVideoPlayer() {
        this.savePosition('video');
        // If PiP is active for this video, keep playing in PiP and just close the modal
        if (window.PiP && PiP.active && PiP.kind === 'video') {
            document.getElementById('videoPlayerModal').classList.remove('active');
            if (document.fullscreenElement) document.exitFullscreen();
            return;
        }
        this.videoEl.pause();
        document.getElementById('videoPlayerModal').classList.remove('active');
        if (document.fullscreenElement) document.exitFullscreen();
    },

    closeMusicPlayer() {
        this.savePosition('audio');
        // If PiP is active for music, keep playing in PiP
        if (window.PiP && PiP.active && PiP.kind === 'music') {
            document.getElementById('musicPlayerModal').classList.remove('active');
            this.stopAudioVisualizer();
            return;
        }
        document.getElementById('musicPlayerModal').classList.remove('active');
        this.stopAudioVisualizer();
    },

    // ===== RESUME / POSITION TRACKING =====
    savePosition(kind) {
        // Skip while a new src is loading — currentTime is stale and would clobber the real value
        if (this._loadingNewMedia) return;
        const el = kind === 'audio' ? this.audioEl : this.videoEl;
        const item = kind === 'audio' ? this.currentTrack : this.currentVideo;
        if (!item || !el || !el.duration || isNaN(el.currentTime)) return;
        Storage.updatePosition(item.id, el.currentTime, el.duration);
    },

    resumeIfSaved(kind) {
        const item = kind === 'audio' ? this.currentTrack : this.currentVideo;
        if (!item) return;
        const pos = this._pendingResume || 0;
        this._pendingResume = 0;
        const el = kind === 'audio' ? this.audioEl : this.videoEl;
        if (pos > 3 && el.duration && pos < el.duration - 2) {
            el.currentTime = pos;
            App.showToast('info', 'Resumed', `Continuing from ${Storage.formatDuration(pos)}`);
        }
        // New media has loaded — re-enable position saving
        this._loadingNewMedia = false;
    }
};
