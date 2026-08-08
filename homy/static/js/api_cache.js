// Client-side GET response cache (reduces duplicate widget API calls during refresh bursts)

window.ApiCache = {
    _store: new Map(),
    _maxEntries: 200,

    _key(url, method) {
        return `${method || 'GET'}:${url}`;
    },

    get(url, method = 'GET') {
        const key = this._key(url, method);
        const entry = this._store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expires) {
            this._store.delete(key);
            return null;
        }
        return entry.data;
    },

    set(url, data, ttlMs, method = 'GET') {
        if (!ttlMs || ttlMs <= 0) return;
        const key = this._key(url, method);
        if (this._store.size >= this._maxEntries) {
            const first = this._store.keys().next().value;
            this._store.delete(first);
        }
        this._store.set(key, { data, expires: Date.now() + ttlMs });
    },

    invalidate(url, method = 'GET') {
        this._store.delete(this._key(url, method));
    },

    invalidateWidget(widgetId) {
        for (const key of [...this._store.keys()]) {
            if (key.includes(`widget_id=${widgetId}`)) {
                this._store.delete(key);
            }
        }
    },

    /** Drop cached config/catalogue responses after a mutation. */
    invalidateIntegrations() {
        for (const key of [...this._store.keys()]) {
            if (key.includes('/api/integrations')) {
                this._store.delete(key);
            }
        }
    },

    invalidateFavorites() {
        for (const key of [...this._store.keys()]) {
            if (key.includes('/api/favorites')) {
                this._store.delete(key);
            }
        }
    },

    clear() {
        this._store.clear();
    },
};

/** Default client cache TTL (ms) per API path segment */
window.getApiCacheTtl = function (url) {
    if (!url || typeof url !== 'string') return 0;
    // Live integration payloads must not inherit the config-endpoint TTL below.
    if (url.includes('/api/integrations/') && url.includes('/fetch')) return 0;
    const rules = [
        ['/api/weather/', 120000],
        ['/api/calendar/', 300000],
        ['/api/radarr/', 45000],
        ['/api/sonarr/', 45000],
        ['/api/glances/', 15000],
        ['/api/service_status/', 30000],
        ['/api/seerr/', 45000],
        ['/api/jellyfin/', 10000],
        ['/api/torrent/', 10000],
        ['/api/homeassistant/', 12000],
        ['/api/proxmox/', 12000],
        ['/api/pihole/', 15000],
        ['/api/discord/', 15000],
        ['/api/discord-bot/', 15000],
        ['/api/custom_json/', 15000],
        ['/api/favorites', 30000],
        // Configuration/catalogue endpoints. These were uncached, so opening a config
        // modal with three integration widgets fired six identical requests.
        ['/api/integrations/types', 60000],
        ['/api/integration-plugins', 60000],
        ['/api/integrations', 30000],
        ['/api/modules', 60000],
        ['/api/themes', 300000],
    ];
    for (const [path, ttl] of rules) {
        if (url.includes(path)) return ttl;
    }
    return 0;
};
