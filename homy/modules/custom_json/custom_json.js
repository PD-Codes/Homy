// Custom JSON Module Frontend Renderer

// Helper to resolve nested object path e.g. "bpi.USD.rate_float"
function getNestedValue(obj, path) {
    if (!path) return obj;
    return path.split('.').reduce((acc, part) => {
        return (acc && acc[part] !== undefined) ? acc[part] : undefined;
    }, obj);
}

// Helper to recursively find all paths containing arrays in a JSON object
function findArrayPaths(obj, prefix = '', depth = 0) {
    if (depth > 5 || !obj) return [];
    let paths = [];
    if (Array.isArray(obj)) {
        paths.push(prefix);
    } else if (typeof obj === 'object') {
        for (const k in obj) {
            const p = prefix ? `${prefix}.${k}` : k;
            if (Array.isArray(obj[k])) {
                paths.push(p);
            } else if (typeof obj[k] === 'object' && obj[k] !== null) {
                paths = paths.concat(findArrayPaths(obj[k], p, depth + 1));
            }
        }
    }
    return paths;
}

// Helper to recursively find all keys in an object, including nested path dot notation
function getDeepKeys(obj, prefix = '', depth = 0) {
    if (depth > 5 || !obj) return [];
    let keys = [];
    if (Array.isArray(obj)) {
        if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
            keys = keys.concat(getDeepKeys(obj[0], prefix, depth + 1));
        }
    } else if (typeof obj === 'object') {
        for (const k in obj) {
            const p = prefix ? `${prefix}.${k}` : k;
            if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
                keys = keys.concat(getDeepKeys(obj[k], p, depth + 1));
            } else {
                keys.push(p);
            }
        }
    }
    return keys;
}

// Formatter: Localized Date/Time
function formatDateTime(val) {
    if (!val) return '-';
    try {
        const d = new Date(val);
        if (isNaN(d.getTime())) return String(val);
        return d.toLocaleString(window.i18n.currentLocale || 'de-DE', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    } catch (e) {
        return String(val);
    }
}

// Formatter: Status / Highlight Badges
function formatBadge(val) {
    if (val === undefined || val === null) return '-';
    const strVal = String(val).toLowerCase();
    let badgeClass = 'badge-neutral';
    if (strVal === '1' || strVal === 'true' || strVal === 'active' || strVal === 'ja' || strVal === 'yes') {
        badgeClass = 'badge-success';
    } else if (strVal === '0' || strVal === 'false' || strVal === 'inactive' || strVal === 'nein' || strVal === 'no') {
        badgeClass = 'badge-danger';
    }
    return `<span class="custom-json-badge ${badgeClass}">${val}</span>`;
}


// Formatter: Bytes → Human readable
function formatBytes(val) {
    const n = parseFloat(val);
    if (isNaN(n)) return String(val ?? '-');
    if (n >= 1024 ** 4) return `${(n / 1024 ** 4).toFixed(2)} TB`;
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${n} B`;
}

// Formatter: Speed (bytes/sec)
function formatSpeed(val) {
    const n = parseFloat(val);
    if (isNaN(n)) return String(val ?? '-');
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB/s`;
    if (n >= 1024) return `${(n / 1024).toFixed(0)} KB/s`;
    return `${n} B/s`;
}

// Formatter: Progress bar
function formatProgress(val) {
    const pct = Math.min(100, Math.max(0, parseFloat(val) || 0));
    const color = pct >= 90 ? 'var(--danger)' : pct >= 70 ? '#f59e0b' : 'var(--success)';
    return `<div class="cj-progress-wrap"><div class="cj-progress-bar" style="width:${pct}%;background:${color}"></div><span class="cj-progress-label">${pct.toFixed(0)}%</span></div>`;
}

// Formatter: Duration (seconds → HH:MM:SS)
function formatDuration(val) {
    const s = parseInt(val, 10);
    if (isNaN(s)) return String(val ?? '-');
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
}

// Formatter: Relative time ("vor 3 Stunden")
function formatRelativeTime(val) {
    if (!val) return '-';
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const diff = Math.round((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'gerade eben';
    if (diff < 3600) return `vor ${Math.floor(diff / 60)} Min.`;
    if (diff < 86400) return `vor ${Math.floor(diff / 3600)} Std.`;
    if (diff < 604800) return `vor ${Math.floor(diff / 86400)} Tagen`;
    return d.toLocaleDateString(window.i18n?.currentLocale || 'de-DE');
}

// Formatter: URL as clickable link
function formatUrl(val) {
    if (!val) return '-';
    const s = String(val);
    if (s.startsWith('http://') || s.startsWith('https://')) {
        return `<a href="${s}" target="_blank" rel="noopener" class="cj-link">${s.replace(/^https?:\/\//, '').slice(0,40)}…</a>`;
    }
    return s;
}


// 1. Register Diagram Widget
window.WidgetRegistry.register('json_graph', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        
        try {
            const data = await API.request(`/api/custom_json/fetch?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            
            if (!data.configured) {
                container.innerHTML = `<div class="text-center muted-text" style="padding: 20px;"><p>${data.message}</p></div>`;
                return;
            }
            if (!data.online) {
                container.innerHTML = `<div class="text-center text-danger" style="padding: 20px;"><p>${data.message}</p></div>`;
                return;
            }
            
            const rawVal = getNestedValue(data.payload, config.data_path);
            if (rawVal === undefined) {
                container.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>Pfad "${config.data_path}" nicht im JSON gefunden.</span></div>`;
                window.refreshLucideIcons(container);
                return;
            }

            // Build canvas
            const canvas = document.createElement('canvas');
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            container.appendChild(canvas);
            
            let chartLabels = [];
            let chartData = [];
            
            if (Array.isArray(rawVal)) {
                // Resolved value is already an array of values
                chartData = rawVal.map(item => typeof item === 'object' ? (item.value || 0) : item);
                chartLabels = rawVal.map((_, idx) => `Point ${idx + 1}`);
            } else {
                // Resolved value is a single number. We create a historical log in LocalStorage!
                const numVal = parseFloat(String(rawVal).replace(/,/g, ''));
                if (isNaN(numVal)) {
                    container.innerHTML = `<div class="widget-error"><span>Geladener Wert ist keine Zahl: ${rawVal}</span></div>`;
                    return;
                }
                
                // Fetch history from local storage
                const storageKey = `history_json_graph_${widgetData.id}`;
                let history = [];
                try {
                    history = JSON.parse(localStorage.getItem(storageKey) || '[]');
                } catch (e) {
                    history = [];
                }
                
                // Add new point if empty or changed
                const nowStr = new Date().toLocaleTimeString(window.i18n.currentLocale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                if (history.length === 0 || history[history.length - 1].value !== numVal) {
                    history.push({ time: nowStr, value: numVal });
                    if (history.length > 20) history.shift(); // Limit to 20 points
                    localStorage.setItem(storageKey, JSON.stringify(history));
                }
                
                chartLabels = history.map(h => h.time);
                chartData = history.map(h => h.value);
            }
            
            const ChartLib = await window.loadChartJs();
            const chartType = config.chart_type || 'line';
            const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#6366f1';

            new ChartLib(canvas.getContext('2d'), {
                type: chartType,
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: widgetData.title || 'Data',
                        data: chartData,
                        borderColor: primaryColor,
                        backgroundColor: chartType === 'line' ? 'rgba(99, 102, 241, 0.1)' : primaryColor,
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
                        }
                    }
                }
            });
            
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-circle"></i><span>${err.message}</span></div>`;
            window.refreshLucideIcons(container);
        }
    }
});


