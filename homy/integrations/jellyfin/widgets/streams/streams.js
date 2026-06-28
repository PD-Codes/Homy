window.WidgetRegistry.register('media_streams', {
    _typeIcon(type) {
        const t = (type || '').toLowerCase();
        if (t === 'movie') return 'clapperboard';
        if (t === 'episode' || t === 'series') return 'tv';
        if (t === 'music' || t === 'audio') return 'music';
        return 'play-circle';
    },

    _initial(name) {
        return (name || '?').charAt(0).toUpperCase();
    },

    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/media_streams/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }

            const metricsHtml = [
                `<div class="ms-metric"><span class="ms-val">${data.active_sessions ?? 0}</span><span class="ms-label">Streams</span></div>`,
                data.show_library_counts ? `<div class="ms-metric"><span class="ms-val">${(data.total_movies || 0).toLocaleString()}</span><span class="ms-label">Filme</span></div>` : '',
                data.show_library_counts ? `<div class="ms-metric"><span class="ms-val">${(data.total_series || 0).toLocaleString()}</span><span class="ms-label">Serien</span></div>` : '',
            ].filter(Boolean).join('');

            const sessions = data.sessions || [];
            const streamsHtml = sessions.length
                ? sessions.map(s => {
                    const icon = data.show_type_icon
                        ? `<i data-lucide="${this._typeIcon(s.type)}" class="ms-stream-icon"></i>`
                        : '';
                    const progressHtml = data.show_progress
                        ? `<div class="ms-progress-track"><div class="ms-progress-fill" style="width:${s.progress ?? 0}%"></div></div>`
                        : '';
                    return `<div class="ms-stream-card">
                        <div class="ms-avatar">${this._initial(s.user)}</div>
                        <div class="ms-stream-info">
                            <div class="ms-stream-top">
                                ${icon}
                                <span class="ms-stream-title" title="${s.title}">${s.title}</span>
                            </div>
                            <div class="ms-stream-meta">${s.user}${s.progress ? ` · ${s.progress}%` : ''}</div>
                            ${progressHtml}
                        </div>
                    </div>`;
                }).join('')
                : `<div class="ms-empty"><i data-lucide="monitor-off" class="ms-empty-icon"></i><span>Keine aktiven Streams</span></div>`;

            container.innerHTML = `<div class="ms-container">
                <div class="ms-metrics">${metricsHtml}</div>
                <div class="ms-streams">${streamsHtml}</div>
            </div>`;
            window.refreshLucideIcons?.(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>${err.message}</span></div>`;
            window.refreshLucideIcons?.(container);
        }
    },
});
