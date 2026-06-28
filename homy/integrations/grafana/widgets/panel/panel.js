window.WidgetRegistry.register('grafana', {
    async render(container, widgetData) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/grafana/status?widget_id=${widgetData.id}`);
            container.innerHTML = '';

            if (!data.configured) {
                container.innerHTML = `<div class="muted-text" style="padding:16px;text-align:center;">${data.message}</div>`;
                return;
            }
            if (!data.online) {
                container.innerHTML = `<div class="text-danger" style="padding:16px;text-align:center;">${data.message || window.i18n.translate('grafana_offline')}</div>`;
                return;
            }

            const wrap = document.createElement('div');
            wrap.className = 'grafana-widget';

            if (data.view_mode === 'Health') {
                const db = data.health?.database || 'unknown';
                wrap.innerHTML = `
                    <div class="grafana-health">
                        <div class="grafana-health-row"><span>${window.i18n.translate('grafana_health_db')}</span><strong>${db}</strong></div>
                        <div class="grafana-health-row"><span>${window.i18n.translate('grafana_health_version')}</span><strong>${data.health?.version || '—'}</strong></div>
                    </div>
                `;
            } else if (data.view_mode === 'Panels' && data.panels?.length) {
                data.panels.forEach(panel => {
                    const block = document.createElement('div');
                    block.className = 'grafana-panel-block';
                    block.innerHTML = `<div class="grafana-panel-title">${panel.title}</div>`;
                    const img = document.createElement('img');
                    img.className = 'grafana-panel-img';
                    img.alt = panel.title;
                    img.loading = 'lazy';
                    img.src = panel.render_url;
                    block.appendChild(img);
                    wrap.appendChild(block);
                });
            } else {
                const list = document.createElement('div');
                list.className = 'grafana-dashboard-list';
                if (!data.dashboards?.length) {
                    list.innerHTML = `<div class="muted-text">${window.i18n.translate('grafana_no_dashboards')}</div>`;
                } else {
                    list.innerHTML = data.dashboards.map(d => `
                        <div class="grafana-dash-row">
                            <i data-lucide="layout-dashboard"></i>
                            <span>${d.title}</span>
                            <code class="muted-text">${d.uid || ''}</code>
                        </div>
                    `).join('');
                }
                wrap.appendChild(list);
            }

            container.appendChild(wrap);
            window.refreshLucideIcons(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
