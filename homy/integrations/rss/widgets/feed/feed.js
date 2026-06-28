window.WidgetRegistry.register('rss_feed', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/rss_feed/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }
            const items = data.items || [];
            container.innerHTML = `<div class="iw-card iw-list">${items.length ? items.map(i => `<a class="iw-row" href="${i.link||'#'}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit"><div class="iw-row-title">${i.title}</div><div class="iw-row-meta">${i.feed||''} · ${i.published||''}</div></a>`).join('') : '<div class="iw-empty">No feed items</div>'}</div>`;
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
