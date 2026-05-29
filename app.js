/* ===== Main App Module ===== */
const App = {
    state: {
        currentView: 'home',
        music: [],
        videos: [],
        profile: null,
        settings: null
    },

    init() {
        this.state.profile = Storage.getProfile();
        this.state.settings = Storage.getSettings();
        this.state.music = this.rehydrateLibrary('music');
        this.state.videos = this.rehydrateLibrary('video');

        Player.initAudio();
        Player.initVideo();

        this.applyTheme();
        this.setupNavigation();
        this.setupFileLoaders();
        this.setupProfileSection();
        this.setupMusicPlayerControls();
        this.setupVideoPlayerControls();
        this.setupEqualizer();
        this.setupVisualizer();
        this.setupSettings();
        this.setupFilters();
        this.setupPiP();
        this.setupSearch();
        this.setupKeyboardShortcuts();
        this.setupResponsive();

        this.renderProfile();
        this.renderRecents();
        this.renderLibrary('music');
        this.renderLibrary('video');
        this.updateHistoryCount();

        // Show profile modal on first launch
        if (!this.state.profile.createdAt) {
            setTimeout(() => this.openProfileModal(true), 600);
        }
    },

    rehydrateLibrary(type) {
        // Library entries persist metadata only since File objects can't survive a page reload.
        return Storage.getLibrary(type).map(item => ({ ...item, file: null, needsReload: true }));
    },

    // ===== NAVIGATION =====
    setupNavigation() {
        document.querySelectorAll('[data-view]').forEach(el => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const view = el.dataset.view;
                this.switchView(view);
            });
        });
    },

    switchView(view) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const target = document.getElementById(view + 'View');
        if (target) target.classList.add('active');
        const nav = document.querySelector(`.nav-item[data-view="${view}"]`);
        if (nav) nav.classList.add('active');
        this.state.currentView = view;
        if (view === 'recents') this.renderRecentsList();
        if (view === 'visualizer') Player.startStandaloneVisualizer(Player.visualizerType);
        else Player.stopStandaloneVisualizer();

        if (window.innerWidth < 968) {
            document.getElementById('sidebar').classList.remove('open');
        }
    },

    // ===== FILE LOADING =====
    setupFileLoaders() {
        const musicInput = document.getElementById('musicFileInput');
        const videoInput = document.getElementById('videoFileInput');

        const triggerMusic = () => musicInput.click();
        const triggerVideo = () => videoInput.click();

        ['loadMusicBtn', 'addMusicBtn', 'emptyMusicBtn'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', triggerMusic);
        });
        ['loadVideoBtn', 'addVideoBtn', 'emptyVideoBtn'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', triggerVideo);
        });

        musicInput.addEventListener('change', (e) => this.handleFileLoad(e.target.files, 'music'));
        videoInput.addEventListener('change', (e) => this.handleFileLoad(e.target.files, 'video'));
    },

    async handleFileLoad(files, type) {
        if (!files || files.length === 0) return;
        const newItems = [];
        for (const file of files) {
            const item = {
                id: Storage.generateId(file),
                file: file,
                title: file.name.replace(/\.[^/.]+$/, ''),
                artist: type === 'music' ? this.guessArtist(file.name) : null,
                type: type,
                size: file.size,
                duration: 0,
                addedAt: Date.now()
            };
            newItems.push(item);
        }

        // Drop duplicates
        const existing = type === 'music' ? this.state.music : this.state.videos;
        const merged = [...newItems, ...existing.filter(e => !newItems.find(n => n.id === e.id))];

        if (type === 'music') {
            this.state.music = merged;
        } else {
            this.state.videos = merged;
        }

        // Persist metadata only (File objects are runtime-only)
        const metaList = merged.map(({ file, ...rest }) => rest);
        Storage.saveLibrary(type, metaList);

        this.renderLibrary(type);
        this.showToast('success', 'Files Added', `${newItems.length} ${type} file(s) added to library`);

        // If user came in by clicking "Load X" on home, play the first track immediately.
        if (this.state.currentView === 'home' && newItems.length > 0) {
            if (type === 'music') {
                this.openMusicPlayer(newItems[0]);
            } else {
                this.openVideoPlayer(newItems[0]);
            }
        }
    },

    guessArtist(filename) {
        // Common pattern: "Artist - Title.mp3"
        const cleaned = filename.replace(/\.[^/.]+$/, '');
        const dashSplit = cleaned.split(' - ');
        if (dashSplit.length >= 2) return dashSplit[0].trim();
        return 'Unknown Artist';
    },

    // ===== LIBRARY RENDERING =====
    renderLibrary(type) {
        const grid = document.getElementById(type === 'music' ? 'musicGrid' : 'videosGrid');
        const items = type === 'music' ? this.state.music : this.state.videos;

        if (items.length === 0) {
            grid.innerHTML = type === 'music'
                ? `<div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 19V6l12-3v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                    <p>Your music library is empty</p>
                    <button class="btn-secondary" id="emptyMusicBtn">Add Music Files</button>
                </div>`
                : `<div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 10l4.5-4.5v13L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>
                    <p>Your video library is empty</p>
                    <button class="btn-secondary" id="emptyVideoBtn">Add Video Files</button>
                </div>`;
            // Re-attach handler for the regenerated button
            const btn = document.getElementById(type === 'music' ? 'emptyMusicBtn' : 'emptyVideoBtn');
            if (btn) btn.addEventListener('click', () => {
                document.getElementById(type === 'music' ? 'musicFileInput' : 'videoFileInput').click();
            });
            return;
        }

        grid.innerHTML = items.map(item => `
            <div class="media-card ${type === 'video' ? 'video' : ''}" data-id="${item.id}">
                <div class="media-thumbnail">
                    ${type === 'video'
                        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l4.5-4.5v13L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>'
                        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19V6l12-3v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
                    }
                    <div class="play-overlay">
                        <button class="play-overlay-btn">
                            <svg viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                        </button>
                    </div>
                </div>
                <div class="media-info">
                    <p class="media-title" title="${this.escape(item.title)}">${this.escape(item.title)}</p>
                    <div class="media-meta">
                        <span>${item.artist || (type === 'video' ? 'Video' : 'Audio')}</span>
                        <span>${Storage.formatSize(item.size)}</span>
                    </div>
                </div>
            </div>
        `).join('');

        grid.querySelectorAll('.media-card').forEach(card => {
            card.addEventListener('click', () => {
                const id = card.dataset.id;
                const item = items.find(i => i.id === id);
                if (!item) return;
                if (item.needsReload || !item.file) {
                    this.showToast('warning', 'File Reload Needed', 'Please re-add this file — local files can\'t persist between sessions for security reasons.');
                    return;
                }
                if (type === 'music') this.openMusicPlayer(item);
                else this.openVideoPlayer(item);
            });
        });
    },

    renderRecents() {
        const grid = document.getElementById('recentsGrid');
        const history = Storage.getHistory().slice(0, 6);
        if (history.length === 0) {
            grid.innerHTML = `<div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <p>No recent media yet. Start by loading a file!</p>
            </div>`;
            return;
        }
        grid.innerHTML = history.map(item => {
            const pct = item.duration > 0 && item.position > 0 ? Math.min(100, (item.position / item.duration) * 100) : 0;
            const resumeLabel = pct > 0 ? `Resume at ${Storage.formatDuration(item.position)}` : '';
            return `
            <div class="media-card ${item.type === 'video' ? 'video' : ''}" data-id="${item.id}" data-type="${item.type}">
                <div class="media-thumbnail">
                    ${item.type === 'video'
                        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l4.5-4.5v13L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>'
                        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19V6l12-3v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
                    }
                    <div class="play-overlay">
                        <button class="play-overlay-btn">
                            <svg viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                        </button>
                    </div>
                    ${pct > 0 ? `<div class="resume-bar"><div class="resume-fill" style="width:${pct}%"></div></div>` : ''}
                </div>
                <div class="media-info">
                    <p class="media-title">${this.escape(item.title)}</p>
                    <div class="media-meta">
                        <span>${this.escape(item.artist || item.type)}</span>
                        <span>${Storage.formatRelativeTime(item.playedAt)}</span>
                    </div>
                    ${resumeLabel ? `<p class="resume-label">${resumeLabel}</p>` : ''}
                </div>
            </div>
        `;
        }).join('');

        grid.querySelectorAll('.media-card').forEach(card => {
            card.addEventListener('click', () => this.playFromHistory(card.dataset.id, card.dataset.type));
        });
    },

    renderRecentsList() {
        const list = document.getElementById('recentsList');
        const history = Storage.getHistory();
        if (history.length === 0) {
            list.innerHTML = `<div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <p>No history yet</p>
            </div>`;
            return;
        }
        list.innerHTML = history.map(item => {
            const pct = item.duration > 0 && item.position > 0 ? Math.min(100, (item.position / item.duration) * 100) : 0;
            const resumeText = pct > 0 ? ` • Resume at ${Storage.formatDuration(item.position)} (${Math.round(pct)}%)` : '';
            return `
            <div class="recent-item" data-id="${item.id}" data-type="${item.type}">
                <div class="recent-thumb">
                    ${item.type === 'video'
                        ? '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M15 10l4.5-4.5v13L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>'
                        : '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M9 19V6l12-3v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
                    }
                </div>
                <div class="recent-info">
                    <p class="recent-name">${this.escape(item.title)}</p>
                    <p class="recent-meta">${this.escape(item.artist || '')} • ${Storage.formatRelativeTime(item.playedAt)} • ${Storage.formatSize(item.size || 0)}${resumeText}</p>
                    ${pct > 0 ? `<div class="resume-bar-list"><div class="resume-fill" style="width:${pct}%"></div></div>` : ''}
                </div>
                <span class="recent-badge">${item.type.toUpperCase()}</span>
            </div>
        `;
        }).join('');
        list.querySelectorAll('.recent-item').forEach(item => {
            item.addEventListener('click', () => this.playFromHistory(item.dataset.id, item.dataset.type));
        });
    },

    playFromHistory(id, type) {
        const lib = type === 'music' ? this.state.music : this.state.videos;
        const item = lib.find(i => i.id === id);
        if (!item || !item.file) {
            this.showToast('warning', 'File Not Available', 'Please re-add this file to play it again. Local files don\'t persist between browser sessions.');
            return;
        }
        if (type === 'music') this.openMusicPlayer(item);
        else this.openVideoPlayer(item);
    },

    // ===== MUSIC PLAYER =====
    openMusicPlayer(track) {
        document.getElementById('musicPlayerModal').classList.add('active');
        Player.playTrack(track, this.state.music);
        setTimeout(() => Player.startAudioVisualizer(), 300);
    },

    openVideoPlayer(video) {
        document.getElementById('videoPlayerModal').classList.add('active');
        Player.playVideo(video);
    },

    setupMusicPlayerControls() {
        document.getElementById('closeMusicPlayer').addEventListener('click', () => Player.closeMusicPlayer());
        document.getElementById('playBtn').addEventListener('click', () => Player.togglePlay());
        document.getElementById('miniPlayBtn').addEventListener('click', () => Player.togglePlay());
        document.getElementById('nextBtn').addEventListener('click', () => Player.nextTrack());
        document.getElementById('miniNext').addEventListener('click', () => Player.nextTrack());
        document.getElementById('prevBtn').addEventListener('click', () => Player.prevTrack());
        document.getElementById('miniPrev').addEventListener('click', () => Player.prevTrack());
        document.getElementById('miniExpand').addEventListener('click', () => {
            if (Player.currentTrack) document.getElementById('musicPlayerModal').classList.add('active');
        });

        document.getElementById('shuffleBtn').addEventListener('click', (e) => {
            Player.isShuffling = !Player.isShuffling;
            e.currentTarget.classList.toggle('active');
        });

        document.getElementById('repeatBtn').addEventListener('click', (e) => {
            const modes = ['off', 'all', 'one'];
            const idx = modes.indexOf(Player.repeatMode);
            Player.repeatMode = modes[(idx + 1) % 3];
            e.currentTarget.classList.toggle('active', Player.repeatMode !== 'off');
        });

        // Progress bar seeking
        ['mainProgressBar', 'miniProgressBar'].forEach(id => {
            const bar = document.getElementById(id);
            bar.addEventListener('click', (e) => {
                const rect = bar.getBoundingClientRect();
                const percent = ((e.clientX - rect.left) / rect.width) * 100;
                Player.seek(percent);
            });
        });

        // Volume
        const vol = document.getElementById('volumeSlider');
        vol.addEventListener('input', (e) => Player.setVolume(e.target.value));

        // Speed
        const speedBtn = document.getElementById('speedBtn');
        const speedMenu = document.getElementById('speedMenu');
        speedBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            speedMenu.classList.toggle('active');
        });
        speedMenu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const speed = btn.dataset.speed;
                Player.setSpeed(speed);
                speedBtn.textContent = speed + 'x';
                speedMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                speedMenu.classList.remove('active');
            });
        });
        document.addEventListener('click', () => speedMenu.classList.remove('active'));
    },

    setupVideoPlayerControls() {
        document.getElementById('closeVideoPlayer').addEventListener('click', () => Player.closeVideoPlayer());
        document.getElementById('videoPlayBtn').addEventListener('click', () => Player.toggleVideoPlay());
        document.getElementById('videoPlayer').addEventListener('click', () => Player.toggleVideoPlay());
        document.getElementById('videoRewindBtn').addEventListener('click', () => Player.skipVideo(-10));
        document.getElementById('videoForwardBtn').addEventListener('click', () => Player.skipVideo(10));
        document.getElementById('videoFullscreenBtn').addEventListener('click', () => Player.toggleFullscreen());

        const volumeSlider = document.getElementById('videoVolumeSlider');
        volumeSlider.addEventListener('input', (e) => Player.setVideoVolume(e.target.value));

        const progressBar = document.getElementById('videoProgressBar');
        progressBar.addEventListener('click', (e) => {
            const rect = progressBar.getBoundingClientRect();
            const percent = ((e.clientX - rect.left) / rect.width) * 100;
            Player.seekVideo(percent);
        });

        // Speed menu
        const speedBtn = document.getElementById('videoSpeedBtn');
        const speedMenu = document.getElementById('videoSpeedMenu');
        speedBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            speedMenu.classList.toggle('active');
        });
        speedMenu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const speed = btn.dataset.speed;
                Player.setVideoSpeed(speed);
                speedBtn.textContent = speed + 'x';
                speedMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                speedMenu.classList.remove('active');
            });
        });

        // Quality menu
        const qualityBtn = document.getElementById('videoQualityBtn');
        const qualityMenu = document.getElementById('videoQualityMenu');
        qualityBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            qualityMenu.classList.toggle('active');
        });
        qualityMenu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const quality = btn.dataset.quality;
                Player.setVideoQuality(quality);
                qualityBtn.textContent = quality === 'auto' ? 'AUTO' : quality.toUpperCase();
                qualityMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                qualityMenu.classList.remove('active');
            });
        });

        // Filter menu
        const filterBtn = document.getElementById('videoFilterBtn');
        const filterMenu = document.getElementById('videoFilterMenu');
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            filterMenu.classList.toggle('active');
        });
        filterMenu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.dataset.filter;
                Player.applyVideoFilter(filter);
                filterMenu.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filterMenu.classList.remove('active');
                this.showToast('success', 'Filter Applied', btn.textContent);
            });
        });

        document.addEventListener('click', () => {
            speedMenu.classList.remove('active');
            qualityMenu.classList.remove('active');
            filterMenu.classList.remove('active');
        });
    },

    // ===== EQUALIZER =====
    setupEqualizer() {
        const bandsContainer = document.getElementById('eqBands');
        const frequencies = ['60Hz', '170Hz', '310Hz', '600Hz', '1kHz', '3kHz', '6kHz', '12kHz', '14kHz', '16kHz'];
        bandsContainer.innerHTML = frequencies.map((freq, i) => `
            <div class="eq-band">
                <input type="range" class="eq-slider" data-band="${i}" min="-12" max="12" step="0.5" value="0" orient="vertical">
                <span class="eq-label">${freq}</span>
            </div>
        `).join('');
        bandsContainer.querySelectorAll('.eq-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                Player.setEqualizerBand(parseInt(e.target.dataset.band), parseFloat(e.target.value));
                // Switch to custom preset visual
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            });
        });

        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                Player.applyEQPreset(btn.dataset.preset);
            });
        });
    },

    // ===== VISUALIZER =====
    setupVisualizer() {
        document.querySelectorAll('.viz-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.viz-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                Player.stopStandaloneVisualizer();
                Player.startStandaloneVisualizer(btn.dataset.viz);
            });
        });
    },

    // ===== FILTERS =====
    setupFilters() {
        document.querySelectorAll('.filter-preview').forEach(preview => {
            preview.addEventListener('click', () => {
                document.querySelectorAll('.filter-preview').forEach(p => p.classList.remove('active'));
                preview.classList.add('active');
                Player.applyVideoFilter(preview.dataset.filter);
                this.showToast('success', 'Filter Saved', `${preview.querySelector('span').textContent} will be applied to next video`);
            });
        });
    },

    // ===== PICTURE IN PICTURE =====
    setupPiP() {
        const musicPipBtn = document.getElementById('musicPipBtn');
        const videoCustomPipBtn = document.getElementById('videoCustomPipBtn');
        const pipClose = document.getElementById('pipClose');
        const pipExpand = document.getElementById('pipExpand');
        const pipPlayBtn = document.getElementById('pipPlayBtn');
        const pipPrev = document.getElementById('pipPrev');
        const pipNext = document.getElementById('pipNext');
        const pipProgressBar = document.getElementById('pipProgressBar');
        const pipHeader = document.getElementById('pipHeader');

        if (musicPipBtn) musicPipBtn.addEventListener('click', () => PiP.enter('music'));
        if (videoCustomPipBtn) videoCustomPipBtn.addEventListener('click', () => PiP.enter('video'));
        pipClose.addEventListener('click', () => PiP.exit());
        pipExpand.addEventListener('click', () => PiP.expandToFullPlayer());

        pipPlayBtn.addEventListener('click', () => PiP.togglePlay());
        pipPrev.addEventListener('click', () => {
            if (PiP.kind === 'music') Player.prevTrack();
            else Player.skipVideo(-10);
        });
        pipNext.addEventListener('click', () => {
            if (PiP.kind === 'music') Player.nextTrack();
            else Player.skipVideo(10);
        });

        pipProgressBar.addEventListener('click', (e) => {
            const rect = pipProgressBar.getBoundingClientRect();
            const percent = ((e.clientX - rect.left) / rect.width) * 100;
            if (PiP.kind === 'music') Player.seek(percent);
            else Player.seekVideo(percent);
        });

        PiP.setupDrag(pipHeader);
        PiP.init();
    },

    // ===== SETTINGS =====
    setupSettings() {
        const themeSelect = document.getElementById('themeSelect');
        const accentColor = document.getElementById('accentColor');
        const defaultVolume = document.getElementById('defaultVolume');
        const defaultVolumeVal = document.getElementById('defaultVolumeVal');
        const defaultQuality = document.getElementById('defaultQuality');
        const autoPlayNext = document.getElementById('autoPlayNext');
        const themeToggle = document.getElementById('themeToggle');

        const settings = this.state.settings;
        themeSelect.value = settings.theme;
        accentColor.value = settings.accentColor;
        defaultVolume.value = settings.defaultVolume;
        defaultVolumeVal.textContent = settings.defaultVolume + '%';
        defaultQuality.value = settings.defaultQuality;
        autoPlayNext.checked = settings.autoPlayNext;

        themeSelect.addEventListener('change', (e) => {
            Storage.saveSettings({ theme: e.target.value });
            this.state.settings = Storage.getSettings();
            this.applyTheme();
        });
        accentColor.addEventListener('input', (e) => {
            Storage.saveSettings({ accentColor: e.target.value });
            document.documentElement.style.setProperty('--accent', e.target.value);
        });
        defaultVolume.addEventListener('input', (e) => {
            defaultVolumeVal.textContent = e.target.value + '%';
            Storage.saveSettings({ defaultVolume: parseInt(e.target.value) });
            Player.setVolume(e.target.value);
        });
        defaultQuality.addEventListener('change', (e) => {
            Storage.saveSettings({ defaultQuality: e.target.value });
        });
        autoPlayNext.addEventListener('change', (e) => {
            Storage.saveSettings({ autoPlayNext: e.target.checked });
        });
        themeToggle.addEventListener('click', () => {
            const themes = ['dark', 'light', 'midnight', 'sunset'];
            const currentIdx = themes.indexOf(this.state.settings.theme);
            const next = themes[(currentIdx + 1) % themes.length];
            Storage.saveSettings({ theme: next });
            this.state.settings = Storage.getSettings();
            themeSelect.value = next;
            this.applyTheme();
        });

        document.getElementById('clearHistoryBtn').addEventListener('click', () => {
            if (confirm('Clear all playback history?')) {
                Storage.clearHistory();
                this.renderRecents();
                this.renderRecentsList();
                this.updateHistoryCount();
                this.showToast('success', 'History Cleared', 'Your playback history has been cleared');
            }
        });

        document.getElementById('clearAllData').addEventListener('click', () => {
            if (confirm('This will clear ALL data including profile, history, and library. Continue?')) {
                Storage.clear();
                this.showToast('success', 'Data Cleared', 'All data removed. Reloading...');
                setTimeout(() => location.reload(), 1500);
            }
        });
    },

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.state.settings.theme);
        document.documentElement.style.setProperty('--accent', this.state.settings.accentColor);
    },

    updateHistoryCount() {
        const count = Storage.getHistory().length;
        const el = document.getElementById('historyCount');
        if (el) el.textContent = `${count} item${count !== 1 ? 's' : ''}`;
    },

    // ===== PROFILE =====
    setupProfileSection() {
        document.getElementById('profileSection').addEventListener('click', () => this.openProfileModal());
        document.getElementById('closeProfileModal').addEventListener('click', () => this.closeProfileModal());
        document.getElementById('saveProfileBtn').addEventListener('click', () => this.saveProfile());
        document.getElementById('changeAvatarBtn').addEventListener('click', () => document.getElementById('avatarInput').click());
        document.getElementById('avatarInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const preview = document.getElementById('avatarPreview');
                preview.style.backgroundImage = `url(${e.target.result})`;
                preview.textContent = '';
                preview.dataset.avatar = e.target.result;
            };
            reader.readAsDataURL(file);
        });

        document.getElementById('profileModal').addEventListener('click', (e) => {
            if (e.target.id === 'profileModal') this.closeProfileModal();
        });
    },

    openProfileModal(isFirstTime = false) {
        const modal = document.getElementById('profileModal');
        const title = document.getElementById('profileModalTitle');
        title.textContent = isFirstTime ? 'Welcome — Create Your Profile' : 'Edit Profile';

        document.getElementById('profileNameInput').value = this.state.profile.name === 'Guest User' ? '' : this.state.profile.name;
        document.getElementById('profileEmailInput').value = this.state.profile.email || '';
        document.getElementById('profileGenre').value = this.state.profile.genre || '';

        const preview = document.getElementById('avatarPreview');
        if (this.state.profile.avatar) {
            preview.style.backgroundImage = `url(${this.state.profile.avatar})`;
            preview.textContent = '';
            preview.dataset.avatar = this.state.profile.avatar;
        } else {
            preview.style.backgroundImage = '';
            preview.textContent = (this.state.profile.name || 'U')[0].toUpperCase();
            delete preview.dataset.avatar;
        }

        modal.classList.add('active');
    },

    closeProfileModal() {
        document.getElementById('profileModal').classList.remove('active');
    },

    saveProfile() {
        const name = document.getElementById('profileNameInput').value.trim();
        const email = document.getElementById('profileEmailInput').value.trim();
        const genre = document.getElementById('profileGenre').value;
        const avatar = document.getElementById('avatarPreview').dataset.avatar || null;

        if (!name) {
            this.showToast('error', 'Name Required', 'Please enter your name');
            return;
        }

        const profile = {
            name,
            email,
            genre,
            avatar,
            createdAt: this.state.profile.createdAt || Date.now()
        };
        Storage.saveProfile(profile);
        this.state.profile = Storage.getProfile();
        this.renderProfile();
        this.closeProfileModal();
        this.showToast('success', 'Profile Saved', `Welcome, ${name}!`);
    },

    renderProfile() {
        const avatar = document.getElementById('profileAvatar');
        const name = document.getElementById('profileName');
        name.textContent = this.state.profile.name;
        if (this.state.profile.avatar) {
            avatar.style.backgroundImage = `url(${this.state.profile.avatar})`;
            avatar.textContent = '';
        } else {
            avatar.style.backgroundImage = '';
            avatar.textContent = (this.state.profile.name || 'U')[0].toUpperCase();
        }
    },

    // ===== SEARCH =====
    setupSearch() {
        const input = document.getElementById('searchInput');
        let timeout;
        input.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => this.runSearch(e.target.value), 200);
        });
    },

    runSearch(query) {
        if (!query) {
            this.renderLibrary('music');
            this.renderLibrary('video');
            return;
        }
        const q = query.toLowerCase();
        const matchedMusic = this.state.music.filter(m =>
            m.title.toLowerCase().includes(q) || (m.artist || '').toLowerCase().includes(q));
        const matchedVideos = this.state.videos.filter(v => v.title.toLowerCase().includes(q));

        const renderFiltered = (grid, items, type) => {
            if (items.length === 0) {
                grid.innerHTML = `<div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                    <p>No matches for "${this.escape(query)}"</p>
                </div>`;
                return;
            }
            grid.innerHTML = items.map(item => `
                <div class="media-card ${type === 'video' ? 'video' : ''}" data-id="${item.id}">
                    <div class="media-thumbnail">
                        ${type === 'video'
                            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 10l4.5-4.5v13L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>'
                            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 19V6l12-3v13"/></svg>'
                        }
                    </div>
                    <div class="media-info">
                        <p class="media-title">${this.escape(item.title)}</p>
                        <div class="media-meta">
                            <span>${item.artist || type}</span>
                        </div>
                    </div>
                </div>`).join('');
            grid.querySelectorAll('.media-card').forEach(c => {
                c.addEventListener('click', () => {
                    const i = items.find(x => x.id === c.dataset.id);
                    if (i && i.file) {
                        if (type === 'music') this.openMusicPlayer(i);
                        else this.openVideoPlayer(i);
                    }
                });
            });
        };
        renderFiltered(document.getElementById('musicGrid'), matchedMusic, 'music');
        renderFiltered(document.getElementById('videosGrid'), matchedVideos, 'video');
    },

    // ===== KEYBOARD SHORTCUTS =====
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Skip when typing in form controls
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

            const videoOpen = document.getElementById('videoPlayerModal').classList.contains('active');
            const musicOpen = document.getElementById('musicPlayerModal').classList.contains('active');

            if (e.key === ' ' || e.code === 'Space') {
                e.preventDefault();
                if (videoOpen) Player.toggleVideoPlay();
                else if (musicOpen || Player.currentTrack) Player.togglePlay();
            } else if (e.key === 'ArrowRight') {
                if (videoOpen) Player.skipVideo(10);
            } else if (e.key === 'ArrowLeft') {
                if (videoOpen) Player.skipVideo(-10);
            } else if (e.key === 'f' || e.key === 'F') {
                if (videoOpen) Player.toggleFullscreen();
            } else if (e.key === 'm' || e.key === 'M') {
                if (videoOpen) {
                    Player.videoEl.muted = !Player.videoEl.muted;
                } else if (Player.audioEl) {
                    Player.audioEl.muted = !Player.audioEl.muted;
                }
            } else if (e.key === 'Escape') {
                if (videoOpen) Player.closeVideoPlayer();
                else if (musicOpen) Player.closeMusicPlayer();
            }
        });
    },

    setupResponsive() {
        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');
        if (menuToggle) {
            menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
        }
    },

    // ===== UTILITIES =====
    showToast(type, title, message, duration = 3500) {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-title">${this.escape(title)}</div>
            <div class="toast-message">${this.escape(message)}</div>
        `;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.transition = 'all 0.3s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    escape(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
};

// ===== LAUNCH =====
document.addEventListener('DOMContentLoaded', () => App.init());
