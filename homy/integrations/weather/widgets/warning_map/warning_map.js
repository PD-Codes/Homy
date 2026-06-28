window.WidgetRegistry.register('weather_warning_map', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/weather_warning_map/data?widget_id=${widgetData.id}`);

            if (!data.configured) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Nicht konfiguriert'}</div>`;
                return;
            }

            if ((data.view || 'interactive') === 'image') {
                this.renderImage(container, data);
            } else {
                await this.renderInteractive(container, data.location, data.bundesland);
            }
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },

    // ---- Classic static DWD PNG ----
    renderImage(container, data) {
        container.innerHTML = '';
        const resolvedRegion = data.image_region || 'de';
        const cacheBuster = Math.floor(Date.now() / 600000);
        const imageUrl = `https://www.dwd.de/DWD/warnungen/warnapp_gemeinden/json/warnungen_gemeinde_map_${resolvedRegion}.png?t=${cacheBuster}`;

        const card = document.createElement('div');
        card.className = 'warning-map-card';
        const img = document.createElement('img');
        img.className = 'warning-map-img';
        img.alt = 'DWD Wetter-Warnkarte';
        img.src = imageUrl;
        img.onerror = () => {
            container.innerHTML = `<div class="widget-error"><i data-lucide="image-off"></i><span>Warnkarte nicht verfügbar</span></div>`;
            window.refreshLucideIcons(container);
        };
        card.appendChild(img);
        container.appendChild(card);
    },

    // ---- Interactive vector map ----
    async renderInteractive(container, location, bundesland) {
        const reg = bundesland ? `&region=${encodeURIComponent(bundesland)}` : '';
        const [states, warnings] = await Promise.all([
            API.request(`/api/weather_warning_map/geojson?layer=states${reg}`).catch(() => null),
            API.request(`/api/weather_warning_map/geojson?layer=warnings${reg}`).catch(() => null),
        ]);

        if (!warnings && !states) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="cloud-off"></i><span>DWD nicht erreichbar</span></div>`;
            window.refreshLucideIcons(container);
            return;
        }

        const stateFeats = (states && states.features) || [];
        const warnFeats = (warnings && warnings.features) || [];

        // Projection bounds: prefer the state outline bbox, else fixed Germany bounds.
        const bounds = this.computeBounds(stateFeats.length ? stateFeats : warnFeats)
            || { minLon: 5.8, maxLon: 15.05, minLat: 47.2, maxLat: 55.1 };

        const W = 1000;
        const midLat = (bounds.minLat + bounds.maxLat) / 2;
        const lonSpan = (bounds.maxLon - bounds.minLon) * Math.cos(midLat * Math.PI / 180);
        const latSpan = bounds.maxLat - bounds.minLat;
        const H = Math.max(1, Math.round(W * (latSpan / lonSpan)));
        const project = (lon, lat) => {
            const x = (lon - bounds.minLon) / (bounds.maxLon - bounds.minLon) * W;
            const y = (bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat) * H;
            return [x.toFixed(1), y.toFixed(1)];
        };

        // Paint stronger warnings on top.
        const rank = { minor: 1, moderate: 2, severe: 3, extreme: 4 };
        const sortedWarns = warnFeats.slice().sort(
            (a, b) => (rank[(a.properties?.SEVERITY || '').toLowerCase()] || 0)
                - (rank[(b.properties?.SEVERITY || '').toLowerCase()] || 0)
        );

        const statePaths = stateFeats
            .map(f => `<path class="wm-state" d="${this.geomToPath(f.geometry, project)}"></path>`)
            .join('');

        this._warnData = sortedWarns.map(f => f.properties || {});

        // Group warnings by area (Landkreis) so hover can show a name + count,
        // and a click can list every warning for that area.
        this._areaName = this._warnData.map(p => p.AREADESC || p.NAME || 'Unbekanntes Gebiet');
        this._areaToIdx = {};
        this._areaName.forEach((name, i) => {
            (this._areaToIdx[name] || (this._areaToIdx[name] = [])).push(i);
        });

        const warnPaths = sortedWarns.map((f, i) => {
            const color = this.warnColor(f.properties);
            const area = this.esc(this._areaName[i]);
            return `<path class="wm-warn" data-idx="${i}" data-area="${area}" d="${this.geomToPath(f.geometry, project)}" `
                + `fill="${color}" stroke="${color}"></path>`;
        }).join('');

        // Blue "you are here" marker for the configured city, if it falls inside the map.
        let markerSvg = '';
        const lat = location && Number(location.lat);
        const lon = location && Number(location.lon);
        if (location && isFinite(lat) && isFinite(lon)
            && lon >= bounds.minLon && lon <= bounds.maxLon
            && lat >= bounds.minLat && lat <= bounds.maxLat) {
            const [mx, my] = project(lon, lat);
            const name = this.esc(location.name || '');
            markerSvg = `
                <g class="wm-marker">
                    <circle class="wm-marker-pulse" cx="${mx}" cy="${my}" r="14"></circle>
                    <circle class="wm-marker-dot" cx="${mx}" cy="${my}" r="8"></circle>
                    <title>${name}</title>
                </g>`;
        }

        container.innerHTML = `
            <div class="warning-map-card wm-interactive">
                <svg class="wm-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="DWD Warnkarte">
                    <g class="wm-states">${statePaths}</g>
                    <g class="wm-warns">${warnPaths}</g>
                    ${markerSvg}
                </svg>
                <div class="wm-count ${warnFeats.length ? 'has-warn' : 'no-warn'}">
                    <i data-lucide="${warnFeats.length ? 'alert-triangle' : 'shield-check'}"></i>
                    <span>${warnFeats.length ? `${warnFeats.length} aktive Warnungen` : 'Keine aktiven Warnungen'}</span>
                </div>
                <div class="wm-hoverlabel" hidden></div>
                <div class="wm-tooltip" hidden></div>
            </div>
        `;
        window.refreshLucideIcons(container);

        this.bindHover(container);
    },

    bindHover(container) {
        const card = container.querySelector('.wm-interactive');
        const svg = card.querySelector('.wm-svg');
        const label = card.querySelector('.wm-hoverlabel');
        const tip = card.querySelector('.wm-tooltip');
        let pinned = false;

        const allWarns = Array.from(card.querySelectorAll('.wm-warn'));
        const highlightArea = (area) => {
            allWarns.forEach(el => el.classList.toggle('active', !!area && el.dataset.area === area));
        };
        const clearHighlight = () => {
            card.querySelectorAll('.wm-warn.active').forEach(el => el.classList.remove('active'));
        };

        // Hover → compact label with the Landkreis name + how many warnings.
        const showLabel = (area, evt) => {
            const idxs = this._areaToIdx[area] || [];
            const n = idxs.length;
            const word = n === 1 ? 'Warnung' : 'Warnungen';
            const color = n ? this.warnColor(this._warnData[idxs[idxs.length - 1]]) : '#9e9e9e';
            label.innerHTML = `<span class="wm-hl-dot" style="background:${color};"></span>`
                + `<span class="wm-hl-name">${this.esc(area)}</span>`
                + `<span class="wm-hl-count">${n} ${word}</span>`;
            label.hidden = false;
            this.positionTip(card, label, evt);
        };

        // Click → full warning window(s) for that area.
        const showDetail = (area, evt) => {
            const idxs = this._areaToIdx[area] || [];
            tip.innerHTML = idxs.map(i => this.tooltipHtml(this._warnData[i])).join('<div class="wm-tip-sep"></div>');
            window.refreshLucideIcons(tip);
            tip.hidden = false;
            this.positionTip(card, tip, evt);
        };

        svg.addEventListener('mousemove', (e) => {
            const path = e.target.closest('.wm-warn');
            if (path) {
                const area = path.dataset.area;
                highlightArea(area);
                if (pinned) {
                    label.hidden = true;
                } else {
                    showLabel(area, e);
                }
            } else if (!pinned) {
                clearHighlight();
                label.hidden = true;
            }
        });
        svg.addEventListener('mouseleave', () => {
            if (!pinned) clearHighlight();
            label.hidden = true;
        });
        svg.addEventListener('click', (e) => {
            const path = e.target.closest('.wm-warn');
            if (path) {
                const area = path.dataset.area;
                pinned = true;
                highlightArea(area);
                label.hidden = true;
                tip.classList.add('pinned');
                showDetail(area, e);
            } else {
                pinned = false;
                clearHighlight();
                tip.classList.remove('pinned');
                tip.hidden = true;
                label.hidden = true;
            }
        });
    },

    positionTip(card, tip, evt) {
        const rect = card.getBoundingClientRect();
        let x = evt.clientX - rect.left + 12;
        let y = evt.clientY - rect.top + 12;
        const tw = tip.offsetWidth || 220;
        const th = tip.offsetHeight || 120;
        if (x + tw > rect.width) x = rect.width - tw - 8;
        if (y + th > rect.height) y = rect.height - th - 8;
        tip.style.left = `${Math.max(4, x)}px`;
        tip.style.top = `${Math.max(4, y)}px`;
    },

    tooltipHtml(p) {
        const color = this.warnColor(p);
        const area = p.AREADESC || p.NAME || '';
        const title = (p.EVENT || p.HEADLINE || 'Warnung');
        const sev = this.severityLabel(p.SEVERITY);
        const valid = this.formatRange(p.ONSET, p.EXPIRES);
        const desc = p.DESCRIPTION ? `<div class="wm-tip-desc">${this.esc(p.DESCRIPTION)}</div>` : '';
        const instr = p.INSTRUCTION ? `<div class="wm-tip-instr">${this.esc(p.INSTRUCTION)}</div>` : '';
        return `
            <div class="wm-tip-head" style="border-color:${color};">
                <span class="wm-tip-dot" style="background:${color};"></span>
                <strong>${this.esc(title)}</strong>
                ${sev ? `<span class="wm-tip-sev" style="background:${color};">${this.esc(sev)}</span>` : ''}
            </div>
            ${area ? `<div class="wm-tip-area"><i data-lucide="map-pin"></i>${this.esc(area)}</div>` : ''}
            ${valid ? `<div class="wm-tip-time">${this.esc(valid)}</div>` : ''}
            ${desc}${instr}
        `;
    },

    // ---- helpers ----
    computeBounds(features) {
        let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
        const scan = (coords) => {
            if (typeof coords[0] === 'number') {
                const [lon, lat] = coords;
                if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon;
                if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
            } else {
                coords.forEach(scan);
            }
        };
        features.forEach(f => { if (f.geometry?.coordinates) scan(f.geometry.coordinates); });
        if (!isFinite(minLon)) return null;
        return { minLon, maxLon, minLat, maxLat };
    },

    geomToPath(geom, project) {
        if (!geom) return '';
        const ring = (r) => 'M' + r.map(pt => project(pt[0], pt[1]).join(',')).join('L') + 'Z';
        if (geom.type === 'Polygon') {
            return geom.coordinates.map(ring).join('');
        }
        if (geom.type === 'MultiPolygon') {
            return geom.coordinates.map(poly => poly.map(ring).join('')).join('');
        }
        return '';
    },

    warnColor(p) {
        const raw = (p && p.EC_AREA_COLOR ? String(p.EC_AREA_COLOR) : '').trim();
        if (/^#?[0-9a-f]{6}$/i.test(raw)) return raw.startsWith('#') ? raw : `#${raw}`;
        const m = raw.match(/(\d{1,3})\D+(\d{1,3})\D+(\d{1,3})/);
        if (m) return `rgb(${m[1]},${m[2]},${m[3]})`;
        const sev = (p && p.SEVERITY ? p.SEVERITY : '').toLowerCase();
        if (sev === 'minor') return '#ffeb3b';
        if (sev === 'moderate') return '#ffa726';
        if (sev === 'severe') return '#f44336';
        if (sev === 'extreme') return '#b71c1c';
        return '#9e9e9e';
    },

    severityLabel(severity) {
        const sev = (severity || '').toLowerCase();
        return { minor: 'GERING', moderate: 'MÄSSIG', severe: 'STARK', extreme: 'EXTREM' }[sev]
            || (severity ? String(severity).toUpperCase() : '');
    },

    formatRange(onset, expires) {
        const fmt = (s) => {
            if (!s) return '';
            const d = new Date(s);
            if (isNaN(d.getTime())) return '';
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            return `${dd}.${mm}. ${hh}:${mi}`;
        };
        const a = fmt(onset), b = fmt(expires);
        if (a && b) return `${a} – ${b}`;
        return a || b || '';
    },

    esc(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
});
