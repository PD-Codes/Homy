window.WidgetRegistry.register('glances_system', {
    _bar(label, pct, colorClass) {
        const p = Math.min(100, Math.max(0, pct ?? 0));
        const cls = p >= 90 ? 'gl-bar-danger' : p >= 70 ? 'gl-bar-warn' : (colorClass || '');
        return `<div class="gl-bar-item">
            <div class="gl-bar-label"><span>${label}</span><span>${p}%</span></div>
            <div class="gl-bar-track"><div class="gl-bar-fill ${cls}" style="width:${p}%"></div></div>
        </div>`;
    },

    _fmtMb(mb) {
        if (mb == null) return '—';
        if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
        return mb.toFixed(0) + ' MB';
    },

    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/glances_system/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }

            const bars = [
                this._bar('CPU', data.cpu_percent, 'gl-bar-cpu'),
                this._bar('RAM', data.mem_percent, 'gl-bar-mem'),
                data.disk_percent != null ? this._bar(`Disk (${data.disk_mount || '/'})`, data.disk_percent, 'gl-bar-disk') : '',
                data.show_swap && data.swap_percent > 0 ? this._bar('Swap', data.swap_percent, 'gl-bar-swap') : '',
            ].filter(Boolean).join('');

            let netHtml = '';
            if (data.show_network) {
                netHtml = `<div class="gl-net">
                    <span class="gl-net-item"><i data-lucide="arrow-down" class="gl-net-icon gl-net-down"></i>${this._fmtMb(data.net_rx_mb)}</span>
                    <span class="gl-net-item"><i data-lucide="arrow-up" class="gl-net-icon gl-net-up"></i>${this._fmtMb(data.net_tx_mb)}</span>
                </div>`;
            }

            let procHtml = '';
            if (data.show_processes && data.processes?.length) {
                procHtml = `<div class="gl-proc-section">
                    <div class="gl-section-title">Prozesse</div>
                    <div class="gl-proc-list">
                        ${data.processes.map(p => `
                            <div class="gl-proc-row">
                                <span class="gl-proc-name" title="${p.name}">${p.name}</span>
                                <span class="gl-proc-stat">CPU ${p.cpu}%</span>
                                <span class="gl-proc-stat">MEM ${p.mem}%</span>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
            }

            container.innerHTML = `<div class="gl-container">
                <div class="gl-bars">${bars}</div>
                ${netHtml}
                ${procHtml}
            </div>`;
            window.refreshLucideIcons?.(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>${err.message}</span></div>`;
            window.refreshLucideIcons?.(container);
        }
    },
});
