// Shared chart renderers for metric_display and similar widgets

window.ChartWidgets = {
    /**
     * Live Chart.js instances, keyed by the container element.
     * Without this, every auto-refresh created a new chart whose canvas was then
     * discarded by the next innerHTML write, while the Chart object kept its resize
     * and device-pixel-ratio listeners alive — one leak per refresh, forever.
     */
    _charts: new WeakMap(),

    /** Tear down the chart bound to a container, if any. */
    destroyChart(container) {
        if (!container) return;
        const existing = this._charts.get(container);
        if (existing) {
            try {
                existing.destroy();
            } catch (e) {
                console.warn('[Homy] chart destroy failed', e);
            }
            this._charts.delete(container);
        }
    },

    renderStat(container, { label, value, unit }) {
        this.destroyChart(container);
        const esc = window.escapeHtml;
        container.innerHTML = `
            <div class="metric-stat-widget">
                <div class="metric-stat-label">${esc(label || '')}</div>
                <div class="metric-stat-value">${esc(value ?? '—')}<span class="metric-stat-unit">${esc(unit || '')}</span></div>
            </div>
        `;
    },

    renderGauge(container, { label, value, max = 100, unit = '%' }) {
        this.destroyChart(container);
        const esc = window.escapeHtml;
        const num = parseFloat(value);
        const safeMax = Number.isFinite(parseFloat(max)) && parseFloat(max) !== 0 ? parseFloat(max) : 100;
        const pct = Number.isFinite(num) ? Math.min(100, Math.max(0, (num / safeMax) * 100)) : 0;
        const display = Number.isFinite(num) ? (Number.isInteger(num) ? num : num.toFixed(1)) : '—';
        container.innerHTML = `
            <div class="metric-gauge-widget">
                <div class="metric-gauge-ring" style="--pct: ${pct}">
                    <div class="metric-gauge-inner">
                        <span class="metric-gauge-value">${esc(display)}${esc(unit)}</span>
                    </div>
                </div>
                <div class="metric-gauge-label">${esc(label || '')}</div>
            </div>
        `;
    },

    async renderLine(container, { label, value, historyKey, color }) {
        const ChartLib = await window.loadChartJs();
        const esc = window.escapeHtml;
        const numVal = parseFloat(String(value).replace(',', '.'));
        let history = [];
        if (historyKey) {
            try {
                history = JSON.parse(localStorage.getItem(historyKey) || '[]');
                if (!Array.isArray(history)) history = [];
            } catch (e) {
                history = [];
            }
            if (Number.isFinite(numVal)) {
                const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                history.push({ t: now, v: numVal });
                if (history.length > 24) history.shift();
                try {
                    localStorage.setItem(historyKey, JSON.stringify(history));
                } catch (e) {
                    /* storage full or blocked — chart still renders from memory */
                }
            }
        }

        this.destroyChart(container);
        container.innerHTML = `
            <div class="metric-line-widget">
                <div class="metric-line-label">${esc(label || '')}</div>
                <div class="metric-line-value">${Number.isFinite(numVal) ? numVal : '—'}</div>
                <canvas class="metric-line-canvas"></canvas>
            </div>
        `;
        const canvas = container.querySelector('.metric-line-canvas');
        if (!canvas || history.length < 2) return;
        const primary = color || getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#6366f1';
        const chart = new ChartLib(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: history.map(h => h.t),
                datasets: [{
                    data: history.map(h => h.v),
                    borderColor: primary,
                    backgroundColor: primary + '33',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 0,
                    borderWidth: 2,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { display: false },
                },
            },
        });
        this._charts.set(container, chart);
    },
};
