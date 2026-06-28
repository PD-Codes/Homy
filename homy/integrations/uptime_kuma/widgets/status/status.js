window.WidgetRegistry.register('uptime_kuma_status', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/uptime_kuma_status/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }
            const t = (k, fb) => (window.i18n?.translate(k) !== k ? window.i18n.translate(k) : null) || fb;
            const monitors = data.monitors || [];
            const allOk = (data.down_count ?? 0) === 0;

            const badgeHtml = data.show_status_badge
                ? (allOk
                    ? `<div class="uk-global-badge uk-ok"><i data-lucide="check-circle"></i><span>${t('uptime_all_up', 'Alle online')}</span></div>`
                    : `<div class="uk-global-badge uk-issues"><i data-lucide="alert-triangle"></i><span>${data.down_count} DOWN</span></div>`)
                : '';

            const statsHtml = `<div class="uk-stats">
                <div class="uk-stat"><span class="uk-stat-val uk-color-up">${data.up_count ?? 0}</span><span class="uk-stat-label">UP</span></div>
                <div class="uk-stat"><span class="uk-stat-val uk-color-down">${data.down_count ?? 0}</span><span class="uk-stat-label">DOWN</span></div>
                <div class="uk-stat"><span class="uk-stat-val">${data.monitor_count ?? 0}</span><span class="uk-stat-label">${t('uptime_total', 'Total')}</span></div>
                ${badgeHtml}
            </div>`;

            let listHtml;
            if (data.view_mode === 'Kompakt') {
                listHtml = monitors.length
                    ? `<div class="uk-compact-grid">${monitors.map(m =>
                        `<div class="uk-compact-item ${m.status}" title="${m.name}">
                            <span class="uk-compact-dot"></span>
                            <span class="uk-compact-name">${m.name}</span>
                        </div>`).join('')}</div>`
                    : `<div class="uk-empty">${t('uptime_all_up', 'Alle Monitore online')}</div>`;
            } else {
                listHtml = `<div class="uk-list">${
                    monitors.length
                        ? monitors.map(m => `
                            <div class="uk-row ${m.status}">
                                <span class="uk-status-dot ${m.status}"></span>
                                <span class="uk-row-name">${m.name}</span>
                                <span class="uk-row-status ${m.status}">${m.status.toUpperCase()}</span>
                            </div>`).join('')
                        : `<div class="uk-empty"><i data-lucide="check-circle" class="uk-empty-icon"></i>${t('uptime_all_up', 'Alle Monitore online')}</div>`
                }</div>`;
            }

            container.innerHTML = `<div class="uk-container">${statsHtml}${listHtml}</div>`;
            window.refreshLucideIcons?.(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>${err.message}</span></div>`;
            window.refreshLucideIcons?.(container);
        }
    },
});
