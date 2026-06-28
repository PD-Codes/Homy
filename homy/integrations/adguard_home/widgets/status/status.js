window.WidgetRegistry.register('adguard_status', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/adguard_status/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }
            const on = data.protection_enabled;
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics">
                    <div class="iw-metric"><span class="label">Schutz</span><span class="val ${on?'text-success':'text-danger'}">${on?'Aktiv':'Aus'}</span></div>
                    <div class="iw-metric"><span class="label">Anfragen</span><span class="val">${(data.dns_queries||0).toLocaleString()}</span></div>
                    <div class="iw-metric"><span class="label">Geblockt</span><span class="val text-danger">${(data.blocked_filtering||0).toLocaleString()} (${data.blocked_percentage||0}%)</span></div>
                </div></div>`;
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
