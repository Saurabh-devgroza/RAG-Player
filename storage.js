/* ===== Storage Module - LocalStorage Wrapper ===== */
const Storage = {
    KEYS: {
        PROFILE: 'ragplayer_profile',
        HISTORY: 'ragplayer_history',
        SETTINGS: 'ragplayer_settings',
        LIBRARY_MUSIC: 'ragplayer_library_music',
        LIBRARY_VIDEO: 'ragplayer_library_video',
        FAVORITES: 'ragplayer_favorites'
    },

    MAX_HISTORY: 50,
    MAX_LIBRARY_META: 200,

    get(key, defaultValue = null) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : defaultValue;
        } catch (e) {
            console.warn('Storage read error:', e);
            return defaultValue;
        }
    },

    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.warn('Storage write error:', e);
            return false;
        }
    },

    remove(key) {
        localStorage.removeItem(key);
    },

    clear() {
        Object.values(this.KEYS).forEach(k => localStorage.removeItem(k));
    },

    // Profile
    getProfile() {
        return this.get(this.KEYS.PROFILE, {
            name: 'Guest User',
            email: '',
            avatar: null,
            genre: '',
            createdAt: null
        });
    },

    saveProfile(profile) {
        return this.set(this.KEYS.PROFILE, {
            ...this.getProfile(),
            ...profile,
            updatedAt: Date.now()
        });
    },

    // History
    getHistory() {
        return this.get(this.KEYS.HISTORY, []);
    },

    addToHistory(item) {
        const history = this.getHistory();
        // Carry forward any saved resume position for this id
        const existing = history.find(h => h.id === item.id);
        const filtered = history.filter(h => h.id !== item.id);
        filtered.unshift({
            ...item,
            position: existing?.position || 0,
            playedAt: Date.now()
        });
        const trimmed = filtered.slice(0, this.MAX_HISTORY);
        this.set(this.KEYS.HISTORY, trimmed);
        return trimmed;
    },

    updatePosition(id, currentTime, duration) {
        const history = this.getHistory();
        const item = history.find(h => h.id === id);
        if (!item) return;
        // Clear position when track is essentially finished
        const finished = duration > 0 && currentTime / duration > 0.95;
        item.position = finished ? 0 : currentTime;
        item.duration = duration || item.duration;
        item.playedAt = Date.now();
        this.set(this.KEYS.HISTORY, history);
    },

    getPosition(id) {
        const item = this.getHistory().find(h => h.id === id);
        return item?.position || 0;
    },

    clearHistory() {
        this.set(this.KEYS.HISTORY, []);
    },

    // Settings
    getSettings() {
        return this.get(this.KEYS.SETTINGS, {
            theme: 'dark',
            accentColor: '#7c3aed',
            defaultVolume: 80,
            defaultQuality: '1080p',
            autoPlayNext: true
        });
    },

    saveSettings(settings) {
        return this.set(this.KEYS.SETTINGS, {
            ...this.getSettings(),
            ...settings
        });
    },

    // Library (metadata-only references; actual files stay local)
    getLibrary(type) {
        const key = type === 'video' ? this.KEYS.LIBRARY_VIDEO : this.KEYS.LIBRARY_MUSIC;
        return this.get(key, []);
    },

    saveLibrary(type, items) {
        const key = type === 'video' ? this.KEYS.LIBRARY_VIDEO : this.KEYS.LIBRARY_MUSIC;
        return this.set(key, items.slice(0, this.MAX_LIBRARY_META));
    },

    // Utility for generating consistent IDs
    generateId(file) {
        return `${file.name}_${file.size}_${file.lastModified || 0}`;
    },

    // Format file size for display
    formatSize(bytes) {
        if (!bytes) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        let i = 0;
        while (bytes >= 1024 && i < units.length - 1) {
            bytes /= 1024;
            i++;
        }
        return `${bytes.toFixed(1)} ${units[i]}`;
    },

    // Format duration in seconds to mm:ss or hh:mm:ss
    formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        if (h > 0) {
            return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
        return `${m}:${String(s).padStart(2, '0')}`;
    },

    // Format a timestamp into a relative "x ago" string
    formatRelativeTime(timestamp) {
        if (!timestamp) return '';
        const diff = Date.now() - timestamp;
        const minutes = Math.floor(diff / 60000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
    }
};
