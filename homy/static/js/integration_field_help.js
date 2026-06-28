/** Render help text, lookup UI, and optional links below integration config fields. */
window.IntegrationFieldHelp = {
    append(group, typeId, key, field, formBody) {
        if (field.lookup) {
            this._appendLookup(group, typeId, key, field, formBody);
        }

        const helpText = window.i18n?.integrationFieldHelp(typeId, key, field.help);
        const links = Array.isArray(field.help_links) ? field.help_links : [];
        if (!helpText && !links.length) return;

        const wrap = document.createElement('div');
        wrap.className = 'integration-field-help muted-text';
        wrap.dataset.helpFor = key;

        if (helpText) {
            const p = document.createElement('p');
            p.className = 'integration-field-help-text';
            p.style.fontSize = '0.75rem';
            p.style.margin = '6px 0 0';
            p.textContent = helpText;
            wrap.appendChild(p);
        }

        if (links.length) {
            const linksEl = document.createElement('div');
            linksEl.className = 'integration-field-help-links';
            linksEl.style.fontSize = '0.75rem';
            linksEl.style.marginTop = '4px';
            linksEl.style.display = 'flex';
            linksEl.style.flexWrap = 'wrap';
            linksEl.style.gap = '8px 12px';

            const renderLinks = () => {
                linksEl.innerHTML = '';
                const sourceEl = formBody?.querySelector('#int-field-warnings_source');
                const source = sourceEl ? sourceEl.value : null;
                links.forEach((link) => {
                    if (link.when_source && source && link.when_source !== source) return;
                    if (link.when_source && !source) return;
                    const a = document.createElement('a');
                    a.href = link.url;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.textContent = window.i18n?.integrationFieldHelpLink(
                        typeId,
                        key,
                        link.id || link.label,
                        link.label,
                    ) || link.label;
                    linksEl.appendChild(a);
                });
            };

            renderLinks();
            const sourceEl = formBody?.querySelector('#int-field-warnings_source');
            if (sourceEl) {
                sourceEl.addEventListener('change', renderLinks);
            }
            wrap.appendChild(linksEl);
        }

        group.appendChild(wrap);
    },

    _appendLookup(group, typeId, key, field, formBody) {
        const wrap = document.createElement('div');
        wrap.className = 'integration-region-lookup';
        wrap.style.marginTop = '8px';

        const searchLabel = window.i18n?.translate('integration_region_lookup_label')
            || 'Gemeinde suchen (Stadt + Warnungs-Code)';
        const searchBtn = window.i18n?.translate('integration_region_lookup_search')
            || 'Suchen';
        const placeholder = window.i18n?.translate('integration_region_lookup_placeholder')
            || 'z. B. Maitenbeth';

        wrap.innerHTML = `
            <label class="muted-text" style="font-size:0.75rem;display:block;margin-bottom:4px;">${searchLabel}</label>
            <div style="display:flex;gap:8px;align-items:stretch;">
                <input type="text" class="form-control integration-lookup-query" placeholder="${placeholder}" autocomplete="off">
                <button type="button" class="btn btn-outline integration-lookup-btn" style="white-space:nowrap;">${searchBtn}</button>
            </div>
            <div class="integration-lookup-results muted-text" style="margin-top:8px;"></div>
        `;

        const queryInput = wrap.querySelector('.integration-lookup-query');
        const searchButton = wrap.querySelector('.integration-lookup-btn');
        const resultsEl = wrap.querySelector('.integration-lookup-results');

        const codeInput = formBody?.querySelector(`#int-field-${key}`);
        const cityInput = formBody?.querySelector('#int-field-city');

        const applyResult = (row) => {
            const sourceEl = formBody?.querySelector('#int-field-warnings_source');
            const source = sourceEl?.value || 'NINA';
            let code = row.nina_ars || '';
            if (source === 'DWD') {
                code = row.dwd_warncell || code;
            }
            if (codeInput) {
                codeInput.value = code;
                codeInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (cityInput && row.municipality && !cityInput.value.trim()) {
                const cityVal = row.postal_code
                    ? `${row.municipality},DE`
                    : row.municipality;
                cityInput.value = cityVal;
            }
            resultsEl.innerHTML = '';
            showToast(
                window.i18n?.translate('integration_region_lookup_applied')
                    || `Code übernommen: ${code}`,
                'success',
            );
        };

        const renderResults = (rows) => {
            resultsEl.innerHTML = '';
            if (!rows.length) {
                resultsEl.textContent = window.i18n?.translate('integration_region_lookup_empty')
                    || 'Keine Treffer.';
                return;
            }
            const list = document.createElement('div');
            list.className = 'integration-lookup-result-list';
            rows.forEach((row) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'integration-lookup-result-item';
                const nina = row.nina_ars || '—';
                const dwd = row.dwd_warncell || '—';
                const cityLine = row.municipality ? `${row.municipality},DE` : '';
                btn.innerHTML = `
                    <strong>${row.label}</strong>
                    <span class="muted-text" style="display:block;font-size:0.72rem;margin-top:2px;">
                        OpenWeather: <code>${cityLine || '—'}</code>
                    </span>
                    <span class="muted-text" style="display:block;font-size:0.72rem;margin-top:2px;">
                        NINA (Kreis): <code>${nina}</code>
                        · DWD: <code>${dwd}</code>
                    </span>
                `;
                btn.addEventListener('click', () => applyResult(row));
                list.appendChild(btn);
            });
            resultsEl.appendChild(list);
        };

        const runSearch = async () => {
            const q = queryInput.value.trim();
            if (q.length < 2) {
                showToast(
                    window.i18n?.translate('integration_region_lookup_min_chars')
                        || 'Mindestens 2 Zeichen eingeben.',
                    'error',
                );
                return;
            }
            searchButton.disabled = true;
            resultsEl.textContent = window.i18n?.translate('integration_region_lookup_loading')
                || 'Suche…';
            try {
                const data = await API.request(
                    `/api/weather/region-lookup?q=${encodeURIComponent(q)}`,
                );
                if (!data.ok) {
                    throw new Error(data.message || 'Lookup fehlgeschlagen');
                }
                renderResults(data.results || []);
            } catch (err) {
                resultsEl.textContent = err.message || String(err);
                showToast(err.message, 'error');
            } finally {
                searchButton.disabled = false;
            }
        };

        searchButton.addEventListener('click', runSearch);
        queryInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                runSearch();
            }
        });

        group.appendChild(wrap);
    },
};
