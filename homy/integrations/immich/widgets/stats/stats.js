window.WidgetRegistry.register('immich_stats', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/immich_stats/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }

            const usageGb = data.usage_gb ?? 0;
            const warnGb = data.storage_warning_gb ?? 0;
            const storPct = warnGb > 0 ? Math.min(100, Math.round((usageGb / warnGb) * 100)) : 0;
            const barCls = storPct >= 90 ? 'im-bar-danger' : storPct >= 70 ? 'im-bar-warn' : '';

            const versionHtml = data.show_version && data.version
                ? `<span class="im-version">v${data.version}</span>` : '';

            const storageHtml = `<div class="im-storage">
                <div class="im-storage-label">
                    <span>Speicher</span>
                    <span>${usageGb} GB${warnGb ? ` / ${warnGb} GB` : ''}</span>
                </div>
                <div class="im-storage-track"><div class="im-storage-fill ${barCls}" style="width:${warnGb ? storPct : 100}%"></div></div>
            </div>`;

            container.innerHTML = `<div class="im-container">
                <div class="im-header">
                    <i data-lucide="image" class="im-header-icon"></i>
                    <span class="im-title">Immich</span>
                    ${versionHtml}
                </div>
                <div class="im-counts">
                    <div class="im-count"><i data-lucide="camera" class="im-count-icon"></i><div><span class="im-count-val">${(data.photos || 0).toLocaleString()}</span><span class="im-count-label">Fotos</span></div></div>
                    <div class="im-count"><i data-lucide="film" class="im-count-icon"></i><div><span class="im-count-val">${(data.videos || 0).toLocaleString()}</span><span class="im-count-label">Videos</span></div></div>
                    <div class="im-count"><i data-lucide="hard-drive" class="im-count-icon"></i><div><span class="im-count-val">${usageGb}</span><span class="im-count-label">GB</span></div></div>
                </div>
                ${storageHtml}
            </div>`;
            window.refreshLucideIcons?.(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>${err.message}</span></div>`;
            window.refreshLucideIcons?.(container);
        }
    },
});
