window.WidgetRegistry.register('aniworld_status', {
    _t(key, fallback) {
        if (!window.i18n) return fallback;
        const value = window.i18n.translate(key);
        return value === key ? fallback : value;
    },

    async render(container, widgetData) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/aniworld_status/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.configured) {
                container.innerHTML = `<div class="muted-text" style="padding:16px;text-align:center;">${data.message}</div>`;
                return;
            }

            const q = data.queue || {};
            const run = data.currently_running;
            const paused = data.paused
                ? this._t('aniworld_paused', 'Pausiert')
                : this._t('aniworld_active', 'Aktiv');
            const wrap = document.createElement('div');
            wrap.className = 'aniworld-status-widget';

            wrap.innerHTML = `
                <div class="aniworld-status-head">
                    <span class="aniworld-badge ${data.paused ? 'paused' : 'active'}">${paused}</span>
                    <span class="muted-text">v${data.version || '?'}</span>
                </div>
                <div class="aniworld-queue-grid">
                    <div class="aniworld-stat"><span class="num">${q.queued ?? 0}</span><span class="lbl">${this._t('aniworld_queued', 'Warteschlange')}</span></div>
                    <div class="aniworld-stat"><span class="num">${q.running ?? 0}</span><span class="lbl">${this._t('aniworld_running', 'Läuft')}</span></div>
                    <div class="aniworld-stat"><span class="num">${q.completed ?? 0}</span><span class="lbl">${this._t('aniworld_completed', 'Abgeschlossen')}</span></div>
                    <div class="aniworld-stat"><span class="num">${q.failed ?? 0}</span><span class="lbl">${this._t('aniworld_failed', 'Fehlgeschlagen')}</span></div>
                </div>
            `;

            if (run && run.title) {
                const block = document.createElement('div');
                block.className = 'aniworld-current';
                const pct = Math.min(100, parseInt(data.progress_percent, 10) || 0);
                block.innerHTML = `
                    <div class="aniworld-current-title">${run.title}</div>
                    <div class="muted-text" style="font-size:0.75rem;">
                        ${this._t('aniworld_episode', 'Episode')} ${run.current_episode || '?'}/${run.total_episodes || '?'}
                    </div>
                    <div class="aniworld-progress"><div class="fill" style="width:${pct}%"></div></div>
                `;
                wrap.appendChild(block);
            }

            container.appendChild(wrap);
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
