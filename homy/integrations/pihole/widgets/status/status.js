window.WidgetRegistry.register('pihole_status', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        
        try {
            const data = await API.request(`/api/pihole_status/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            
            const card = document.createElement('div');
            card.className = 'pihole-container';
            
            const statusClass = data.status === 'enabled' ? 'status-active' : 'status-inactive';
            
            // Build card structure
            const dnsLabel = window.i18n?.translate('pihole_widget_dns_queries') || 'DNS queries';
            const blockedLabel = window.i18n?.translate('pihole_widget_ads_blocked') || 'Blocked ads';
            const blockedPctLabel = window.i18n?.translate('pihole_widget_blocked_pct') || 'Blocked';
            const disableLabel = window.i18n?.translate('pihole_widget_disable_5min') || 'Pause 5 min';
            const enableLabel = window.i18n?.translate('pihole_widget_enable') || 'Enable';
            const statusActive = window.i18n?.translate('pihole_widget_status_active') || 'Active';
            const statusInactive = window.i18n?.translate('pihole_widget_status_inactive') || 'Disabled';
            const titleLabel = window.i18n?.translate('pihole_widget_title') || 'Pi-hole AdBlock';

            card.innerHTML = `
                <div class="pihole-header">
                    <span class="pihole-brand">
                        <i data-lucide="shield-check" class="pihole-shield ${statusClass}"></i>
                        <span>${titleLabel}</span>
                    </span>
                    <span class="pihole-badge ${statusClass}">${data.status === 'enabled' ? statusActive : statusInactive}</span>
                </div>

                <div class="pihole-body">
                    <div class="pihole-metrics">
                        <div class="pihole-metric-item">
                            <span class="metric-label">${dnsLabel}</span>
                            <span class="metric-value">${window.formatNumber ? window.formatNumber(data.dns_queries_today) : data.dns_queries_today.toLocaleString()}</span>
                        </div>
                        <div class="pihole-metric-item">
                            <span class="metric-label">${blockedLabel}</span>
                            <span class="metric-value text-danger">${window.formatNumber ? window.formatNumber(data.ads_blocked_today) : data.ads_blocked_today.toLocaleString()}</span>
                        </div>
                        <div class="pihole-chart-box">
                            <div class="pihole-percentage-circle" style="--percent: ${data.ads_percentage_today}">
                                <div class="percent-inner">
                                    <span class="percent-val">${data.ads_percentage_today}%</span>
                                    <span class="percent-sub">${blockedPctLabel}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="pihole-actions">
                        ${data.status === 'enabled' ? `
                            <button type="button" class="btn btn-outline btn-sm btn-pihole-toggle" data-action="disable">
                                <i data-lucide="shield-off"></i> ${disableLabel}
                            </button>
                        ` : `
                            <button type="button" class="btn btn-success btn-sm btn-pihole-toggle" data-action="enable">
                                <i data-lucide="shield"></i> ${enableLabel}
                            </button>
                        `}
                    </div>
                </div>
            `;
            
            // Add event listener for toggling
            const btnToggle = card.querySelector('.btn-pihole-toggle');
            if (btnToggle) {
                btnToggle.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const action = btnToggle.getAttribute('data-action');
                    btnToggle.disabled = true;
                    btnToggle.innerHTML = '<div class="spinner spinner-xs"></div> Bitte warten...';
                    
                    try {
                        await API.request('/api/pihole_status/toggle', {
                            method: 'POST',
                            body: {
                                widget_id: widgetData.id,
                                action: action,
                                duration: 300 // 5 minutes
                            }
                        });
                        showToast(`Pi-hole erfolgreich ${action === 'disable' ? 'deaktiviert' : 'aktiviert'}!`, "success");
                        // Refresh widgets
                        if (window.DashboardController) {
                            window.DashboardController.refreshWidget(widgetData.id, null, { force: true });
                        }
                    } catch (err) {
                        showToast("Fehler: " + err.message, "error");
                        btnToggle.disabled = false;
                    }
                });
            }
            
            container.appendChild(card);
            window.refreshLucideIcons(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>${err.message}</span></div>`;
            window.refreshLucideIcons(container);
        }
    }
});
