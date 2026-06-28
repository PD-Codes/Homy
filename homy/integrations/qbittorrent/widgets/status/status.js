window.WidgetRegistry.register('torrent_status', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/torrent_status/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }
            const fmt = (n) => { n=+n||0; if(n>=1048576)return(n/1048576).toFixed(1)+' MB/s'; if(n>=1024)return(n/1024).toFixed(1)+' KB/s'; return n+' B/s'; };
            const t = data.torrents || [];
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics"><div class="iw-metric"><span class="label">${data.client}</span><span class="val">↓ ${fmt(data.dl_speed)}</span></div>
                <div class="iw-metric"><span class="label">Upload</span><span class="val">↑ ${fmt(data.up_speed)}</span></div></div>
                <div class="iw-list">${t.length ? t.map(x => `<div class="iw-row"><div class="iw-row-title">${x.name}</div><div class="iw-row-meta">${x.progress}%</div></div>`).join('') : '<div class="iw-empty">No active downloads</div>'}</div>
            </div>`;
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
