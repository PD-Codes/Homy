window.WidgetRegistry.register('system_info', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';

        try {
            const data = await API.request(`/api/system_info/stats?widget_id=${widgetData.id}`);
            container.innerHTML = '';

            const showCpu = config.show_cpu !== 'Nein';
            const showRam = config.show_ram !== 'Nein';
            const showDisk = config.show_disk !== 'Nein';
            const showUptime = config.show_uptime !== 'Nein';

            let html = '<div class="sys-info-widget">';

            const t = (key, fallback) => {
                if (window.i18n && typeof window.i18n.translate === 'function') {
                    const val = window.i18n.translate(key);
                    return val !== key ? val : fallback;
                }
                return fallback;
            };

            if (showCpu) {
                const cpuVal = data.cpu != null ? data.cpu : 0;
                let colorClass = 'status-ok';
                if (cpuVal > 80) colorClass = 'status-critical';
                else if (cpuVal > 50) colorClass = 'status-warn';

                html += `
                    <div class="sys-item">
                        <div class="sys-item-header">
                            <span class="sys-item-title"><i data-lucide="cpu"></i> ${t('sys_cpu_load', 'CPU-Auslastung')}</span>
                            <span class="sys-item-val">${cpuVal}%</span>
                        </div>
                        <div class="sys-progress-bg">
                            <div class="sys-progress-bar ${colorClass}" style="width: ${cpuVal}%"></div>
                        </div>
                    </div>
                `;
            }

            if (showRam) {
                const ram = data.ram || { total: 16.0, used: 0, percent: 0 };
                let colorClass = 'status-ok';
                if (ram.percent > 85) colorClass = 'status-critical';
                else if (ram.percent > 65) colorClass = 'status-warn';

                html += `
                    <div class="sys-item">
                        <div class="sys-item-header">
                            <span class="sys-item-title"><i data-lucide="hard-drive"></i> ${t('sys_ram', 'Arbeitsspeicher (RAM)')}</span>
                            <span class="sys-item-val">${ram.used} / ${ram.total} GB (${ram.percent}%)</span>
                        </div>
                        <div class="sys-progress-bg">
                            <div class="sys-progress-bar ${colorClass}" style="width: ${ram.percent}%"></div>
                        </div>
                    </div>
                `;
            }

            if (showDisk) {
                const disk = data.disk || { total: 100, used: 0, percent: 0 };
                let colorClass = 'status-ok';
                if (disk.percent > 90) colorClass = 'status-critical';
                else if (disk.percent > 75) colorClass = 'status-warn';

                html += `
                    <div class="sys-item">
                        <div class="sys-item-header">
                            <span class="sys-item-title"><i data-lucide="database"></i> ${t('sys_disk', 'Festplatte (Disk)')}</span>
                            <span class="sys-item-val">${disk.used} / ${disk.total} GB (${disk.percent}%)</span>
                        </div>
                        <div class="sys-progress-bg">
                            <div class="sys-progress-bar ${colorClass}" style="width: ${disk.percent}%"></div>
                        </div>
                    </div>
                `;
            }

            if (showUptime) {
                html += `
                    <div class="sys-uptime">
                        <i data-lucide="clock"></i>
                        <span>${t('sys_uptime', 'System-Uptime')}: <strong>${data.uptime || 'n/a'}</strong></span>
                    </div>
                `;
            }

            html += '</div>';
            container.innerHTML = html;
            window.refreshLucideIcons(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    }
});
