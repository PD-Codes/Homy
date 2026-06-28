// Shared chart renderers for metric_display and similar widgets

window.ChartWidgets = {
    renderStat(container, { label, value, unit }) {
        container.innerHTML = `
            <div class="metric-stat-widget">
                <div class="metric-stat-label">${label || ''}</div>
                <div class="metric-stat-value">${value ?? '—'}<span class="metric-stat-unit">${unit || ''}</span></div>
            </div>
        `;
    },

    renderGauge(container, { label, value, max = 100, unit = '%' }) {
        const num = parseFloat(value);
        const pct = Number.isFinite(num) ? Math.min(100, Math.max(0, (num / max) * 100)) : 0;
        const display = Number.isFinite(num) ? (Number.isInteger(num) ? num : num.toFixed(1)) : '—';
        container.innerHTML = `
            <div class="metric-gauge-widget">
                <div class="metric-gauge-ring" style="--pct: ${pct}">
                    <div class="metric-gauge-inner">
                        <span class="metric-gauge-value">${display}${unit}</span>
                    </div>
                </div>
                <div class="metric-gauge-label">${label || ''}</div>
            </div>
        `;
    },

    async renderLine(container, { label, value, historyKey, color }) {
        const ChartLib = await window.loadChartJs();
        const numVal = parseFloat(String(value).replace(',', '.'));
        let history = [];
        if (historyKey) {
            try {
                history = JSON.parse(localStorage.getItem(historyKey) || '[]');
            } catch (e) {
                history = [];
            }
            if (Number.isFinite(numVal)) {
                const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                history.push({ t: now, v: numVal });
                if (history.length > 24) history.shift();
                localStorage.setItem(historyKey, JSON.stringify(history));
            }
        }
        container.innerHTML = `
            <div class="metric-line-widget">
                <div class="metric-line-label">${label || ''}</div>
                <div class="metric-line-value">${Number.isFinite(numVal) ? numVal : '—'}</div>
                <canvas class="metric-line-canvas"></canvas>
            </div>
        `;
        const canvas = container.querySelector('.metric-line-canvas');
        if (!canvas || history.length < 2) return;
        const primary = color || getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#6366f1';
        new ChartLib(canvas.getContext('2d'), {
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
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { display: false },
                },
            },
        });
    },
};
