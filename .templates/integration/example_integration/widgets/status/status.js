// The type string must match 'type' in status.py's WIDGET dict.
window.WidgetRegistry.register('example_status', {

    // Quick i18n helper — falls back to the English string if the locale
    // file hasn't loaded yet or the key doesn't exist.
    _t(key, fallback) {
        if (!window.i18n) return fallback;
        const v = window.i18n.translate(key);
        return v === key ? fallback : v;
    },

    // Escapes a value before dropping it into innerHTML.
    // Never skip this for user-provided or API-provided strings.
    _esc(value) {
        const el = document.createElement('div');
        el.textContent = value == null ? '' : String(value);
        return el.innerHTML;
    },

    // render() is called on initial load and whenever the widget refreshes.
    // container — the widget body element (empty, ready to fill)
    // widgetData — full widget object: { id, type, title, config, ... }
    async render(container, widgetData) {
        // Show a spinner while the request is in flight.
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';

        try {
            const data = await API.request(`/api/example_status/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';

            // The backend returns configured: false if no integration is linked yet.
            if (!data.configured) {
                container.innerHTML = `
                    <div class="muted-text" style="padding:16px;text-align:center;">
                        ${this._t('example_status_not_configured', 'Link an integration in the widget settings.')}
                    </div>`;
                return;
            }

            const online = data.online !== false;
            const statusLabel = online
                ? this._t('example_status_online', 'Online')
                : this._t('example_status_offline', 'Offline');

            container.innerHTML = `
                <div class="example-status ${online ? 'example-status--online' : 'example-status--offline'}">
                    <span class="example-status-dot"></span>
                    <div class="example-status-info">
                        <div class="example-status-label">${statusLabel}</div>
                        <div class="example-status-meta muted-text">
                            ${this._t('example_status_items', 'Items')}: ${data.items_count ?? 0}
                            ${data.status ? ` · ${this._esc(data.status)}` : ''}
                        </div>
                    </div>
                </div>
                ${!online && data.message
                    ? `<div class="muted-text" style="margin-top:8px;font-size:0.75rem;">${this._esc(data.message)}</div>`
                    : ''}
            `;

        } catch (err) {
            // API.request() throws on network errors and non-2xx responses.
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
