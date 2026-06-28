// Auto-refresh scheduler — defaults come from each module's info.cfg via /api/modules

const REFRESH_INTERVAL_OPTIONS = [
    { value: '', label: 'Standard (empfohlen)' },
    { value: '0', label: 'Aus' },
    { value: '15', label: '15 Sekunden' },
    { value: '30', label: '30 Sekunden' },
    { value: '60', label: '1 Minute' },
    { value: '120', label: '2 Minuten' },
    { value: '300', label: '5 Minuten' },
    { value: '600', label: '10 Minuten' },
    { value: '900', label: '15 Minuten' },
];

window.WidgetRefreshManager = {
    _entries: new Map(),
    _paused: false,
    _tickHandle: null,
    _lastVisibility: !document.hidden,
    _observer: null,
    _visibility: new Map(),
    _inFlight: 0,
    _maxConcurrent: 2,
    _initialDelayMs: 1200,

    getDefaultInterval(type) {
        const widgets = AppState.availableWidgets || [];
        const schema = widgets.find(w => w.type === type);
        if (schema && schema.default_refresh_interval !== undefined && schema.default_refresh_interval !== null) {
            const n = parseInt(schema.default_refresh_interval, 10);
            if (Number.isFinite(n) && n >= 0) {
                return n;
            }
        }
        return AppState.defaultWidgetRefresh ?? 30;
    },

    resolveIntervalSeconds(widgetData) {
        const type = widgetData.type;
        const cfg = widgetData.config || {};
        const raw = cfg.refresh_interval;

        if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
            const n = parseInt(raw, 10);
            return Number.isFinite(n) && n >= 0 ? n : this.getDefaultInterval(type);
        }
        return this.getDefaultInterval(type);
    },

    supportsAutoRefresh(type) {
        const widgets = AppState.availableWidgets || [];
        const schema = widgets.find(w => w.type === type);
        if (schema && typeof schema.supports_auto_refresh === 'boolean') {
            return schema.supports_auto_refresh;
        }
        return this.getDefaultInterval(type) > 0;
    },

    _hashId(id) {
        let h = 0;
        for (let i = 0; i < id.length; i++) {
            h = ((h << 5) - h) + id.charCodeAt(i);
            h |= 0;
        }
        return Math.abs(h);
    },

    start() {
        this.stopAll();
        const grid = document.getElementById('dashboard-grid');
        if (!grid) return;

        this._setupIntersectionObserver();
        grid.querySelectorAll('.widget[data-id]').forEach(el => this.scheduleWidget(el));
        this._startTickLoop();
        this._bindVisibility();
    },

    stopAll() {
        this._entries.forEach(entry => clearTimeout(entry.timerId));
        this._entries.clear();
        this._visibility.clear();
        if (this._observer) {
            try { this._observer.disconnect(); } catch (e) {}
            this._observer = null;
        }
        if (this._tickHandle) {
            clearInterval(this._tickHandle);
            this._tickHandle = null;
        }
        this._inFlight = 0;
    },

    rescheduleWidget(widgetId) {
        const el = document.querySelector(`.widget[data-id="${widgetId}"]`);
        if (!el) return;
        this.unscheduleWidget(widgetId);
        this.scheduleWidget(el);
    },

    unscheduleWidget(widgetId) {
        const entry = this._entries.get(widgetId);
        if (entry) {
            clearTimeout(entry.timerId);
            this._entries.delete(widgetId);
        }
    },

    scheduleWidget(widgetEl) {
        const id = widgetEl.getAttribute('data-id');
        const raw = widgetEl.getAttribute('data-widget-raw');
        if (!id || !raw) return;

        let widgetData;
        try {
            widgetData = JSON.parse(raw);
        } catch (e) {
            return;
        }

        const intervalSec = this.resolveIntervalSeconds(widgetData);
        if (!intervalSec || intervalSec <= 0) return;

        // Spread refreshes to avoid bursts; also delay first run to let page settle
        const staggerMs = this._initialDelayMs + ((this._hashId(id) % intervalSec) * 1000);

        const scheduleNext = (delayMs) => {
            const timerId = setTimeout(async () => {
                await this._tickWidget(id, widgetEl, intervalSec, scheduleNext);
            }, delayMs);
            this._entries.set(id, { timerId, intervalSec, el: widgetEl });
        };

        scheduleNext(staggerMs);
    },

    async _tickWidget(widgetId, widgetEl, intervalSec, scheduleNext) {
        if (!document.contains(widgetEl)) {
            this.unscheduleWidget(widgetId);
            return;
        }
        if (this._paused || AppState.isEditingLayout
            || !['dashboard', 'mobile-dashboard'].includes(AppState.activeSection)) {
            scheduleNext(intervalSec * 1000);
            return;
        }
        if (document.hidden) {
            scheduleNext(intervalSec * 1000);
            return;
        }

        // Refresh only if visible in viewport (reduces CPU on large dashboards)
        const visible = this._visibility.get(widgetId);
        if (visible === false) {
            scheduleNext(intervalSec * 1000);
            return;
        }

        // Limit concurrent refreshes (prevents INP spikes)
        if (this._inFlight >= this._maxConcurrent) {
            scheduleNext(1500);
            return;
        }

        const dashCtrl = window.getActiveDashboardController?.();
        if (dashCtrl) {
            this._inFlight += 1;
            try {
                await dashCtrl.refreshWidget(widgetId, null, { silent: true });
            } finally {
                this._inFlight = Math.max(0, this._inFlight - 1);
            }
        }
        scheduleNext(intervalSec * 1000);
    },

    _setupIntersectionObserver() {
        if (this._observer) return;
        if (!('IntersectionObserver' in window)) return;

        this._observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const el = entry.target;
                const id = el.getAttribute('data-id');
                if (!id) return;
                // consider visible when at least 15% in view
                this._visibility.set(id, entry.isIntersecting);
            });
        }, { threshold: 0.15 });

        document.querySelectorAll('.widget[data-id]').forEach(el => {
            try { this._observer.observe(el); } catch (e) {}
        });
    },

    _startTickLoop() {
        if (this._tickHandle) return;
        this._tickHandle = setInterval(() => {
            if (document.hidden && this._lastVisibility) {
                this._paused = true;
            } else if (!document.hidden && !this._lastVisibility) {
                this._paused = false;
            }
            this._lastVisibility = !document.hidden;
        }, 1000);
    },

    _bindVisibility() {
        if (this._visibilityBound) return;
        this._visibilityBound = true;
        document.addEventListener('visibilitychange', () => {
            this._paused = document.hidden;
            this._lastVisibility = !document.hidden;
        });
    },

    appendRefreshConfigFields(fieldsContainer, currentConfig) {
        const t = (k, fb) => (window.i18n ? window.i18n.translate(k) : null) || fb;
        const group = document.createElement('div');
        group.className = 'form-group';
        group.innerHTML = `
            <label for="cfg-refresh_interval">${t('cfg_refresh_label', 'Aktualisierungsintervall')}</label>
            <select class="form-control" id="cfg-refresh_interval"></select>
            <small class="form-hint muted-text">${t('cfg_refresh_hint', 'Leer = Standard je Widget-Typ. 0 = deaktiviert.')}</small>
        `;
        const select = group.querySelector('#cfg-refresh_interval');
        REFRESH_INTERVAL_OPTIONS.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.value;
            el.textContent = opt.label;
            if (String(currentConfig.refresh_interval ?? '') === opt.value) {
                el.selected = true;
            }
            select.appendChild(el);
        });
        fieldsContainer.appendChild(group);
    },

    readRefreshConfig(fieldsContainer) {
        const select = fieldsContainer.querySelector('#cfg-refresh_interval');
        if (!select) return {};
        return { refresh_interval: select.value };
    },
};
