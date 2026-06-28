window.WidgetRegistry.register('prowlarr_indexers', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/prowlarr_indexers/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }
            const idx = data.indexers || [];
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics"><div class="iw-metric"><span class="label">Aktiv</span><span class="val">${data.indexers_enabled||0}/${data.indexers_total||0}</span></div></div>
                <div class="iw-list">${idx.map(x => `<div class="iw-row ${x.enabled?'up':'down'}"><div class="iw-row-title">${x.name}</div><div class="iw-row-meta">${x.enabled?'enabled':'disabled'} · ${x.protocol}</div></div>`).join('')}</div>
            </div>`;
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
