/** Shared helpers for integration-backed widgets (endpoint picker, path hints). */
window.IntegrationWidgetHelpers = {
    getTypeDef(types, integration) {
        if (!integration || !Array.isArray(types)) return null;
        return types.find(t => t.id === integration.type) || null;
    },

    relativeEndpointPath(path) {
        const raw = String(path || '').trim();
        if (!raw) return '';
        return raw.replace(/^\/api\/v1/i, '').replace(/^\/api/i, '') || '/';
    },

    endpointOptions(tdef) {
        const endpoints = Array.isArray(tdef?.widget_endpoints) ? tdef.widget_endpoints : [];
        return endpoints.map(ep => {
            const rel = this.relativeEndpointPath(ep.path || '');
            const authTag = ep.auth === 'api_key' ? ' (API-Key)' : '';
            return {
                value: ep.key,
                label: `${ep.label}${rel ? ` · ${rel}` : ''}${authTag}`,
                path: ep.path || '',
            };
        });
    },

    buildEndpointSelectHtml(tdef, selectedValue, defaultValue) {
        const options = this.endpointOptions(tdef);
        if (!options.length) return '';

        const v1 = options.filter(o => String(o.path).startsWith('/api/v1'));
        const legacy = options.filter(o => !String(o.path).startsWith('/api/v1'));
        const renderOption = (o) => {
            const sel = String(selectedValue || defaultValue || '') === String(o.value) ? ' selected' : '';
            return `<option value="${o.value}"${sel}>${o.label}</option>`;
        };

        let html = '';
        if (v1.length) {
            html += `<optgroup label="/api/v1">${v1.map(renderOption).join('')}</optgroup>`;
        }
        if (legacy.length) {
            html += `<optgroup label="/api">${legacy.map(renderOption).join('')}</optgroup>`;
        }
        if (!html) {
            html = options.map(renderOption).join('');
        }
        return html;
    },

    appendEndpointField(fieldsContainer, {
        integrations,
        types,
        integrationId,
        overrideKey = 'endpoint',
        overrideValue = '',
        label = 'Endpoint',
        inputId = 'cfg-endpoint',
    }) {
        const integration = integrations.find(i => String(i.id) === String(integrationId));
        const tdef = this.getTypeDef(types, integration);
        const options = this.endpointOptions(tdef);
        if (!options.length) return null;

        const group = document.createElement('div');
        group.className = 'form-group';
        group.id = 'cfg-endpoint-group';

        const lbl = document.createElement('label');
        lbl.textContent = label;
        lbl.setAttribute('for', inputId);

        const select = document.createElement('select');
        select.className = 'form-control';
        select.id = inputId;
        select.innerHTML = this.buildEndpointSelectHtml(
            tdef,
            overrideValue,
            tdef?.default_widget_endpoint
        );

        group.appendChild(lbl);
        group.appendChild(select);
        fieldsContainer.appendChild(group);
        return select;
    },

    syncEndpointField(fieldsContainer, {
        integrations,
        types,
        integrationId,
        overrideKey = 'endpoint',
        overrideValue = '',
    }) {
        const existing = fieldsContainer.querySelector('#cfg-endpoint-group');
        const integration = integrations.find(i => String(i.id) === String(integrationId));
        const tdef = this.getTypeDef(types, integration);
        const hasEndpoints = !!(tdef?.widget_endpoints?.length);

        if (!hasEndpoints) {
            if (existing) existing.remove();
            return null;
        }

        if (existing) {
            const select = existing.querySelector('#cfg-endpoint');
            if (select) {
                select.innerHTML = this.buildEndpointSelectHtml(
                    tdef,
                    overrideValue || select.value,
                    tdef.default_widget_endpoint
                );
            }
            return select || null;
        }

        return this.appendEndpointField(fieldsContainer, {
            integrations,
            types,
            integrationId,
            overrideKey,
            overrideValue,
        });
    },

    readEndpointOverride(inputId = 'cfg-endpoint') {
        const el = document.getElementById(inputId);
        if (!el || !el.value) {
            return { override_key: '', override_value: '' };
        }
        return { override_key: 'endpoint', override_value: el.value };
    },
};
