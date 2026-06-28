window.WidgetRegistry.register('bazarr_missing', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/bazarr_missing/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }
            container.innerHTML = `<div class="iw-card"><div class="iw-metrics">
                <div class="iw-metric"><span class="label">Filme fehlend</span><span class="val text-warning">${data.missing_movies||0}</span></div>
                <div class="iw-metric"><span class="label">Episoden fehlend</span><span class="val text-warning">${data.missing_episodes||0}</span></div>
                <div class="iw-metric"><span class="label">Bibliothek</span><span class="val">${data.movies||0} / ${data.episodes||0}</span></div>
            </div></div>`;
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
