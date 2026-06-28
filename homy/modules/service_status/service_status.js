window.WidgetRegistry.register('service_status', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';

        try {
            const data = await API.request(`/api/service_status/check?widget_id=${widgetData.id}`);
            container.innerHTML = '';

            if (!data.configured) {
                container.innerHTML = `<div class="muted-text text-center" style="padding:16px;">${data.message}</div>`;
                return;
            }

            const summary = data.summary || { up: 0, total: 0 };
            const rows = (data.services || []).map(s => {
                const dot = s.online ? 'status-up' : 'status-down';
                const latLabel = s.latency_ms != null
                    ? (s.latency_ms === 0 ? '<1 ms' : `${s.latency_ms} ms`)
                    : '';
                const meta = s.online
                    ? `${latLabel}${s.status_code ? ' · ' + s.status_code : ''}`
                    : (s.error || 'offline');
                return `
                    <div class="svc-row">
                        <span class="svc-dot ${dot}"></span>
                        <div class="svc-info">
                            <div class="svc-name">${s.name}</div>
                            <div class="svc-url muted-text">${s.url}</div>
                        </div>
                        <span class="svc-meta ${s.online ? '' : 'text-danger'}">${meta}</span>
                    </div>
                `;
            }).join('');

            container.innerHTML = `
                <div class="svc-widget">
                    <div class="svc-summary">${summary.up}/${summary.total} online</div>
                    <div class="svc-list">${rows}</div>
                </div>
            `;
            window.refreshLucideIcons(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