// 2. Register Custom HTML/CSS Data Widget (Enhanced with interactive schema selector + tables + lists)
window.WidgetRegistry.register('json_custom', {
    // Custom Config UI Renderer
    renderConfig(fieldsContainer, widgetData, currentConfig) {
        fieldsContainer.innerHTML = `
            <div class="form-group">
                <label for="cfg-endpoint_url">API Endpunkt URL</label>
                <div style="display: flex; gap: 8px;">
                    <input type="text" id="cfg-endpoint_url" class="form-control" style="flex: 1;" placeholder="https://api.example.com/data">
                    <button type="button" id="btn-load-structure" class="btn btn-secondary" style="padding: 6px 12px; height: 38px;">Laden</button>
                </div>
            </div>
            <div id="json-config-dynamic-section"></div>
            <div class="form-group" style="margin-top: 16px;">
                <label for="cfg-table_font_size">Tabellen-Schriftgröße</label>
                <select id="cfg-table_font_size" class="form-control">
                    <option value="Klein">Klein</option>
                    <option value="Normal">Normal</option>
                    <option value="Groß">Groß</option>
                </select>
            </div>
            <div class="form-group" style="margin-top: 16px;">
                <label for="cfg-custom_css">Eigenes CSS (Scoped)</label>
                <textarea id="cfg-custom_css" class="form-control" rows="3" style="font-family: monospace; font-size: 0.8rem;" placeholder=".custom-json-table { ... }"></textarea>
            </div>
        `;
        
        const urlInput = fieldsContainer.querySelector('#cfg-endpoint_url');
        const cssTextarea = fieldsContainer.querySelector('#cfg-custom_css');
        const btnLoad = fieldsContainer.querySelector('#btn-load-structure');
        const dynamicSection = fieldsContainer.querySelector('#json-config-dynamic-section');
        
        urlInput.value = currentConfig.endpoint_url || '';
        cssTextarea.value = currentConfig.custom_css || '';
        const tableSizeSel = fieldsContainer.querySelector('#cfg-table_font_size');
        if (tableSizeSel) tableSizeSel.value = currentConfig.table_font_size || 'Normal';
        
        // Render pre-saved layout selector if configured
        if (currentConfig.endpoint_url) {
            drawConfiguratorFromSaved(dynamicSection, currentConfig);
        }
        
        // Handle loading API JSON schema
        const loadStructure = async (isAuto = false) => {
            const url = urlInput.value.trim();
            if (!url) return;
            
            btnLoad.disabled = true;
            btnLoad.textContent = "Lädt...";
            if (!isAuto) {
                dynamicSection.innerHTML = '<div style="text-align: center; margin: 20px;"><div class="spinner"></div><div style="font-size: 0.8rem; margin-top: 8px; color: var(--text-secondary)">JSON Struktur wird abgerufen...</div></div>';
            }
            
            try {
                const res = await API.request(`/api/custom_json/fetch?url=${encodeURIComponent(url)}`);
                if (res.online && res.payload) {
                    drawConfigurator(dynamicSection, res.payload, currentConfig);
                } else {
                    if (!isAuto) {
                        dynamicSection.innerHTML = `<div class="alert alert-danger">${res.message || "Fehler beim Laden der API-Struktur."}</div>`;
                    }
                }
            } catch (err) {
                if (!isAuto) {
                    dynamicSection.innerHTML = `<div class="alert alert-danger">Fehler: ${err.message}</div>`;
                }
            } finally {
                btnLoad.disabled = false;
                btnLoad.textContent = "Laden";
            }
        };

        btnLoad.onclick = () => loadStructure(false);
        
        if (currentConfig.endpoint_url) {
            loadStructure(true);
        }
    },

    // Custom Config Reader to gather settings from inputs
    readConfig(fieldsContainer) {
        const urlInput = fieldsContainer.querySelector('#cfg-endpoint_url');
        const pathSelect = fieldsContainer.querySelector('#cfg-data_path');
        const cssTextarea = fieldsContainer.querySelector('#cfg-custom_css');
        const arrayModeSelect = fieldsContainer.querySelector('#cfg-array_mode');
        const listTemplateInput = fieldsContainer.querySelector('#cfg-list_template');
        const tableSizeSel = fieldsContainer.querySelector('#cfg-table_font_size');
        
        const columns = [];
        const rows = fieldsContainer.querySelectorAll('.json-field-row');
        rows.forEach(row => {
            const chk = row.querySelector('.field-enabled');
            if (chk && chk.checked) {
                const key = row.getAttribute('data-key');
                const labelInput = row.querySelector('.field-label-input');
                const formatSelect = row.querySelector('.field-format-select');
                
                columns.push({
                    key: key,
                    label: labelInput.value.trim() || key.split('.').pop(),
                    format: formatSelect ? formatSelect.value : 'text'
                });
            }
        });
        
        return {
            endpoint_url: urlInput ? urlInput.value.trim() : '',
            data_path: pathSelect ? pathSelect.value : '',
            array_mode: arrayModeSelect ? arrayModeSelect.value : 'table',
            list_template: listTemplateInput ? listTemplateInput.value.trim() : '',
            table_font_size: tableSizeSel ? tableSizeSel.value : 'Normal',
            columns: columns,
            custom_css: cssTextarea ? cssTextarea.value : ''
        };
    },

    // Main Renderer for the Custom JSON widget
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        
        try {
            const data = await API.request(`/api/custom_json/fetch?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            
            if (!data.configured) {
                container.innerHTML = `<div class="text-center muted-text" style="padding: 20px;"><p>${data.message}</p></div>`;
                return;
            }
            if (!data.online) {
                container.innerHTML = `<div class="text-center text-danger" style="padding: 20px;"><p>${data.message}</p></div>`;
                return;
            }
            
            // Scope custom CSS specifically to this widget card ID
            const style = document.createElement('style');
            const scopedSelector = `.widget[data-id="${widgetData.id}"]`;
            let rawCss = config.custom_css || '';
            let prefixedCss = '';
            
            if (rawCss.trim()) {
                prefixedCss = rawCss.split('}').map(rule => {
                    const parts = rule.split('{');
                    if (parts.length === 2 && parts[0].trim()) {
                        const selectors = parts[0].split(',').map(s => `${scopedSelector} ${s.trim()}`).join(', ');
                        return `${selectors} { ${parts[1]} }`;
                    }
                    return rule;
                }).join('\n');
            }
            style.innerHTML = prefixedCss;
            container.appendChild(style);
            
            const resolvedVal = getNestedValue(data.payload, config.data_path);
            if (resolvedVal === undefined || resolvedVal === null) {
                container.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>Pfad "${config.data_path || '[Root]'}" nicht im JSON gefunden.</span></div>`;
                lucide.createIcons({ attrs: { class: 'lucide' } });
                return;
            }
            
            const columns = config.columns || [];
            
            if (Array.isArray(resolvedVal)) {
                if (config.array_mode === 'list') {
                    // Custom Template List rendering mode
                    const listWrapper = document.createElement('div');
                    listWrapper.className = 'custom-json-list-wrapper';
                    
                    const template = config.list_template || '{first_seen:date}: {code}';
                    
                    resolvedVal.forEach(item => {
                        const listItem = document.createElement('div');
                        listItem.className = 'custom-json-list-item';
                        
                        const formattedLine = template.replace(/\{([^{}]+)\}/g, (match, placeholder) => {
                            const parts = placeholder.split(':');
                            const key = parts[0].trim();
                            const format = parts[1] ? parts[1].trim() : 'smart';
                            
                            const val = getNestedValue(item, key);
                            if (val === undefined || val === null) return '';
                            
                            if (format === 'date') {
                                const d = new Date(val);
                                if (isNaN(d.getTime())) return String(val);
                                const day = String(d.getDate()).padStart(2, '0');
                                const month = String(d.getMonth() + 1).padStart(2, '0');
                                const year = d.getFullYear();
                                return `${day}.${month}.${year}`;
                            }
                            if (format === 'datetime') {
                                const d = new Date(val);
                                if (isNaN(d.getTime())) return String(val);
                                const day = String(d.getDate()).padStart(2, '0');
                                const month = String(d.getMonth() + 1).padStart(2, '0');
                                const year = d.getFullYear();
                                const hours = String(d.getHours()).padStart(2, '0');
                                const minutes = String(d.getMinutes()).padStart(2, '0');
                                return `${day}.${month}.${year} ${hours}:${minutes}`;
                            }
                            if (format === 'time') {
                                const d = new Date(val);
                                if (isNaN(d.getTime())) return String(val);
                                const hours = String(d.getHours()).padStart(2, '0');
                                const minutes = String(d.getMinutes()).padStart(2, '0');
                                return `${hours}:${minutes}`;
                            }
                            if (format === 'badge') {
                                return formatBadge(val);
                            }
                            return String(val);
                        });
                        
                        listItem.innerHTML = formattedLine;
                        listWrapper.appendChild(listItem);
                    });
                    
                    container.appendChild(listWrapper);
                } else {
                    // Table Rendering Mode
                    const tableWrapper = document.createElement('div');
                    const sizeClass = {
                        Klein: 'custom-json-table-sm',
                        Groß: 'custom-json-table-lg',
                    }[config.table_font_size] || '';
                    tableWrapper.className = `custom-json-table-wrapper ${sizeClass}`.trim();
                    
                    const table = document.createElement('table');
                    table.className = 'custom-json-table';
                    
                    // Render Table Header
                    const thead = document.createElement('thead');
                    const headerRow = document.createElement('tr');
                    
                    // Use configured columns or fall back to first array element keys
                    const displayCols = columns.length > 0 ? columns : getDeepKeys(resolvedVal[0] || {}).map(k => ({
                        key: k,
                        label: k.split('.').pop(),
                        format: 'text'
                    }));
                    
                    displayCols.forEach(col => {
                        const th = document.createElement('th');
                        th.textContent = col.label;
                        headerRow.appendChild(th);
                    });
                    thead.appendChild(headerRow);
                    table.appendChild(thead);
                    
                    // Render Table Body
                    const tbody = document.createElement('tbody');
                    resolvedVal.forEach((item, index) => {
                        const row = document.createElement('tr');
                        
                        const detailRowId = `details-${widgetData.id}-${index}`;
                        let hasDetailCol = false;
                        let detailPayload = null;
                        
                        displayCols.forEach(col => {
                            const td = document.createElement('td');
                            const val = getNestedValue(item, col.key);
                            
                            if (col.format === 'datetime') {
                                td.textContent = formatDateTime(val);
                            } else if (col.format === 'relative_time') {
                                td.textContent = formatRelativeTime(val);
                            } else if (col.format === 'badge') {
                                td.innerHTML = formatBadge(val);
                            } else if (col.format === 'progress') {
                                td.innerHTML = formatProgress(val);
                            } else if (col.format === 'bytes') {
                                td.textContent = formatBytes(val);
                            } else if (col.format === 'speed') {
                                td.textContent = formatSpeed(val);
                            } else if (col.format === 'duration') {
                                td.textContent = formatDuration(val);
                            } else if (col.format === 'url') {
                                td.innerHTML = formatUrl(val);
                            } else if (col.format === 'json') {
                                hasDetailCol = true;
                                detailPayload = val;
                                td.innerHTML = `
                                    <button type="button" class="btn-toggle-json" data-target="${detailRowId}">
                                        <i data-lucide="braces" style="width: 12px; height: 12px; vertical-align: middle;"></i> Details
                                    </button>
                                `;
                            } else {
                                if (typeof val === 'object' && val !== null) {
                                    td.textContent = JSON.stringify(val);
                                } else {
                                    td.textContent = val !== undefined ? val : '-';
                                }
                            }
                            row.appendChild(td);
                        });
                        
                        tbody.appendChild(row);
                        
                        // Render collapsible row below the data row for JSON-Detail column type
                        if (hasDetailCol) {
                            const detailRow = document.createElement('tr');
                            detailRow.id = detailRowId;
                            detailRow.className = 'json-details-row';
                            detailRow.style.display = 'none';
                            
                            const detailTd = document.createElement('td');
                            detailTd.colSpan = displayCols.length;
                            detailTd.innerHTML = `
                                <div class="json-pre-wrapper">
                                    <pre class="json-pre"><code>${JSON.stringify(detailPayload, null, 2)}</code></pre>
                                </div>
                            `;
                            detailRow.appendChild(detailTd);
                            tbody.appendChild(detailRow);
                            
                            const btnToggle = row.querySelector(`[data-target="${detailRowId}"]`);
                            if (btnToggle) {
                                btnToggle.onclick = (e) => {
                                    e.stopPropagation();
                                    const isCollapsed = detailRow.style.display === 'none';
                                    detailRow.style.display = isCollapsed ? 'table-row' : 'none';
                                    btnToggle.classList.toggle('active', isCollapsed);
                                };
                            }
                        }
                    });
                    
                    table.appendChild(tbody);
                    tableWrapper.appendChild(table);
                    container.appendChild(tableWrapper);
                }
            } else {
                // Key-Value List Rendering Mode (for flat JSON objects)
                const wrapper = document.createElement('div');
                wrapper.className = 'custom-json-wrapper';
                
                const displayCols = columns.length > 0 ? columns : getDeepKeys(resolvedVal).map(k => ({
                    key: k,
                    label: k.split('.').pop(),
                    format: 'text'
                }));
                
                displayCols.forEach(col => {
                    const val = getNestedValue(resolvedVal, col.key);
                    const item = document.createElement('div');
                    item.className = 'custom-json-item';
                    
                    let valHtml = '';
                    if (col.format === 'datetime') {
                        valHtml = formatDateTime(val);
                    } else if (col.format === 'relative_time') {
                        valHtml = formatRelativeTime(val);
                    } else if (col.format === 'badge') {
                        valHtml = formatBadge(val);
                    } else if (col.format === 'progress') {
                        valHtml = formatProgress(val);
                    } else if (col.format === 'bytes') {
                        valHtml = formatBytes(val);
                    } else if (col.format === 'speed') {
                        valHtml = formatSpeed(val);
                    } else if (col.format === 'duration') {
                        valHtml = formatDuration(val);
                    } else if (col.format === 'url') {
                        valHtml = formatUrl(val);
                    } else if (col.format === 'json') {
                        const detailRowId = `details-${widgetData.id}-${col.key.replace(/\./g, '-')}`;
                        valHtml = `
                            <button type="button" class="btn-toggle-json" data-target="${detailRowId}">
                                <i data-lucide="braces" style="width: 12px; height: 12px; vertical-align: middle;"></i> JSON
                            </button>
                            <div id="${detailRowId}" class="json-details-block" style="display: none; margin-top: 8px; text-align: left;">
                                <pre class="json-pre"><code>${JSON.stringify(val, null, 2)}</code></pre>
                            </div>
                        `;
                        item.style.flexDirection = 'column';
                        item.style.alignItems = 'stretch';
                    } else {
                        if (typeof val === 'object' && val !== null) {
                            valHtml = JSON.stringify(val);
                        } else {
                            valHtml = val !== undefined ? val : '-';
                        }
                    }
                    
                    item.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span class="custom-json-label">${col.label}</span>
                            <span class="custom-json-value">${col.format !== 'json' ? valHtml : ''}</span>
                        </div>
                    `;
                    
                    if (col.format === 'json') {
                        const btnAndDiv = document.createElement('div');
                        btnAndDiv.innerHTML = valHtml;
                        item.appendChild(btnAndDiv);
                        
                        const btnToggle = item.querySelector(`[data-target="${detailRowId}"]`);
                        const detailsBlock = item.querySelector(`#${detailRowId}`);
                        if (btnToggle && detailsBlock) {
                            btnToggle.onclick = (e) => {
                                e.stopPropagation();
                                const isCollapsed = detailsBlock.style.display === 'none';
                                detailsBlock.style.display = isCollapsed ? 'block' : 'none';
                                btnToggle.classList.toggle('active', isCollapsed);
                            };
                        }
                    }
                    wrapper.appendChild(item);
                });
                container.appendChild(wrapper);
            }
            
            lucide.createIcons({ attrs: { class: 'lucide' } });
            
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-circle"></i><span>${err.message}</span></div>`;
            lucide.createIcons({ attrs: { class: 'lucide' } });
        }
    }
});

