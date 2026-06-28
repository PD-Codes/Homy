window.WidgetRegistry.register('aniworld_stats', {
    _t(key, fallback) {
        if (!window.i18n) return fallback;
        const value = window.i18n.translate(key);
        return value === key ? fallback : value;
    },

    async render(container, widgetData) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/aniworld_stats/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.configured) {
                container.innerHTML = `<div class="muted-text" style="padding:16px;">${data.message}</div>`;
                return;
            }

            const grid = document.createElement('div');
            grid.className = 'aniworld-stats-grid';
            const stats = [
                ['aniworld_stat_total', 'Downloads gesamt', data.total_downloads],
                ['aniworld_stat_completed', 'Abgeschlossen', data.completed],
                ['aniworld_stat_failed', 'Fehlgeschlagen', data.failed],
                ['aniworld_stat_24h', 'Letzte 24h', data.last_24h_completed],
                ['aniworld_stat_speed', 'Ø Geschwindigkeit', `${Number(data.average_speed_mbps || 0).toFixed(1)} Mbit/s`],
                ['aniworld_stat_episodes', 'Episoden gesamt', data.total_episodes],
            ];
            grid.innerHTML = stats.map(([key, label, val]) => `
                <div class="aniworld-stats-card">
                    <div class="num">${val}</div>
                    <div class="lbl">${this._t(key, label)}</div>
                </div>
            `).join('');
            container.appendChild(grid);
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
