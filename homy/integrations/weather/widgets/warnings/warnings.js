(function() {
    const expandedWarnings = new Set();

    const getWarningKey = w => `${w.headline}_${w.starts}_${w.ends}`;

    function getWarningIcon(event, ec_ii) {
        const ev = (event || '').toLowerCase();
        const code = parseInt(ec_ii);
        if (ev.includes('gewitter') || (code >= 30 && code <= 39)) {
            return 'cloud-lightning';
        }
        if (ev.includes('wind') || ev.includes('sturm') || ev.includes('böen') || ev.includes('orkan') || (code >= 50 && code <= 59)) {
            return 'wind';
        }
        if (ev.includes('regen') || ev.includes('niederschlag') || (code >= 60 && code <= 69)) {
            return 'cloud-rain';
        }
        if (ev.includes('schnee') || ev.includes('glätte') || ev.includes('eis') || ev.includes('frost') || (code >= 70 && code <= 79)) {
            return 'snowflake';
        }
        if (ev.includes('hitze')) {
            return 'sun';
        }
        return 'alert-triangle';
    }

    function getSeverityColor(severity) {
        const sev = (severity || '').toLowerCase();
        if (sev === 'minor' || sev === 'gering') return '#00a2ff';
        if (sev === 'moderate' || sev === 'mäßig') return '#ffa726';
        if (sev === 'severe' || sev === 'stark' || sev === 'schwer') return '#f59e0b';
        if (sev === 'extreme' || sev === 'extrem') return '#f44336';
        return '#9e9e9e';
    }

    function getSeverityLabel(severity) {
        const sev = (severity || '').toLowerCase();
        if (sev === 'minor') return 'GERING';
        if (sev === 'moderate') return 'MÄSSIG';
        if (sev === 'severe') return 'STARK';
        if (sev === 'extreme') return 'EXTREM';
        return severity.toUpperCase();
    }

    function getTzAbbr(date) {
        try {
            const part = date.toLocaleTimeString('de-DE', { timeZoneName: 'short' }).split(' ').pop();
            // Accept only valid timezone abbreviations (2–5 uppercase letters / digits)
            return /^[A-Z]{2,5}$/.test(part) ? part : '';
        } catch (e) {
            return '';
        }
    }

    function formatTime(dateStr) {
        if (!dateStr) return 'K. A.';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const tz = getTzAbbr(date);
        return `${hours}:${minutes}${tz ? ' ' + tz : ' Uhr'}`;
    }

    function formatDateTime(dateStr) {
        if (!dateStr) return 'K. A.';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const tz = getTzAbbr(date);
        return `${day}.${month}.${year}, ${hours}:${minutes}${tz ? ' ' + tz : ''}`;
    }

    function escHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function formatRelativeTime(dateStr, isFuture) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '';
        const now = new Date();
        const diffMs = isFuture ? (date - now) : (now - date);
        const diffMin = Math.max(0, Math.floor(diffMs / 60000));
        if (diffMin < 60) {
            return `${isFuture ? 'in' : 'vor'} ${diffMin} Min`;
        }
        const diffHours = Math.floor(diffMin / 60);
        const remainingMin = diffMin % 60;
        if (remainingMin === 0) {
            return `${isFuture ? 'in' : 'vor'} ${diffHours} Std`;
        }
        return `${isFuture ? 'in' : 'vor'} ${diffHours} Std ${remainingMin} Min`;
    }

    function getDurationLabel(starts, ends) {
        const now = new Date();
        const start = new Date(starts);
        const end = new Date(ends);
        if (now < start) {
            return {
                label: 'BEGINNT IN',
                time: formatDuration(start - now),
                percent: 0
            };
        } else if (now > end) {
            return {
                label: 'BEENDET',
                time: formatRelativeTime(ends, false),
                percent: 100
            };
        } else {
            const total = end - start;
            const elapsed = now - start;
            const percent = Math.min(100, Math.max(0, (elapsed / total) * 100));
            return {
                label: 'ENDET IN',
                time: formatDuration(end - now),
                percent: percent
            };
        }
    }

    function formatDuration(ms) {
        const totalMin = Math.max(0, Math.floor(ms / 60000));
        if (totalMin < 60) {
            return `${totalMin}m`;
        }
        const hours = Math.floor(totalMin / 60);
        const mins = totalMin % 60;
        if (mins === 0) {
            return `${hours}h`;
        }
        return `${hours}h ${mins}m`;
    }

    window.WidgetRegistry.register('weather_warnings', {
        async render(container, widgetData, config) {
            container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
            try {
                const data = await API.request(`/api/weather_warnings/data?widget_id=${widgetData.id}`);
                container.innerHTML = '';

                if (!data.online && data.message) {
                    container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message}</div>`;
                    return;
                }

                const warnings = data.warnings || [];
                if (!warnings.length) {
                    container.innerHTML = `
                        <div class="warn-widget-empty">
                            <i data-lucide="shield-check"></i>
                            <p>Keine aktiven Warnungen</p>
                            <span class="muted-text">${data.source || ''} · ${data.region_code || ''}</span>
                        </div>
                    `;
                    window.refreshLucideIcons(container);
                    return;
                }

                const listEl = document.createElement('div');
                listEl.className = 'warn-widget-list';

                warnings.forEach((w, index) => {
                    const key = getWarningKey(w);
                    const isExpanded = expandedWarnings.has(key);
                    const color = getSeverityColor(w.severity);
                    const icon = getWarningIcon(w.event || w.headline, w.ec_ii);
                    const startsStr = formatTime(w.starts);
                    const endsStr = formatTime(w.ends);
                    const dur = getDurationLabel(w.starts, w.ends);
                    const severityLabel = getSeverityLabel(w.severity);

                    const itemEl = document.createElement('div');
                    itemEl.className = `warn-item ${isExpanded ? 'expanded' : ''}`;
                    itemEl.style.borderLeft = `4px solid ${color}`;

                    itemEl.innerHTML = `
                        <div class="warn-header">
                            <div class="warn-icon-circle" style="border-color: ${color};">
                                <i data-lucide="${icon}" style="color: ${color};"></i>
                            </div>
                            <div class="warn-header-info">
                                <div class="warn-title-main">${escHtml((w.event || w.headline)).toUpperCase()}</div>
                                <div class="warn-subtitle muted-text">${escHtml(w.headline)}</div>
                                <div class="warn-location muted-text">
                                    <i data-lucide="map-pin" class="warn-pin-icon"></i>
                                    <span>${escHtml(w.area)}</span>
                                </div>
                                <div class="warn-badges">
                                    <span class="warn-badge-sev" style="background-color: ${color};">${escHtml(severityLabel)}</span>
                                    ${w.ec_ii ? `<span class="warn-badge-code">${escHtml(w.ec_ii)}</span>` : ''}
                                </div>
                            </div>
                        </div>

                        <div class="warn-times-section">
                            <div class="warn-time-cols">
                                <div class="warn-time-col">
                                    <div class="warn-time-lbl">START</div>
                                    <div class="warn-time-val">${escHtml(startsStr)}</div>
                                </div>
                                <div class="warn-time-col align-center">
                                    <div class="warn-time-lbl">${escHtml(dur.label)}</div>
                                    <div class="warn-time-val" style="color: ${color}; font-weight: 600;">${escHtml(dur.time)}</div>
                                </div>
                                <div class="warn-time-col align-right">
                                    <div class="warn-time-lbl">ENDE</div>
                                    <div class="warn-time-val">${escHtml(endsStr)}</div>
                                </div>
                            </div>
                            <div class="warn-progress-track">
                                <div class="warn-progress-fill" style="width: ${dur.percent}%; background-color: ${color};"></div>
                            </div>
                        </div>

                        <div class="warn-toggle-details-btn">
                            <span>Details lesen</span>
                            <span class="warn-chevron"><i data-lucide="chevron-down"></i></span>
                        </div>

                        <div class="warn-details-body" style="display: ${isExpanded ? 'block' : 'none'};">
                            <div class="warn-details-grid">
                                <div class="warn-details-col">
                                    <div class="warn-detail-lbl">AUSGEGEBEN</div>
                                    <div class="warn-detail-val">${escHtml(formatDateTime(w.starts))}</div>
                                </div>
                                <div class="warn-details-col">
                                    <div class="warn-detail-lbl">BEGINN</div>
                                    <div class="warn-detail-val">${escHtml(formatDateTime(w.starts))}</div>
                                    <div class="warn-detail-rel muted-text">${escHtml(formatRelativeTime(w.starts, false))}</div>
                                </div>
                                <div class="warn-details-col">
                                    <div class="warn-detail-lbl">ABLAUF</div>
                                    <div class="warn-detail-val">${escHtml(formatDateTime(w.ends))}</div>
                                    <div class="warn-detail-rel muted-text">${escHtml(formatRelativeTime(w.ends, true))}</div>
                                </div>
                            </div>

                            <div class="warn-detail-block">
                                <div class="warn-detail-lbl">GEBIET</div>
                                <div class="warn-detail-val" style="font-weight: 600;">${escHtml(w.area)}</div>
                            </div>

                            <div class="warn-detail-block">
                                <div class="warn-detail-lbl">Beschreibung</div>
                                <div class="warn-detail-text-box">${escHtml(w.description)}</div>
                            </div>

                            ${w.instruction ? `
                            <div class="warn-detail-block">
                                <div class="warn-detail-lbl">Hinweise</div>
                                <div class="warn-detail-text-box">${escHtml(w.instruction)}</div>
                            </div>
                            ` : ''}

                            <div class="warn-source-link-wrap">
                                <a href="${escHtml(w.web || 'https://dwd.de')}" target="_blank" rel="noopener noreferrer" class="warn-source-link" style="color: ${color};">
                                    <span>DWD-Quelle öffnen</span>
                                    <i data-lucide="external-link" class="warn-link-icon"></i>
                                </a>
                            </div>
                        </div>
                    `;

                    // Toggle logic
                    const toggleBtn = itemEl.querySelector('.warn-toggle-details-btn');
                    const detailsBody = itemEl.querySelector('.warn-details-body');
                    toggleBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const nowExpanded = itemEl.classList.toggle('expanded');
                        if (nowExpanded) {
                            detailsBody.style.display = 'block';
                            expandedWarnings.add(key);
                        } else {
                            detailsBody.style.display = 'none';
                            expandedWarnings.delete(key);
                        }
                    });

                    listEl.appendChild(itemEl);
                });

                container.appendChild(listEl);
                window.refreshLucideIcons(container);
            } catch (err) {
                container.innerHTML = `<div class="widget-error">${err.message}</div>`;
            }
        },
    });
})();
