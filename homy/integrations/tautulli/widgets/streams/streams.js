window.WidgetRegistry.register('tautulli_streams', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/tautulli_streams/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }
            const s = data.streams || [];
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics"><div class="iw-metric"><span class="label">Streams</span><span class="val">${data.stream_count||0}</span></div>
                <div class="iw-metric"><span class="label">Transcodes</span><span class="val">${data.transcodes||0}</span></div></div>
                <div class="iw-list">${s.length ? s.map(x => `<div class="iw-row"><div class="iw-row-title">${x.title}</div><div class="iw-row-meta">${x.user}${x.transcode?' · transcode':''}</div></div>`).join('') : '<div class="iw-empty">No streams</div>'}</div>
            </div>`;
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
