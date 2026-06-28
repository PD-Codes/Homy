window.WidgetRegistry.register('adguard_stats', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/adguard_stats/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }
            const show = data.show || 'top_blocked_domains';
            const items = show === 'top_clients' ? (data.top_clients || []) : (data.top_blocked_domains || []);
            const listTitle = show === 'top_clients' ? 'Top Clients' : 'Top geblockte Domains';
            const labelKey = show === 'top_clients' ? 'client' : 'domain';
            const maxCount = items.reduce((m, i) => Math.max(m, i.count || 0), 1);
            const protection = data.protection_enabled
                ? '<span class="ag-badge ag-on">Schutz aktiv</span>'
                : '<span class="ag-badge ag-off">Schutz inaktiv</span>';
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics">
                    <div class="iw-metric"><span class="label">DNS Anfragen</span><span class="val">${(data.dns_queries||0).toLocaleString()}</span></div>
                    <div class="iw-metric"><span class="label">Geblockt</span><span class="val">${(data.blocked_filtering||0).toLocaleString()}</span></div>
                    <div class="iw-metric"><span class="label">%</span><span class="val">${data.blocked_percentage||0}%</span></div>
                    <div class="iw-metric">${protection}</div>
                </div>
                <div class="ph-section-title">${listTitle}</div>
                <div class="iw-list">${items.length
                    ? items.map(i => {
                        const pct = Math.round((i.count / maxCount) * 100);
                        return `<div class="iw-row"><div class="ph-bar-wrap"><div class="ph-bar" style="width:${pct}%"></div></div><div class="iw-row-title">${i[labelKey]}</div><div class="iw-row-meta">${(i.count||0).toLocaleString()}</div></div>`;
                    }).join('')
                    : '<div class="iw-empty">No data</div>'}
                </div>
            </div>`;
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