// Draws the configurator from pre-saved columns on initial load
function drawConfiguratorFromSaved(container, savedConfig) {
    container.innerHTML = `
        <div class="form-group" style="margin-top: 16px;">
            <label for="cfg-data_path">Daten-Pfad (Array / Liste)</label>
            <select id="cfg-data_path" class="form-control">
                <option value="${savedConfig.data_path || ''}">${savedConfig.data_path ? savedConfig.data_path : '[Root]'}</option>
            </select>
        </div>
        <div id="json-array-options" style="display: none;">
            <div class="form-group">
                <label for="cfg-array_mode">Anzeige-Modus (Array)</label>
                <select id="cfg-array_mode" class="form-control">
                    <option value="table">Tabelle (Grid/Spalten)</option>
                    <option value="list">Liste (Benutzerdefiniertes Template)</option>
                </select>
            </div>
            <div id="json-list-template-group" class="form-group" style="display: none;">
                <label for="cfg-list_template">Listen-Template (z.B. {first_seen:date}: {code})</label>
                <input type="text" id="cfg-list_template" class="form-control" placeholder="{first_seen:date}: {code}">
            </div>
        </div>
        <div id="json-fields-list-container"></div>
    `;
    
    const arrayOptions = container.querySelector('#json-array-options');
    const arrayModeSelect = container.querySelector('#cfg-array_mode');
    const listTemplateGroup = container.querySelector('#json-list-template-group');
    const listTemplateInput = container.querySelector('#cfg-list_template');
    const fieldsContainer = container.querySelector('#json-fields-list-container');
    
    // Set values
    arrayModeSelect.value = savedConfig.array_mode || 'table';
    listTemplateInput.value = savedConfig.list_template || '';
    
    // Toggle options based on saved state
    if (savedConfig.data_path || savedConfig.array_mode) {
        arrayOptions.style.display = 'block';
        if (arrayModeSelect.value === 'list') {
            listTemplateGroup.style.display = 'block';
            fieldsContainer.style.display = 'none';
        } else {
            listTemplateGroup.style.display = 'none';
            fieldsContainer.style.display = 'block';
        }
    }
    
    arrayModeSelect.onchange = () => {
        if (arrayModeSelect.value === 'list') {
            listTemplateGroup.style.display = 'block';
            fieldsContainer.style.display = 'none';
        } else {
            listTemplateGroup.style.display = 'none';
            fieldsContainer.style.display = 'block';
        }
    };
    
    const cols = savedConfig.columns || [];
    const fields = cols.map(col => ({
        key: col.key,
        enabled: true,
        label: col.label,
        format: col.format || 'text'
    }));
    
    renderFieldRows(fieldsContainer, fields);
}

