window.WidgetRegistry.register('arr_calendar', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/arr_calendar/data?widget_id=${widgetData.id}`);
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Nicht verfügbar'}</div>`;
                return;
            }
            const t = (k, fb) => (window.i18n ? window.i18n.translate(k) : null) || fb;
            const items = data.items || [];
            const itype = data.integration_type || 'sonarr';
            const icon = itype === 'radarr' ? 'clapperboard' : 'tv';

            const today = new Date().toISOString().slice(0, 10);
            const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

            const rows = items.map(item => {
                let dayLabel = item.date;
                if (item.date === today) dayLabel = t('arr_cal_today', 'Heute');
                else if (item.date === tomorrow) dayLabel = t('arr_cal_tomorrow', 'Morgen');

                const hasClass = item.has_file ? 'arr-cal-has-file' : '';
                const hasIcon = item.has_file
                    ? '<i data-lucide="check-circle" style="width:11px;height:11px;color:var(--success)"></i>'
                    : '<i data-lucide="clock" style="width:11px;height:11px;color:var(--text-muted)"></i>';

                return `
                    <div class="arr-cal-row ${hasClass}">
                        <div class="arr-cal-date">${dayLabel}</div>
                        <div class="arr-cal-title" title="${item.title}">${item.title}</div>
                        <div class="arr-cal-status">${hasIcon}</div>
                    </div>
                `;
            }).join('');

            const calTitle = itype === 'radarr'
                ? t('arr_cal_movies', 'Kommende Filme')
                : t('arr_cal_episodes', 'Kommende Episoden');
            container.innerHTML = `
                <div class="arr-cal-container">
                    <div class="arr-cal-header">
                        <i data-lucide="${icon}" style="width:14px;height:14px;color:var(--primary)"></i>
                        <span>${calTitle}</span>
                        <span class="arr-cal-period">${data.start} – ${data.end}</span>
                    </div>
                    <div class="arr-cal-list">
                        ${rows || `<div class="iw-empty">${t('arr_cal_empty', 'Keine Einträge in diesem Zeitraum')}</div>`}
                    </div>
                </div>
            `;
            window.refreshLucideIcons(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
