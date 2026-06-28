window.WidgetRegistry.register('json_value', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/json_value/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }
            const label = data.label || 'Value';
            const unit = data.unit ? `<span class="jv-unit">${data.unit}</span>` : '';
            const keys = (data.payload_keys || []).slice(0, 8);
            const keysHtml = keys.length
                ? `<div class="jv-keys">${keys.map(k => `<span class="jv-key">${k}</span>`).join('')}</div>`
                : '';
            container.innerHTML = `<div class="jv-card">
                <div class="jv-label">${label}</div>
                <div class="jv-value">${data.value ?? '—'}${unit}</div>
                ${data.path ? `<div class="jv-path">${data.path}</div>` : keysHtml}
            </div>`;
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
