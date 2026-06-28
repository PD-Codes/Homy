function zabbixT(key, params) {
    return window.i18n?.translate(key, params) || key;
}

function zabbixPreviewWidgetId(widgetData) {
    const intInput = document.getElementById('cfg-integration_id');
    const integrationId = intInput?.value || widgetData?.config?.integration_id;
    if (integrationId) {
        return `preview-${integrationId}`;
    }
    return widgetData?.id || '';
}

window.WidgetRegistry.register('zabbix_host_status', {
    async renderConfig(fieldsContainer, widgetData, currentConfig) {
        const cfg = currentConfig || {};
        const widgetId = zabbixPreviewWidgetId(widgetData);

        const hostGroup = document.createElement('div');
        hostGroup.className = 'form-group';
        const hostLabel = document.createElement('label');
        hostLabel.setAttribute('for', 'cfg-host_id');
        hostLabel.textContent = zabbixT('zabbix_host_select_label');
        hostGroup.appendChild(hostLabel);

        const hostSel = document.createElement('select');
        hostSel.className = 'form-control';
        hostSel.id = 'cfg-host_id';
        const loadingOpt = document.createElement('option');
        loadingOpt.value = '';
        loadingOpt.textContent = zabbixT('zabbix_host_loading_hosts');
        hostSel.appendChild(loadingOpt);
        hostGroup.appendChild(hostSel);
        fieldsContainer.appendChild(hostGroup);

        const mountGroup = document.createElement('div');
        mountGroup.className = 'form-group';
        const mountLabel = document.createElement('label');
        mountLabel.setAttribute('for', 'cfg-disk_mount');
        mountLabel.textContent = zabbixT('zabbix_host_disk_mount_label');
        mountGroup.appendChild(mountLabel);
        const mountInput = document.createElement('input');
        mountInput.className = 'form-control';
        mountInput.id = 'cfg-disk_mount';
        mountInput.type = 'text';
        mountInput.value = cfg.disk_mount || '/';
        mountGroup.appendChild(mountInput);
        fieldsContainer.appendChild(mountGroup);

        if (!widgetId) {
            loadingOpt.textContent = zabbixT('zabbix_host_select_integration_first');
            return;
        }

        try {
            const res = await API.request(`/api/zabbix/hosts?widget_id=${encodeURIComponent(widgetId)}`);
            hostSel.innerHTML = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = zabbixT('zabbix_host_select_placeholder');
            hostSel.appendChild(placeholder);

            const hosts = res.hosts || [];
            hosts.forEach((h) => {
                const opt = document.createElement('option');
                opt.value = h.hostid;
                opt.textContent = h.name || h.host || h.hostid;
                if (String(h.hostid) === String(cfg.host_id || '')) {
                    opt.selected = true;
                }
                hostSel.appendChild(opt);
            });
            if (!hosts.length) {
                placeholder.textContent = zabbixT('zabbix_host_no_hosts');
            }
        } catch (err) {
            hostSel.innerHTML = '';
            const errOpt = document.createElement('option');
            errOpt.value = '';
            errOpt.textContent = err.message || zabbixT('zabbix_host_load_failed');
            hostSel.appendChild(errOpt);
        }
    },

    readConfig(fieldsContainer) {
        const hostSel = fieldsContainer.querySelector('#cfg-host_id');
        const mountInput = fieldsContainer.querySelector('#cfg-disk_mount');
        const cfg = {
            host_id: hostSel ? hostSel.value : '',
            disk_mount: mountInput?.value?.trim() || '/',
        };
        const intInput = document.getElementById('cfg-integration_id');
        if (intInput?.value) {
            cfg.integration_id = intInput.value;
        }
        return cfg;
    },

    _formatPercent(value) {
        if (value === null || value === undefined) {
            return '—';
        }
        const n = Number(value);
        if (Number.isNaN(n)) {
            return '—';
        }
        return `${n.toFixed(1)}%`;
    },

    _formatTemp(value) {
        if (value === null || value === undefined) {
            return '—';
        }
        const n = Math.round(Number(value));
        if (Number.isNaN(n)) {
            return '—';
        }
        return `${n}°`;
    },

    async render(container, widgetData) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';

        try {
            const data = await API.request(
                `/api/zabbix_host_status/data?widget_id=${encodeURIComponent(widgetData.id)}`,
            );
            container.innerHTML = '';

            if (!data.online) {
                const msg = data.message_key
                    ? zabbixT(data.message_key)
                    : (data.message || zabbixT('zabbix_not_configured'));
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${msg}</div>`;
                return;
            }

            const status = data.status;
            if (!status) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${zabbixT('zabbix_host_no_data')}</div>`;
                return;
            }

            const hostTitle = status.name || status.host || '';
            const temps = status.temperatures || [];
            const tempsHtml = temps.length
                ? temps.map((t) => `
                    <div class="zabbix-host-temp-row">
                        <span class="zabbix-host-temp-label">${t.label}</span>
                        <span class="zabbix-host-temp-value">${this._formatTemp(t.value)}</span>
                    </div>
                `).join('')
                : `<div class="muted-text">${zabbixT('zabbix_host_no_temps')}</div>`;

            container.innerHTML = `
                <div class="zabbix-host-status">
                    <div class="zabbix-host-status-header">
                        <i data-lucide="server" class="zabbix-host-icon"></i>
                        <span>${hostTitle}</span>
                    </div>
                    <div class="zabbix-host-status-metrics">
                        <div class="zabbix-host-metric">
                            <span class="zabbix-host-metric-label">${zabbixT('zabbix_host_cpu')}</span>
                            <span class="zabbix-host-metric-value">${this._formatPercent(status.cpu_percent)}</span>
                        </div>
                        <div class="zabbix-host-metric">
                            <span class="zabbix-host-metric-label">${zabbixT('zabbix_host_memory')}</span>
                            <span class="zabbix-host-metric-value">${this._formatPercent(status.memory_percent)}</span>
                        </div>
                        <div class="zabbix-host-metric">
                            <span class="zabbix-host-metric-label">${zabbixT('zabbix_host_disk')}</span>
                            <span class="zabbix-host-metric-value">${this._formatPercent(status.disk_percent)}</span>
                        </div>
                    </div>
                    <div class="zabbix-host-temps-title">${zabbixT('zabbix_host_temps')}</div>
                    <div class="zabbix-host-temps">${tempsHtml}</div>
                </div>
            `;
            window.refreshLucideIcons?.(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
