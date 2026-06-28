const ZABBIX_SEV_CLASS = {
    0: 'sev-not-classified',
    1: 'sev-information',
    2: 'sev-warning',
    3: 'sev-average',
    4: 'sev-high',
    5: 'sev-disaster',
};

window.WidgetRegistry.register('zabbix_problems', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';

        try {
            const data = await API.request(`/api/zabbix_problems/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';

            if (!data.online) {
                const msg = data.message || window.i18n?.t('zabbix_not_configured', 'integration_zabbix')
                    || 'Zabbix not available';
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${msg}</div>`;
                return;
            }

            const problems = data.problems || [];
            if (!problems.length) {
                const empty = window.i18n?.t('zabbix_problems_empty', 'integration_zabbix') || 'No active problems';
                container.innerHTML = `
                    <div class="zabbix-problems-empty">
                        <i data-lucide="shield-check"></i>
                        <p>${empty}</p>
                    </div>
                `;
                window.refreshLucideIcons(container);
                return;
            }

            container.innerHTML = `
                <div class="zabbix-problems-list">
                    ${problems.map((p) => {
                        const sev = p.severity ?? 0;
                        const cls = ZABBIX_SEV_CLASS[sev] || 'sev-not-classified';
                        return `
                            <div class="zabbix-problem-item ${cls}">
                                <div class="zabbix-problem-head">
                                    <span class="zabbix-problem-sev">${p.severity_label || sev}</span>
                                    <span class="zabbix-problem-time muted-text">${p.started || ''}</span>
                                </div>
                                <div class="zabbix-problem-name">${p.name || 'Problem'}</div>
                                <div class="zabbix-problem-meta muted-text">${p.host || ''}${p.opdata ? ' · ' + p.opdata : ''}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
            window.refreshLucideIcons(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
