window.WidgetRegistry.register('clock', {
    _timers: {},

    render(container, widgetData, config) {
        const tz = config.timezone || 'Europe/Berlin';
        const use24 = config.format_24h !== 'Nein';
        const showSec = config.show_seconds !== 'Nein';
        const showDate = config.show_date !== 'Nein';
        const showTz = config.show_timezone === 'Ja';
        const label = config.label || '';

        if (this._timers[widgetData.id]) {
            clearInterval(this._timers[widgetData.id]);
        }

        const tick = () => {
            const now = new Date();
            const timeOpts = {
                timeZone: tz,
                hour: '2-digit',
                minute: '2-digit',
                second: showSec ? '2-digit' : undefined,
                hour12: !use24,
            };
            const timeStr = now.toLocaleTimeString(window.i18n?.currentLocale || 'en-US', timeOpts);
            let dateStr = '';
            if (showDate) {
                dateStr = now.toLocaleDateString(window.i18n?.currentLocale || 'en-US', {
                    timeZone: tz,
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                });
            }
            container.innerHTML = `
                <div class="clock-widget">
                    ${label ? `<div class="clock-label muted-text">${window.escapeHtml(label)}</div>` : ''}
                    <div class="clock-time">${timeStr}</div>
                    ${showDate ? `<div class="clock-date">${dateStr}</div>` : ''}
                    ${showTz ? `<div class="clock-tz muted-text">${window.escapeHtml(tz)}</div>` : ''}
                </div>
            `;
        };

        tick();
        this._timers[widgetData.id] = setInterval(tick, showSec ? 1000 : 30000);
    },

    onRemove(widgetId) {
        if (this._timers[widgetId]) {
            clearInterval(this._timers[widgetId]);
            delete this._timers[widgetId];
        }
    },
});
