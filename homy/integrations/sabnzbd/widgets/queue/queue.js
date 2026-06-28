window.WidgetRegistry.register('sabnzbd_queue', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/sabnzbd_queue/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }
            const items = data.items || [];
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics"><div class="iw-metric"><span class="label">Queue</span><span class="val">${data.queue_size||0}</span></div>
                <div class="iw-metric"><span class="label">Speed</span><span class="val">${data.speed||'—'}</span></div></div>
                <div class="iw-list">${items.length ? items.map(i => `<div class="iw-row"><div class="iw-row-title">${i.title}</div><div class="iw-row-meta">${i.percentage}% · ${i.status}</div></div>`).join('') : '<div class="iw-empty">Queue empty</div>'}</div>
            </div>`;
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
