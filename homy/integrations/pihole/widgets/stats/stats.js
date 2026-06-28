window.WidgetRegistry.register('pihole_stats', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/pihole_stats/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }
            const show = data.show || 'top_ads';
            const items = show === 'top_ads' ? (data.top_ads || []) : (data.top_queries || []);
            const listTitle = show === 'top_ads' ? 'Top geblockte Domains' : 'Top Anfragen';
            const maxCount = items.reduce((m, i) => Math.max(m, i.count || 0), 1);
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics">
                    <div class="iw-metric"><span class="label">Anfragen heute</span><span class="val">${(data.dns_queries_today||0).toLocaleString()}</span></div>
                    <div class="iw-metric"><span class="label">Geblockt</span><span class="val">${(data.ads_blocked_today||0).toLocaleString()}</span></div>
                    <div class="iw-metric"><span class="label">Blockiert %</span><span class="val">${data.ads_percentage_today||0}%</span></div>
                </div>
                <div class="ph-section-title">${listTitle}</div>
                <div class="iw-list">${items.length
                    ? items.map(i => {
                        const pct = Math.round((i.count / maxCount) * 100);
                        return `<div class="iw-row"><div class="ph-bar-wrap"><div class="ph-bar" style="width:${pct}%"></div></div><div class="iw-row-title">${i.domain}</div><div class="iw-row-meta">${(i.count||0).toLocaleString()}</div></div>`;
                    }).join('')
                    : '<div class="iw-empty">No data</div>'}
                </div>
            </div>`;
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
