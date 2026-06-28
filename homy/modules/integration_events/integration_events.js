// Integration Events — Custom URL or Integration

function parseNum(val) {
    if (val === null || val === undefined) return null;
    const n = parseFloat(String(val).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

function formatTime(value, locale) {
    if (value === null || value === undefined || value === '') return '';
    const loc = locale || window.i18n?.currentLocale || 'de-DE';
    const n = parseNum(value);
    if (n !== null) {
        const ms = n > 1e12 ? n : n * 1000;
        const d = new Date(ms);
        if (!isNaN(d.getTime())) {
            return d.toLocaleString(loc, { hour: '2-digit', minute: '2-digit' });
        }
    }
    try {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d.toLocaleString(loc);
    } catch (e) { /* ignore */ }
    return String(value);
}

function severityToClass(sev) {
    const s = String(sev || '').toLowerCase();
    if (!s) return '';
    if (s.includes('crit') || s.includes('extreme')) return 'sev-critical';
    if (s.includes('high') || s.includes('severe')) return 'sev-high';
    if (s.includes('warn') || s.includes('moderate')) return 'sev-warning';
    if (s.includes('info')) return 'sev-info';
    return '';
}

window.WidgetRegistry.register('integration_events', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        const WDS = window.WidgetDataSource;
        if (!WDS) {
            container.innerHTML = '<div class="widget-error">WidgetDataSource nicht geladen</div>';
            return;
        }
        if (!WDS.isConfigured(config)) {
            container.innerHTML = WDS.notConfiguredHtml();
            return;
        }

        const timePath = config.time_path || 'timestamp';
        const messagePath = config.message_path || 'message';
        const severityPath = config.severity_path || '';
        const maxItems = parseInt(config.max_items || '10', 10) || 10;
        const getNestedValue = WDS.getNestedValue;

        try {
            const res = await WDS.fetchValue(config, widgetData.id, { pathKey: 'events_path' });
            container.innerHTML = '';
            if (!res.ok) {
                container.innerHTML = `<div class="widget-error">${res.message || 'Fehler'}</div>`;
                return;
            }

            let items = [];
            const value = res.value;
            if (Array.isArray(value)) items = value;
            else if (value && typeof value === 'object') items = Object.values(value);
            items = items.slice(0, maxItems);

            if (!items.length) {
                container.innerHTML = '<div class="muted-text text-center" style="padding:16px;">Keine Events</div>';
                return;
            }

            container.innerHTML = `
                <div class="events-feed">
                    ${items.map((it) => {
                        const sev = severityPath ? getNestedValue(it, severityPath) : '';
                        const cls = severityToClass(sev);
                        const msg = getNestedValue(it, messagePath);
                        const t = formatTime(getNestedValue(it, timePath), window.i18n?.currentLocale);
                        const title = msg !== undefined && msg !== null ? String(msg) : '';
                        return `
                            <div class="event-row ${cls}">
                                <span class="event-dot"></span>
                                <div class="event-text">
                                    <div class="event-title" title="${title}">${title}</div>
                                    <div class="event-meta muted-text">${t}</div>
                                </div>
                            </div>`;
                    }).join('')}
                </div>`;
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><span>${err.message}</span></div>`;
        }
    },

    renderConfig(fieldsContainer, widgetData, currentConfig) {
        const c = { data_source: 'integration', ...currentConfig };
        if (!c.data_source && c.integration_id) c.data_source = 'integration';
        if (!c.data_source && c.custom_url) c.data_source = 'custom';
        if (!c.events_path && c.data_path) c.events_path = c.data_path;
        const extra = `
            <div class="form-section-divider">Event-Felder</div>
            <div class="form-group"><label for="cfg-time_path">Zeitpfad</label>
            <input type="text" class="form-control" id="cfg-time_path" value="${c.time_path || 'timestamp'}"></div>
            <div class="form-group"><label for="cfg-message_path">Message-Pfad</label>
            <input type="text" class="form-control" id="cfg-message_path" value="${c.message_path || 'message'}"></div>
            <div class="form-group"><label for="cfg-severity_path">Severity-Pfad (optional)</label>
            <input type="text" class="form-control" id="cfg-severity_path" value="${c.severity_path || ''}"></div>
            <div class="form-group"><label for="cfg-max_items">Max. Items</label>
            <input type="text" class="form-control" id="cfg-max_items" value="${c.max_items || '10'}"></div>`;
        window.WidgetDataSource.renderConfig(fieldsContainer, widgetData, c, extra, {
            pathKey: 'events_path',
            pathLabel: 'Events-Pfad',
            pathPlaceholder: 'z.B. problems oder events',
        });
    },

    readConfig(fieldsContainer) {
        return window.WidgetDataSource.readConfig(
            fieldsContainer,
            ['time_path', 'message_path', 'severity_path', 'max_items'],
            { pathKey: 'events_path' },
        );
    },
});
