window.WidgetRegistry.register('metric_display', {
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

        const chartType = config.chart_type || 'stat';
        const label = config.label || widgetData.title || 'Metrik';
        const unit = config.unit || '';
        const maxVal = parseFloat(config.max_value || '100') || 100;

        try {
            const data = await WDS.fetchValue(config, widgetData.id);
            container.innerHTML = '';
            if (!data.ok) {
                container.innerHTML = `<div class="widget-error">${data.message || 'Fehler'}</div>`;
                return;
            }
            const value = data.value;
            const historyKey = `metric_hist_${widgetData.id}_${config.data_path || 'raw'}`;

            if (chartType === 'gauge') {
                ChartWidgets.renderGauge(container, { label, value, max: maxVal, unit });
            } else if (chartType === 'line' || chartType === 'area') {
                await ChartWidgets.renderLine(container, { label, value, historyKey });
            } else {
                ChartWidgets.renderStat(container, { label, value, unit });
            }
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },

    renderConfig(fieldsContainer, widgetData, currentConfig) {
        const c = { data_source: 'integration', ...currentConfig };
        if (!c.data_source && c.integration_id) c.data_source = 'integration';
        if (!c.data_source && c.custom_url) c.data_source = 'custom';
        const extra = `
            <div class="form-section-divider">Darstellung</div>
            <div class="form-group">
                <label for="cfg-chart_type">Grafiktyp</label>
                <select class="form-control" id="cfg-chart_type">
                    ${['stat', 'gauge', 'line', 'area'].map((t) =>
                        `<option value="${t}" ${(c.chart_type || 'stat') === t ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label for="cfg-label">Beschriftung</label>
            <input type="text" class="form-control" id="cfg-label" value="${c.label || ''}"></div>
            <div class="form-group"><label for="cfg-unit">Einheit</label>
            <input type="text" class="form-control" id="cfg-unit" value="${c.unit || ''}"></div>
            <div class="form-group"><label for="cfg-max_value">Max für Gauge</label>
            <input type="text" class="form-control" id="cfg-max_value" value="${c.max_value || '100'}"></div>`;
        window.WidgetDataSource.renderConfig(fieldsContainer, widgetData, c, extra);
    },

    readConfig(fieldsContainer) {
        return window.WidgetDataSource.readConfig(
            fieldsContainer,
            ['chart_type', 'label', 'unit', 'max_value'],
        );
    },
});