// Draws the complete configurator based on payload loaded from API url
function drawConfigurator(container, payload, savedConfig) {
    const arrayPaths = findArrayPaths(payload);
    let currentPath = savedConfig.data_path || '';
    
    container.innerHTML = `
        <div class="form-group" style="margin-top: 16px;">
            <label for="cfg-data_path">Daten-Pfad (Array / Liste)</label>
            <select id="cfg-data_path" class="form-control">
                <option value="">[Root Object] (Key-Value Liste)</option>
            </select>
        </div>
        <div id="json-array-options" style="display: none;">
            <div class="form-group">
                <label for="cfg-array_mode">Anzeige-Modus (Array)</label>
                <select id="cfg-array_mode" class="form-control">
                    <option value="table">Tabelle (Grid/Spalten)</option>
                    <option value="list">Liste (Benutzerdefiniertes Template)</option>
                </select>
            </div>
            <div id="json-list-template-group" class="form-group" style="display: none;">
                <label for="cfg-list_template">Listen-Template</label>
                <input type="text" id="cfg-list_template" class="form-control" placeholder="{first_seen:date}: {code}">
                <div style="margin-top: 8px; font-size: 0.75rem; color: var(--text-muted);">
                    Klicke zum Einfügen: <span id="json-template-chips" style="display: inline-flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;"></span>
                </div>
            </div>
        </div>
        <div id="json-fields-list-container"></div>
    `;
    
    const pathSelect = container.querySelector('#cfg-data_path');
    const arrayOptions = container.querySelector('#json-array-options');
    const arrayModeSelect = container.querySelector('#cfg-array_mode');
    const listTemplateGroup = container.querySelector('#json-list-template-group');
    const listTemplateInput = container.querySelector('#cfg-list_template');
    const chipsContainer = container.querySelector('#json-template-chips');
    const fieldsContainer = container.querySelector('#json-fields-list-container');
    
    // Set values
    arrayModeSelect.value = savedConfig.array_mode || 'table';
    listTemplateInput.value = savedConfig.list_template || '';
    
    // Add Root Array option if root itself is array
    if (Array.isArray(payload)) {
        const opt = document.createElement('option');
        opt.value = "";
        opt.textContent = `[Root Array] (${payload.length} Elemente)`;
        opt.selected = true;
        pathSelect.appendChild(opt);
    }
    
    // Add detected arrays options
    arrayPaths.forEach(p => {
        const val = getNestedValue(payload, p);
        const len = Array.isArray(val) ? val.length : 0;
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = `${p} (Array mit ${len} Elementen)`;
        if (p === currentPath) opt.selected = true;
        pathSelect.appendChild(opt);
    });
    
    // Helper to insert token at cursor in template text input
    function insertAtCursor(myField, myValue) {
        if (myField.selectionStart || myField.selectionStart === '0') {
            const startPos = myField.selectionStart;
            const endPos = myField.selectionEnd;
            myField.value = myField.value.substring(0, startPos)
                + myValue
                + myField.value.substring(endPos, myField.value.length);
            myField.selectionStart = startPos + myValue.length;
            myField.selectionEnd = startPos + myValue.length;
        } else {
            myField.value += myValue;
        }
        myField.focus();
    }
    
    // Renders the checkboxes and inputs based on selected path
    function updateFieldsList() {
        const selectedPath = pathSelect.value;
        const resolvedVal = getNestedValue(payload, selectedPath);
        
        let targetObj = resolvedVal;
        let isArray = Array.isArray(resolvedVal);
        
        if (isArray) {
            arrayOptions.style.display = 'block';
            targetObj = resolvedVal[0] || {};
            
            // Toggle templates
            if (arrayModeSelect.value === 'list') {
                listTemplateGroup.style.display = 'block';
                fieldsContainer.style.display = 'none';
            } else {
                listTemplateGroup.style.display = 'none';
                fieldsContainer.style.display = 'block';
            }
            
            // Render chips
            const keys = getDeepKeys(targetObj);
            chipsContainer.innerHTML = '';
            keys.forEach(k => {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'btn btn-outline';
                chip.style.padding = '2px 6px';
                chip.style.fontSize = '0.7rem';
                chip.style.height = 'auto';
                chip.style.marginTop = '4px';
                chip.textContent = `{${k}}`;
                chip.onclick = () => {
                    const kl = k.toLowerCase();
                    let fmt = '';
                    if (/date|seen|time|_at|created|updated|modified|timestamp/.test(kl)) fmt = ':date';
                    else if (/bytes|size|usage|space/.test(kl)) fmt = ':bytes';
                    else if (/speed|rate|throughput/.test(kl)) fmt = ':speed';
                    else if (/percent|ratio|progress|pct/.test(kl)) fmt = ':badge';
                    insertAtCursor(listTemplateInput, `{${k}${fmt}}`);
                };
                chipsContainer.appendChild(chip);
            });
        } else {
            arrayOptions.style.display = 'none';
            listTemplateGroup.style.display = 'none';
            fieldsContainer.style.display = 'block';
        }
        
        const allKeys = getDeepKeys(targetObj);
        const savedCols = savedConfig.columns || [];
        const orderedFields = [];
        
        // Add saved columns in order first
        savedCols.forEach(col => {
            if (allKeys.includes(col.key)) {
                orderedFields.push({
                    key: col.key,
                    enabled: true,
                    label: col.label,
                    format: col.format || 'text'
                });
            }
        });
        
        // Append all remaining keys with smart format detection
        allKeys.forEach(k => {
            if (!orderedFields.some(of => of.key === k)) {
                const kl = k.toLowerCase();
                let autoFmt = 'text';
                if (/date|_at|created|updated|modified|timestamp|seen|time(?!out)/.test(kl)) autoFmt = 'datetime';
                else if (/bytes|size(?!_x|_y)|storage|space/.test(kl)) autoFmt = 'bytes';
                else if (/speed|rate|throughput/.test(kl)) autoFmt = 'speed';
                else if (/percent|ratio|progress/.test(kl)) autoFmt = 'progress';
                else if (/status|state|enabled|active|online|health/.test(kl)) autoFmt = 'badge';
                else if (/duration|elapsed|runtime/.test(kl)) autoFmt = 'duration';
                else if (/url|link|href|uri/.test(kl)) autoFmt = 'url';
                orderedFields.push({
                    key: k,
                    enabled: false,
                    label: '',
                    format: autoFmt
                });
            }
        });
        
        renderFieldRows(fieldsContainer, orderedFields);
    }
    
    pathSelect.onchange = updateFieldsList;
    arrayModeSelect.onchange = updateFieldsList;
    updateFieldsList();
}

