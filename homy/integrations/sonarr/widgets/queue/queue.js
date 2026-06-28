window.WidgetRegistry.register('arr_queue', {
    _fmtBytes(b) {
        if (!b) return '';
        if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
        if (b >= 1048576) return (b / 1048576).toFixed(0) + ' MB';
        return (b / 1024).toFixed(0) + ' KB';
    },

    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/arr_queue/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }
            const items = data.items || [];
            const statsHtml = `<div class="aq-stats">
                <div class="aq-stat"><span class="aq-val">${data.app_name || 'Queue'}</span><span class="aq-label">App</span></div>
                <div class="aq-stat"><span class="aq-val">${data.queue_count ?? 0}</span><span class="aq-label">Aktiv</span></div>
                <div class="aq-stat"><span class="aq-val">${data.queue_total ?? 0}</span><span class="aq-label">Gesamt</span></div>
            </div>`;

            const itemsHtml = items.length
                ? items.map(i => {
                    const pct = Math.min(100, Math.max(0, i.progress ?? 0));
                    const progressHtml = data.show_progress
                        ? `<div class="aq-progress-track"><div class="aq-progress-fill" style="width:${pct}%"></div></div>`
                        : '';
                    const proto = data.show_protocol && i.protocol
                        ? `<span class="aq-proto aq-proto-${i.protocol}">${i.protocol}</span>` : '';
                    const eta = data.show_eta && i.eta ? `<span class="aq-eta">${i.eta}</span>` : '';
                    const left = i.sizeleft ? this._fmtBytes(i.sizeleft) : '';
                    return `<div class="aq-item">
                        <div class="aq-item-header">
                            <span class="aq-item-title" title="${i.title}">${i.title}</span>
                            <div class="aq-item-badges">${proto}${eta}</div>
                        </div>
                        <div class="aq-item-meta">
                            <span>${i.status || ''}</span>
                            ${left ? `<span class="aq-left">${left} übrig</span>` : ''}
                            <span class="aq-pct">${pct}%</span>
                        </div>
                        ${progressHtml}
                    </div>`;
                }).join('')
                : '<div class="aq-empty">Queue leer</div>';

            container.innerHTML = `<div class="aq-container">${statsHtml}<div class="aq-list">${itemsHtml}</div></div>`;
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
