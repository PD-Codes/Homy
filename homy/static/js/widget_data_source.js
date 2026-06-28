/**
 * Shared Custom vs Integration data source for display modules.
 */
window.WidgetDataSource = {
    getNestedValue(obj, path) {
        if (!path) return obj;
        return String(path).split('.').reduce((acc, part) => {
            if (acc === undefined || acc === null) return undefined;
            if (Array.isArray(acc) && /^\d+$/.test(part)) {
                return acc[parseInt(part, 10)];
            }
            if (typeof acc === 'object') return acc[part];
            return undefined;
        }, obj);
    },

    mode(config) {
        return (config?.data_source || 'integration') === 'custom' ? 'custom' : 'integration';
    },

    resolvePath(config, pathKey = 'data_path') {
        return (config[pathKey] || config.data_path || config.events_path || '').trim();
    },

    async fetchValue(config, widgetId = null, options = {}) {
        const pathKey = options.pathKey || 'data_path';
        const mode = this.mode(config);
        if (mode === 'integration') {
            const integrationId = config.integration_id;
            if (!integrationId) {
                return { ok: false, message: window.i18n.translate('widget_ds_link_integration') };
            }
            const params = new URLSearchParams();
            const path = this.resolvePath(config, pathKey);
            if (path) params.set('path', path);
            const ok = (config.override_key || '').trim();
            const ov = (config.override_value || '').trim();
            if (ok && ov) params.set(`override_${ok}`, ov);
            const q = params.toString() ? `?${params.toString()}` : '';
            const res = await API.request(`/api/integrations/${integrationId}/fetch${q}`);
            if (!res.ok) {
                return { ok: false, message: res.message || 'Integrations-Abruf fehlgeschlagen' };
            }
            return { ok: true, value: res.value, raw: res.payload };
        }

        const url = (config.custom_url || '').trim();
        if (!url) {
            return { ok: false, message: window.i18n.translate('widget_ds_custom_url') };
        }
        const qs = new URLSearchParams({ url });
        if (widgetId) qs.set('widget_id', widgetId);
        const res = await API.request(`/api/custom_json/fetch?${qs.toString()}`);
        if (!res.online && res.message) {
            return { ok: false, message: res.message };
        }
        const payload = res.payload !== undefined ? res.payload : res;
        const path = this.resolvePath(config, pathKey);
        const value = path ? this.getNestedValue(payload, path) : payload;
        return { ok: true, value, raw: payload };
    },

    isConfigured(config, pathKey = 'data_path') {
        if (this.mode(config) === 'custom') {
            return Boolean((config.custom_url || '').trim());
        }
        return Boolean(config.integration_id);
    },

    appendModeTabs(container, currentConfig, onModeChange) {
        const mode = this.mode(currentConfig);
        const wrap = document.createElement('div');
        wrap.className = 'form-group wds-mode-tabs-wrap';
        wrap.innerHTML = `
            <label data-i18n="wds_data_source">Datenquelle</label>
            <div class="iw-mode-tabs wds-mode-tabs">
                <button type="button" class="iw-mode-btn ${mode === 'integration' ? 'active' : ''}" data-wds-mode="integration" data-i18n="wds_mode_integration">Integration</button>
                <button type="button" class="iw-mode-btn ${mode === 'custom' ? 'active' : ''}" data-wds-mode="custom" data-i18n="wds_mode_custom">Custom (URL)</button>
            </div>
        `;
        container.appendChild(wrap);
        const panels = document.createElement('div');
        panels.className = 'wds-panels';
        panels.innerHTML = `
            <div class="wds-panel wds-panel-integration ${mode === 'integration' ? '' : 'hidden'}"></div>
            <div class="wds-panel wds-panel-custom ${mode === 'custom' ? '' : 'hidden'}"></div>
        `;
        container.appendChild(panels);

        const setMode = (m) => {
            wrap.querySelectorAll('[data-wds-mode]').forEach((btn) => {
                btn.classList.toggle('active', btn.dataset.wdsMode === m);
            });
            panels.querySelector('.wds-panel-integration')?.classList.toggle('hidden', m !== 'integration');
            panels.querySelector('.wds-panel-custom')?.classList.toggle('hidden', m !== 'custom');
            if (typeof onModeChange === 'function') onModeChange(m);
        };
        wrap.querySelectorAll('[data-wds-mode]').forEach((btn) => {
            btn.addEventListener('click', () => setMode(btn.dataset.wdsMode));
        });
        if (window.i18n?.translateDOM) window.i18n.translateDOM(wrap);
        return {
            integrationPanel: panels.querySelector('.wds-panel-integration'),
            customPanel: panels.querySelector('.wds-panel-custom'),
            getMode: () => (wrap.querySelector('[data-wds-mode].active')?.dataset.wdsMode || 'integration'),
        };
    },

    renderIntegrationPanel(panel, currentConfig, options = {}) {
        if (!panel) return;
        const pathKey = options.pathKey || 'data_path';
        const pathLabel = options.pathLabel || 'Datenpfad';
        const pathPlaceholder = options.pathPlaceholder || 'z.B. queue_count';
        const pathValue = currentConfig[pathKey] || currentConfig.data_path || currentConfig.events_path || '';
        panel.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        Promise.all([
            API.request('/api/integrations'),
            API.request('/api/integrations/types'),
        ]).then(([integrations, types]) => {
            panel.innerHTML = '';
            panel.dataset.wdsPathKey = pathKey;
            const intGroup = document.createElement('div');
            intGroup.className = 'form-group';
            intGroup.innerHTML = '<label for="cfg-integration_id">Integration</label>';
            const sel = document.createElement('select');
            sel.className = 'form-control';
            sel.id = 'cfg-integration_id';
            const empty = document.createElement('option');
            empty.value = '';
            empty.textContent = window.i18n.translate('widget_data_source_pick');
            sel.appendChild(empty);
            integrations.forEach((i) => {
                const opt = document.createElement('option');
                opt.value = String(i.id);
                opt.textContent = `${i.name} (${i.type_name || i.type})`;
                if (String(currentConfig.integration_id) === String(i.id)) opt.selected = true;
                sel.appendChild(opt);
            });
            intGroup.appendChild(sel);
            panel.appendChild(intGroup);

            const pathGroup = document.createElement('div');
            pathGroup.className = 'form-group';
            pathGroup.innerHTML = `
                <label for="cfg-data_path_int">${pathLabel}</label>
                <input type="text" class="form-control" id="cfg-data_path_int" value="${pathValue}" placeholder="${pathPlaceholder}">
            `;
            panel.appendChild(pathGroup);

            const hint = document.createElement('div');
            hint.id = 'wds-metrics-hint';
            hint.className = 'muted-text';
            hint.style.fontSize = '0.75rem';
            panel.appendChild(hint);

            if (window.IntegrationWidgetHelpers) {
                IntegrationWidgetHelpers.appendEndpointField(panel, {
                    integrations,
                    types,
                    integrationId: currentConfig.integration_id,
                    overrideValue: currentConfig.override_key === 'endpoint'
                        ? (currentConfig.override_value || '') : '',
                });
            }

            const loadHint = () => {
                const integ = integrations.find((i) => String(i.id) === String(sel.value));
                if (!integ) { hint.textContent = ''; return; }
                const tdef = types.find((t) => t.id === integ.type);
                if (tdef?.metrics?.length) {
                    hint.innerHTML = 'Pfade: ' + tdef.metrics.map((m) => `<code>${m.path}</code>`).join(', ');
                } else hint.textContent = '';
                if (window.IntegrationWidgetHelpers) {
                    IntegrationWidgetHelpers.syncEndpointField(panel, {
                        integrations, types, integrationId: sel.value,
                    });
                }
            };
            sel.addEventListener('change', loadHint);
            loadHint();
        }).catch(() => {
            panel.innerHTML = '<div class="widget-error">Integrationen konnten nicht geladen werden.</div>';
        });
    },

    renderCustomPanel(panel, currentConfig, options = {}) {
        if (!panel) return;
        const pathKey = options.pathKey || 'data_path';
        const pathValue = currentConfig[pathKey] || currentConfig.data_path || currentConfig.events_path || '';
        const pathLabel = options.pathLabel || 'Datenpfad (optional)';
        panel.innerHTML = `
            <div class="form-group">
                <label for="cfg-custom_url">API-URL (JSON)</label>
                <input type="url" class="form-control" id="cfg-custom_url" value="${currentConfig.custom_url || ''}" placeholder="https://example.com/api/data">
            </div>
            <div class="form-group">
                <label for="cfg-data_path_custom">${pathLabel}</label>
                <input type="text" class="form-control" id="cfg-data_path_custom" value="${pathValue}" placeholder="z.B. data.items">
                <small class="muted-text">Leer = gesamte JSON-Antwort</small>
            </div>
        `;
        panel.dataset.wdsPathKey = pathKey;
    },

    renderConfig(fieldsContainer, widgetData, currentConfig, extraFieldsHtml = '', options = {}) {
        fieldsContainer.innerHTML = '';
        const tabs = this.appendModeTabs(fieldsContainer, currentConfig);
        this.renderIntegrationPanel(tabs.integrationPanel, currentConfig, options);
        this.renderCustomPanel(tabs.customPanel, currentConfig, options);
        fieldsContainer._wdsPathKey = options.pathKey || 'data_path';
        if (extraFieldsHtml) {
            const extra = document.createElement('div');
            extra.className = 'wds-extra-fields';
            extra.innerHTML = extraFieldsHtml;
            fieldsContainer.appendChild(extra);
        }
        fieldsContainer._wdsGetMode = () => tabs.getMode();
    },

    readConfig(fieldsContainer, baseKeys = [], options = {}) {
        const pathKey = options.pathKey || fieldsContainer._wdsPathKey || 'data_path';
        const mode = fieldsContainer._wdsGetMode
            ? fieldsContainer._wdsGetMode()
            : (fieldsContainer.querySelector('[data-wds-mode].active')?.dataset.wdsMode || 'integration');
        const cfg = { data_source: mode };
        if (mode === 'integration') {
            const integ = document.getElementById('cfg-integration_id');
            const path = document.getElementById('cfg-data_path_int');
            if (integ) cfg.integration_id = integ.value;
            if (path) cfg[pathKey] = path.value;
            cfg.custom_url = '';
            if (window.IntegrationWidgetHelpers) {
                Object.assign(cfg, IntegrationWidgetHelpers.readEndpointOverride());
            }
        } else {
            const url = document.getElementById('cfg-custom_url');
            const path = document.getElementById('cfg-data_path_custom');
            if (url) cfg.custom_url = url.value;
            if (path) cfg[pathKey] = path.value;
            cfg.integration_id = '';
        }
        baseKeys.forEach((k) => {
            const el = document.getElementById(`cfg-${k}`);
            if (el) cfg[k] = el.value;
        });
        return cfg;
    },

    notConfiguredHtml() {
        return '<div class="muted-text text-center" style="padding:16px;">Datenquelle in den Einstellungen wählen:<br><small>Integration oder Custom-URL</small></div>';
    },
};
