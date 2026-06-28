window.WidgetRegistry.register('aniworld_queue', {
    _t(key, fallback) {
        if (!window.i18n) return fallback;
        const value = window.i18n.translate(key);
        return value === key ? fallback : value;
    },

    async render(container, widgetData) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/aniworld_queue/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.configured) {
                container.innerHTML = `<div class="muted-text" style="padding:16px;">${data.message}</div>`;
                return;
            }

            const list = document.createElement('div');
            list.className = 'aniworld-queue-list';

            if (!data.items?.length) {
                list.innerHTML = `<div class="muted-text">${this._t('aniworld_queue_empty', 'Warteschlange leer')}</div>`;
            } else {
                data.items.forEach(item => {
                    const row = document.createElement('div');
                    row.className = 'aniworld-queue-row';
                    const title = item.title || item.name || item.id || '—';
                    const status = item.status || '—';
                    const ep = item.current_episode != null
                        ? ` · ${item.current_episode}/${item.total_episodes || '?'}`
                        : '';
                    row.innerHTML = `
                        <div class="aniworld-queue-title">${title}${ep}</div>
                        <span class="aniworld-queue-status">${status}</span>
                    `;
                    list.appendChild(row);
                });
            }

            container.appendChild(list);
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