// Renders the list of key rows, formatting selectors, display labels and sort buttons
function renderFieldRows(container, fields) {
    container.innerHTML = `
        <div style="margin-top: 12px; font-weight: 500; font-size: 0.85rem; margin-bottom: 8px; color: var(--text-secondary);">Spalten / Felder auswählen:</div>
        <div class="json-fields-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 250px; overflow-y: auto; padding: 4px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: rgba(0,0,0,0.15);">
        </div>
    `;
    const listEl = container.querySelector('.json-fields-list');
    
    if (fields.length === 0) {
        listEl.innerHTML = '<div class="muted-text text-center" style="padding: 12px; font-size: 0.8rem;">Keine Felder gefunden.</div>';
        return;
    }
    
    fields.forEach(f => {
        const row = document.createElement('div');
        row.className = 'json-field-row';
        row.setAttribute('data-key', f.key);
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.padding = '6px 8px';
        row.style.background = 'rgba(255, 255, 255, 0.01)';
        row.style.border = '1px solid var(--border-color)';
        row.style.borderRadius = 'var(--radius-sm)';
        row.style.fontSize = '0.8rem';
        
        // Checkbox
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.className = 'field-enabled';
        chk.checked = f.enabled;
        
        // Key label
        const keyLbl = document.createElement('span');
        keyLbl.className = 'field-key-name';
        keyLbl.textContent = f.key;
        keyLbl.style.fontWeight = '500';
        keyLbl.style.flex = '1';
        keyLbl.style.overflow = 'hidden';
        keyLbl.style.textOverflow = 'ellipsis';
        keyLbl.style.whiteSpace = 'nowrap';
        keyLbl.title = f.key;
        keyLbl.style.color = 'var(--text-primary)';
        
        // Display Label Input
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.className = 'field-label-input form-control';
        labelInput.placeholder = f.key.split('.').pop();
        labelInput.value = f.label || '';
        labelInput.style.width = '140px';
        labelInput.style.padding = '2px 6px';
        labelInput.style.height = '26px';
        labelInput.style.fontSize = '0.75rem';
        labelInput.style.margin = '0';
        
        // Format Dropdown
        const formatSelect = document.createElement('select');
        formatSelect.className = 'field-format-select form-control';
        formatSelect.style.width = '120px';
        formatSelect.style.padding = '2px 6px';
        formatSelect.style.height = '26px';
        formatSelect.style.fontSize = '0.75rem';
        formatSelect.style.margin = '0';
        [
            { val: 'text', text: 'Text' },
            { val: 'datetime', text: 'Datum/Zeit' },
            { val: 'relative_time', text: '⏱ Relative Zeit' },
            { val: 'badge', text: '● Badge/Status' },
            { val: 'progress', text: '▓ Fortschrittsbalken' },
            { val: 'bytes', text: '💾 Bytes (KB/MB/GB)' },
            { val: 'speed', text: '⚡ Speed (KB/MB/s)' },
            { val: 'duration', text: '⏰ Dauer (H:MM:SS)' },
            { val: 'url', text: '🔗 Link/URL' },
            { val: 'json', text: '{ } JSON-Detail' }
        ].forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.val;
            o.textContent = opt.text;
            if (opt.val === f.format) o.selected = true;
            formatSelect.appendChild(o);
        });
        
        // Up/Down Sort buttons
        const btnUp = document.createElement('button');
        btnUp.type = 'button';
        btnUp.className = 'icon-btn';
        btnUp.innerHTML = '<i data-lucide="chevron-up" style="width: 14px; height: 14px;"></i>';
        btnUp.style.padding = '2px';
        btnUp.style.width = '24px';
        btnUp.style.height = '24px';
        btnUp.onclick = () => {
            const prev = row.previousElementSibling;
            if (prev) {
                row.parentNode.insertBefore(row, prev);
            }
        };
        
        const btnDown = document.createElement('button');
        btnDown.type = 'button';
        btnDown.className = 'icon-btn';
        btnDown.innerHTML = '<i data-lucide="chevron-down" style="width: 14px; height: 14px;"></i>';
        btnDown.style.padding = '2px';
        btnDown.style.width = '24px';
        btnDown.style.height = '24px';
        btnDown.onclick = () => {
            const next = row.nextElementSibling;
            if (next) {
                row.parentNode.insertBefore(next, row);
            }
        };
        
        row.appendChild(chk);
        row.appendChild(keyLbl);
        row.appendChild(labelInput);
        row.appendChild(formatSelect);
        row.appendChild(btnUp);
        row.appendChild(btnDown);
        
        listEl.appendChild(row);
    });
    lucide.createIcons({ attrs: { class: 'lucide' } });
}

String.prototype.strip = function() {
    return this.replace(/^\s+|\s+$/g, '');
};
