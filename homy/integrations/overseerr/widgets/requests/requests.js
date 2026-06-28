window.WidgetRegistry.register('overseerr_requests', {
    STATUS_FILTERS: [
        { id: 1, label: 'Ausstehend' },
        { id: 2, label: 'Genehmigt' },
        { id: 3, label: 'Abgelehnt' },
        { id: 4, label: 'Fehlgeschlagen' },
        { id: 5, label: 'Abgeschlossen' },
    ],

    renderConfig(fieldsContainer, widgetData, currentConfig) {
        const cfg = currentConfig || {};
        const hidden = new Set(
            String(cfg.hidden_request_statuses || '')
                .split(',')
                .map((s) => s.trim())
                .filter((s) => /^\d+$/.test(s))
                .map((s) => parseInt(s, 10)),
        );

        const maxGroup = document.createElement('div');
        maxGroup.className = 'form-group';
        maxGroup.innerHTML = '<label for="cfg-max_items">Max. Anfragen in Liste</label>';
        const maxSel = document.createElement('select');
        maxSel.className = 'form-control';
        maxSel.id = 'cfg-max_items';
        ['5', '8', '12', '15'].forEach((n) => {
            const opt = document.createElement('option');
            opt.value = n;
            opt.textContent = n;
            if (n === String(cfg.max_items || '8')) opt.selected = true;
            maxSel.appendChild(opt);
        });
        maxGroup.appendChild(maxSel);
        fieldsContainer.appendChild(maxGroup);

        const filterGroup = document.createElement('div');
        filterGroup.className = 'form-group';
        const filterTitle = document.createElement('label');
        filterTitle.textContent = 'Anfragen ausblenden (Status)';
        filterGroup.appendChild(filterTitle);
        const hint = document.createElement('small');
        hint.className = 'muted-text';
        hint.style.display = 'block';
        hint.style.marginBottom = '8px';
        hint.textContent = 'Ausgeblendete Status erscheinen nicht in der Liste (Zähler oben bleiben gesamt).';
        filterGroup.appendChild(hint);

        const list = document.createElement('div');
        list.className = 'osr-status-filters';
        this.STATUS_FILTERS.forEach((st) => {
            const row = document.createElement('label');
            row.className = 'checkbox-label-container';
            row.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;margin-bottom:6px;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'cfg-osr-hide-status';
            cb.value = String(st.id);
            cb.checked = hidden.has(st.id);
            row.appendChild(cb);
            const span = document.createElement('span');
            span.textContent = st.label;
            row.appendChild(span);
            list.appendChild(row);
        });
        filterGroup.appendChild(list);
        fieldsContainer.appendChild(filterGroup);
    },

    readConfig(fieldsContainer) {
        const maxSel = fieldsContainer.querySelector('#cfg-max_items');
        const hidden = [];
        fieldsContainer.querySelectorAll('.cfg-osr-hide-status:checked').forEach((cb) => {
            hidden.push(cb.value);
        });
        const cfg = {
            max_items: maxSel ? maxSel.value : '8',
            hidden_request_statuses: hidden.join(','),
        };
        const intInput = document.getElementById('cfg-integration_id');
        if (intInput && intInput.value) {
            cfg.integration_id = intInput.value;
        }
        return cfg;
    },

    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/overseerr_requests/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${this._esc(data.message || 'Nicht verfügbar')}</div>`;
                return;
            }

            const card = document.createElement('div');
            card.className = 'overseerr-requests';

            const metrics = document.createElement('div');
            metrics.className = 'osr-metrics';
            metrics.innerHTML = `
                <div class="osr-metric"><span class="label">Ausstehend</span><span class="val">${data.pending || 0}</span></div>
                <div class="osr-metric"><span class="label">Genehmigt</span><span class="val">${data.approved || 0}</span></div>
                <div class="osr-metric"><span class="label">In Arbeit</span><span class="val">${data.processing || 0}</span></div>
                <div class="osr-metric"><span class="label">Verfügbar</span><span class="val">${data.available || 0}</span></div>
            `;
            card.appendChild(metrics);

            const list = document.createElement('div');
            list.className = 'osr-list';
            const items = data.requests || [];

            if (!items.length) {
                const emptyMsg = data.filtered
                    ? 'Keine Anfragen für den gewählten Filter.'
                    : 'Keine aktuellen Anfragen';
                list.innerHTML = `<div class="osr-empty">${emptyMsg}</div>`;
            } else {
                items.forEach((item) => list.appendChild(this._renderRow(item)));
            }

            card.appendChild(list);
            container.appendChild(card);
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${this._esc(err.message)}</div>`;
        }
    },

    _renderRow(item) {
        const row = document.createElement('div');
        row.className = `osr-row osr-status-${item.status || 0}`;

        if (item.poster_path) {
            const poster = document.createElement('img');
            poster.className = 'osr-poster';
            poster.src = `https://image.tmdb.org/t/p/w92${item.poster_path}`;
            poster.alt = '';
            poster.loading = 'lazy';
            row.appendChild(poster);
        }

        const body = document.createElement('div');
        body.className = 'osr-row-body';

        const titleLine = document.createElement('div');
        titleLine.className = 'osr-title';
        const titleText = item.year ? `${item.title} (${item.year})` : (item.title || 'Unbekannt');
        titleLine.textContent = titleText;
        if (item.is_4k) {
            const badge4k = document.createElement('span');
            badge4k.className = 'osr-badge-4k';
            badge4k.textContent = '4K';
            titleLine.appendChild(document.createTextNode(' '));
            titleLine.appendChild(badge4k);
        }
        body.appendChild(titleLine);

        const meta = document.createElement('div');
        meta.className = 'osr-meta';
        const parts = [];
        if (item.status_label) parts.push(item.status_label);
        if (item.type_label) parts.push(item.type_label);
        if (item.seasons) parts.push(item.seasons);
        if (item.media_status_label && item.media_status_label !== item.status_label) {
            parts.push(item.media_status_label);
        }
        meta.textContent = parts.join(' · ');
        body.appendChild(meta);

        const sub = document.createElement('div');
        sub.className = 'osr-sub';
        const subParts = [];
        if (item.requested_by) subParts.push(`von ${item.requested_by}`);
        const when = this._formatWhen(item.created_at);
        if (when) subParts.push(when);
        sub.textContent = subParts.join(' · ');
        body.appendChild(sub);

        row.appendChild(body);
        return row;
    },

    _formatWhen(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'gerade eben';
        if (diffMin < 60) return `vor ${diffMin} Min.`;
        const diffH = Math.floor(diffMin / 60);
        if (diffH < 24) return `vor ${diffH} Std.`;
        const diffD = Math.floor(diffH / 24);
        if (diffD < 7) return `vor ${diffD} Tag${diffD === 1 ? '' : 'en'}`;
        return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    },

    _esc(value) {
        const el = document.createElement('div');
        el.textContent = value == null ? '' : String(value);
        return el.innerHTML;
    },
});
