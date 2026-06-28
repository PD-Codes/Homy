window.WidgetRegistry.register('zabbix_status', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';

        try {
            const data = await API.request(`/api/zabbix_status/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';

            if (!data.online) {
                const msg = data.message || window.i18n?.t('zabbix_not_configured', 'integration_zabbix')
                    || 'Zabbix not available';
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${msg}</div>`;
                return;
            }

            const fmt = (n) => (window.formatNumber ? window.formatNumber(n) : Number(n).toLocaleString());
            const high = data.problems_high || 0;
            const statusClass = high > 0 ? 'zabbix-alert' : 'zabbix-ok';

            container.innerHTML = `
                <div class="zabbix-status-card">
                    <div class="zabbix-status-header">
                        <span class="zabbix-brand">
                            <i data-lucide="activity" class="zabbix-icon ${statusClass}"></i>
                            <span>Zabbix</span>
                        </span>
                        <span class="zabbix-version muted-text">v${data.version || '?'}</span>
                    </div>
                    <div class="zabbix-metrics">
                        <div class="zabbix-metric">
                            <span class="metric-label">Hosts</span>
                            <span class="metric-value">${fmt(data.host_count || 0)}</span>
                        </div>
                        <div class="zabbix-metric">
                            <span class="metric-label">Problems</span>
                            <span class="metric-value ${data.problems_count ? 'text-warning' : ''}">${fmt(data.problems_count || 0)}</span>
                        </div>
                        <div class="zabbix-metric">
                            <span class="metric-label">High / Disaster</span>
                            <span class="metric-value ${high ? 'text-danger' : ''}">${fmt(high)}</span>
                        </div>
                    </div>
                    <div class="zabbix-severity-row muted-text">
                        <span>W: ${data.problems_warning || 0}</span>
                        <span>Avg: ${data.problems_average || 0}</span>
                        <span>Disaster: ${data.problems_disaster || 0}</span>
                    </div>
                </div>
            `;
            window.refreshLucideIcons(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>${err.message}</span></div>`;
            window.refreshLucideIcons(container);
        }
    },
});
