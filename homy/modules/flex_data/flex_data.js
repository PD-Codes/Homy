/* Flex Data widgets — Custom URL or Integration */

function flexExtraFields(type, cfg) {
    const c = cfg || {};
    if (type === 'flex_stat') {
        return `
            <div class="form-section-divider">Darstellung</div>
            <div class="form-group"><label for="cfg-label">Beschriftung</label>
            <input type="text" class="form-control" id="cfg-label" value="${c.label || ''}"></div>
            <div class="form-group"><label for="cfg-unit">Einheit</label>
            <input type="text" class="form-control" id="cfg-unit" value="${c.unit || ''}"></div>`;
    }
    if (type === 'flex_gauge') {
        return `
            <div class="form-section-divider">Darstellung</div>
            <div class="form-group"><label for="cfg-label">Beschriftung</label>
            <input type="text" class="form-control" id="cfg-label" value="${c.label || ''}"></div>
            <div class="form-group"><label for="cfg-unit">Einheit</label>
            <input type="text" class="form-control" id="cfg-unit" value="${c.unit || '%'}"></div>
            <div class="form-group"><label for="cfg-max_value">Maximum</label>
            <input type="text" class="form-control" id="cfg-max_value" value="${c.max_value || '100'}"></div>`;
    }
    if (type === 'flex_list') {
        return `
            <div class="form-section-divider">Darstellung</div>
            <div class="form-group"><label for="cfg-mode">Modus</label>
            <select class="form-control" id="cfg-mode">
                <option value="list" ${c.mode === 'list' ? 'selected' : ''}>Liste</option>
                <option value="table" ${c.mode === 'table' ? 'selected' : ''}>Tabelle</option>
            </select></div>
            <div class="form-group"><label for="cfg-max_rows">Max. Zeilen</label>
            <select class="form-control" id="cfg-max_rows">
                ${['5', '10', '15'].map(n => `<option value="${n}" ${String(c.max_rows) === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select></div>
            <div class="form-group"><label for="cfg-columns">Spalten (Tabelle)</label>
            <input type="text" class="form-control" id="cfg-columns" value="${c.columns || ''}" placeholder="title, status"></div>`;
    }
    if (type === 'flex_chart') {
        return `
            <div class="form-section-divider">Darstellung</div>
            <div class="form-group"><label for="cfg-label">Beschriftung</label>
            <input type="text" class="form-control" id="cfg-label" value="${c.label || ''}"></div>
            <div class="form-group"><label for="cfg-chart_style">Stil</label>
            <select class="form-control" id="cfg-chart_style">
                <option value="line" ${c.chart_style !== 'area' ? 'selected' : ''}>Linie</option>
                <option value="area" ${c.chart_style === 'area' ? 'selected' : ''}>Fläche</option>
            </select></div>`;
    }
    if (type === 'flex_banner') {
        return `
            <div class="form-section-divider">Darstellung</div>
            <div class="form-group"><label for="cfg-static_text">Statischer Text (nur Custom ohne Pfad)</label>
            <textarea class="form-control" id="cfg-static_text" rows="3">${c.static_text || ''}</textarea></div>
            <div class="form-group"><label for="cfg-severity">Stil</label>
            <select class="form-control" id="cfg-severity">
                ${['info', 'success', 'warning', 'danger'].map(s =>
                    `<option value="${s}" ${(c.severity || 'info') === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select></div>`;
    }
    return '';
}

function flexReadKeys(type) {
    if (type === 'flex_stat') return ['label', 'unit'];
    if (type === 'flex_gauge') return ['label', 'unit', 'max_value'];
    if (type === 'flex_list') return ['mode', 'max_rows', 'columns'];
    if (type === 'flex_chart') return ['label', 'chart_style'];
    if (type === 'flex_banner') return ['static_text', 'severity'];
    return [];
}

function renderFlexList(container, value, config) {
    const maxRows = parseInt(config.max_rows || '10', 10) || 10;
    const mode = config.mode || 'list';
    if (value === undefined || value === null) {
        container.innerHTML = '<div class="muted-text text-center">Keine Daten</div>';
        return;
    }
    if (mode === 'list' || !Array.isArray(value)) {
        const items = Array.isArray(value) ? value.slice(0, maxRows) : [value];
        container.innerHTML = `<div class="flex-list-wrap">${items.map((it) => {
            const line = typeof it === 'object' && it !== null
                ? JSON.stringify(it).slice(0, 200)
                : String(it);
            return `<div class="flex-list-item">${line}</div>`;
        }).join('')}</div>`;
        return;
    }
    const items = value.slice(0, maxRows);
    const first = items.find((x) => x && typeof x === 'object');
    if (!first) {
        container.innerHTML = '<div class="muted-text">Keine tabellarischen Daten</div>';
        return;
    }
    const cols = (config.columns || '').split(',').map((s) => s.trim()).filter(Boolean);
    const columns = cols.length ? cols : Object.keys(first).slice(0, 6);
    container.innerHTML = `
        <div class="flex-table-wrap">
            <table class="flex-table">
                <thead><tr>${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
                <tbody>${items.map((row) =>
                    `<tr>${columns.map((c) => `<td>${row?.[c] ?? ''}</td>`).join('')}</tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

function registerFlexWidget(type, renderFn) {
    window.WidgetRegistry.register(type, {
        async render(container, widgetData, config) {
            container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
            const WDS = window.WidgetDataSource;
            if (!WDS) {
                container.innerHTML = '<div class="widget-error">WidgetDataSource nicht geladen</div>';
                return;
            }
            if (WDS.mode(config) === 'custom' && !(config.custom_url || '').trim()
                && type === 'flex_banner' && (config.static_text || '').trim()) {
                container.innerHTML = '';
                const sev = config.severity || 'info';
                container.innerHTML = `<div class="flex-banner severity-${sev}">${config.static_text}</div>`;
                return;
            }
            if (WDS.mode(config) === 'integration' && !config.integration_id
                && !(type === 'flex_banner' && config.static_text)) {
                container.innerHTML = WDS.notConfiguredHtml();
                return;
            }
            if (WDS.mode(config) === 'custom' && !(config.custom_url || '').trim()
                && !(type === 'flex_banner' && config.static_text)) {
                container.innerHTML = WDS.notConfiguredHtml();
                return;
            }
            try {
                const res = await WDS.fetchValue(config, widgetData.id);
                container.innerHTML = '';
                if (!res.ok) {
                    container.innerHTML = `<div class="widget-error">${res.message}</div>`;
                    return;
                }
                renderFn(container, res.value, config, widgetData);
            } catch (err) {
                container.innerHTML = `<div class="widget-error">${err.message}</div>`;
            }
        },
        renderConfig(fieldsContainer, widgetData, currentConfig) {
            window.WidgetDataSource.renderConfig(
                fieldsContainer,
                widgetData,
                currentConfig,
                flexExtraFields(type, currentConfig),
            );
        },
        readConfig(fieldsContainer) {
            return window.WidgetDataSource.readConfig(fieldsContainer, flexReadKeys(type));
        },
    });
}

registerFlexWidget('flex_stat', (container, value, config, widgetData) => {
    const label = config.label || widgetData.title || 'Wert';
    const unit = config.unit || '';
    const display = value !== undefined && value !== null
        ? (typeof value === 'object' ? JSON.stringify(value) : String(value))
        : '—';
    container.innerHTML = `
        <div class="flex-stat-inner">
            <div class="flex-stat-value">${display}${unit && typeof value !== 'object' ? `<span style="font-size:0.5em;margin-left:4px;">${unit}</span>` : ''}</div>
            <div class="flex-stat-label">${label}</div>
        </div>`;
});

registerFlexWidget('flex_gauge', (container, value, config) => {
    const label = config.label || 'Wert';
    const max = parseFloat(config.max_value || '100') || 100;
    const num = parseFloat(value);
    if (window.ChartWidgets) {
        ChartWidgets.renderGauge(container, {
            label,
            value: Number.isFinite(num) ? num : 0,
            max,
            unit: config.unit || '',
        });
    } else {
        container.textContent = `${value}`;
    }
});

registerFlexWidget('flex_list', (container, value, config) => {
    renderFlexList(container, value, config);
});

registerFlexWidget('flex_chart', (container, value, config, widgetData) => {
    const label = config.label || widgetData.title || 'Verlauf';
    const num = parseFloat(value);
    const current = Number.isFinite(num) ? num : 0;
    const historyKey = `flex_chart_${widgetData.id}`;
    if (window.ChartWidgets) {
        ChartWidgets.renderLine(container, { label, value: current, historyKey });
    } else {
        container.textContent = String(value);
    }
});

registerFlexWidget('flex_banner', (container, value, config) => {
    const sev = config.severity || 'info';
    let text = '';
    if (value !== undefined && value !== null) {
        text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    } else if (config.static_text) {
        text = config.static_text;
    }
    container.innerHTML = `<div class="flex-banner severity-${sev}">${text || '—'}</div>`;
});
