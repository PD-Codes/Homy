// Integration Table — Custom URL or Integration

function parseColumns(columnsText) {
    const raw = (columnsText || '').trim();
    if (!raw) return [];
    return raw.split(/[,\n]/g).map((s) => s.trim()).filter(Boolean);
}

function renderTableValue(container, value, config) {
    const WDS = window.WidgetDataSource;
    const getNestedValue = (obj, path) => WDS.getNestedValue(obj, path);
    const mode = config.mode || 'table';
    const maxRows = parseInt(config.max_rows || '10', 10) || 10;
    const columns = parseColumns(config.columns);

    if (value === undefined || value === null) {
        container.innerHTML = '<div class="muted-text text-center" style="padding:16px;">Keine Daten</div>';
        return;
    }

    if (mode === 'list') {
        const items = Array.isArray(value) ? value.slice(0, maxRows) : [value].slice(0, maxRows);
        container.innerHTML = `
            <div class="integration-list">
                ${items.map((it) => {
                    const line = typeof it === 'object' && it !== null
                        ? JSON.stringify(it).slice(0, 180)
                        : String(it);
                    return `<div class="integration-list-item"><span class="muted-text">${line}</span></div>`;
                }).join('')}
            </div>`;
        return;
    }

    if (Array.isArray(value)) {
        const items = value.slice(0, maxRows);
        const first = items.find((x) => x !== null && x !== undefined);
        if (Array.isArray(first)) {
            container.innerHTML = '<div class="muted-text text-center" style="padding:16px;">Array von Arrays — Pfad genauer wählen.</div>';
            return;
        }
        if (typeof first === 'object' && first !== null) {
            const autoColumns = columns.length ? columns : Object.keys(first).slice(0, 8);
            container.innerHTML = `
                <div class="integration-table-wrap">
                    <table class="integration-table">
                        <thead><tr>${autoColumns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
                        <tbody>${items.map((row) => `
                            <tr>${autoColumns.map((col) => {
                                const v = getNestedValue(row, col);
                                const txt = typeof v === 'object' && v !== null ? JSON.stringify(v).slice(0, 120) : v;
                                return `<td>${txt === undefined || txt === null ? '' : String(txt)}</td>`;
                            }).join('')}</tr>`).join('')}
                        </tbody>
                    </table>
                </div>`;
            return;
        }
        container.innerHTML = `
            <div class="integration-table-wrap">
                <table class="integration-table">
                    <thead><tr><th>Value</th></tr></thead>
                    <tbody>${items.map((v) => `<tr><td>${String(v)}</td></tr>`).join('')}</tbody>
                </table>
            </div>`;
        return;
    }

    if (typeof value === 'object') {
        const entries = Object.entries(value).slice(0, maxRows);
        container.innerHTML = `
            <div class="integration-kv-list">
                ${entries.map(([k, v]) => {
                    const txt = typeof v === 'object' && v !== null ? JSON.stringify(v).slice(0, 160) : v;
                    return `<div class="integration-kv-row"><span class="integration-kv-key">${k}</span><span class="integration-kv-val">${txt === undefined || txt === null ? '' : String(txt)}</span></div>`;
                }).join('')}
            </div>`;
        return;
    }

    container.innerHTML = `<div class="muted-text text-center" style="padding:16px;">${String(value)}</div>`;
}

window.WidgetRegistry.register('integration_table', {
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

        try {
            const res = await WDS.fetchValue(config, widgetData.id);
            container.innerHTML = '';
            if (!res.ok) {
                container.innerHTML = `<div class="widget-error">${res.message || 'Fehler'}</div>`;
                return;
            }
            renderTableValue(container, res.value, config);
            window.refreshLucideIcons(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><span>${err.message}</span></div>`;
        }
    },

    renderConfig(fieldsContainer, widgetData, currentConfig) {
        const c = { data_source: 'integration', ...currentConfig };
        if (!c.data_source && c.integration_id) c.data_source = 'integration';
        if (!c.data_source && c.custom_url) c.data_source = 'custom';
        const extra = `
            <div class="form-section-divider">Darstellung</div>
            <div class="form-group">
                <label for="cfg-mode">Anzeige</label>
                <select class="form-control" id="cfg-mode">
                    <option value="table" ${(c.mode || 'table') === 'table' ? 'selected' : ''}>Tabelle</option>
                    <option value="list" ${c.mode === 'list' ? 'selected' : ''}>Liste</option>
                </select>
            </div>
            <div class="form-group"><label for="cfg-max_rows">Max. Zeilen</label>
            <input type="text" class="form-control" id="cfg-max_rows" value="${c.max_rows || '10'}"></div>
            <div class="form-group"><label for="cfg-columns">Spalten (optional)</label>
            <textarea class="form-control" id="cfg-columns" rows="3">${c.columns || ''}</textarea>
            <small class="muted-text">Komma oder Zeilenumbruch, z.B. title,status</small></div>`;
        window.WidgetDataSource.renderConfig(fieldsContainer, widgetData, c, extra, {
            pathPlaceholder: 'z.B. queue oder items',
        });
    },

    readConfig(fieldsContainer) {
        return window.WidgetDataSource.readConfig(
            fieldsContainer,
            ['mode', 'max_rows', 'columns'],
        );
    },
});
