window.WidgetRegistry.register('sabnzbd_history', {
    _fmtMb(mb) {
        if (!mb) return '';
        if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
        return mb.toFixed(0) + ' MB';
    },

    _fmtTs(ts) {
        if (!ts) return '';
        const d = new Date(ts * 1000);
        const now = new Date();
        const diffH = Math.floor((now - d) / 3600000);
        if (diffH < 1) return 'Gerade eben';
        if (diffH < 24) return `vor ${diffH}h`;
        const diffD = Math.floor(diffH / 24);
        return `vor ${diffD}d`;
    },

    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/sabnzbd_history/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }
            const items = data.items || [];

            const statsHtml = `<div class="sh-header">
                <i data-lucide="clock" class="sh-header-icon"></i>
                <span class="sh-title">Download History</span>
                <span class="sh-count">${data.count ?? items.length} Einträge</span>
            </div>`;

            const listHtml = items.length
                ? `<div class="sh-list">${items.map(i => {
                    const isOk = i.status === 'Completed' || i.status === 'completed';
                    const isFail = i.status === 'Failed' || i.status === 'failed';
                    const stateClass = isOk ? 'sh-state-ok' : isFail ? 'sh-state-fail' : 'sh-state-other';
                    const icon = isOk ? 'check' : isFail ? 'x' : 'clock';
                    const catHtml = data.show_category && i.category ? `<span class="sh-cat">${i.category}</span>` : '';
                    const sizeHtml = data.show_size && i.size_mb ? `<span class="sh-size">${this._fmtMb(i.size_mb)}</span>` : '';
                    const timeHtml = i.completed ? `<span class="sh-time">${this._fmtTs(i.completed)}</span>` : '';
                    return `<div class="sh-item">
                        <span class="sh-icon-wrap ${stateClass}"><i data-lucide="${icon}" class="sh-icon"></i></span>
                        <span class="sh-name" title="${i.title}">${i.title}</span>
                        <div class="sh-meta">${catHtml}${sizeHtml}${timeHtml}</div>
                    </div>`;
                }).join('')}</div>`
                : '<div class="sh-empty">Keine Downloads in der History</div>';

            container.innerHTML = `<div class="sh-container">${statsHtml}${listHtml}</div>`;
            window.refreshLucideIcons?.(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>${err.message}</span></div>`;
            window.refreshLucideIcons?.(container);
        }
    },
});
