window.WidgetRegistry.register('countdown', {
    _timers: {},

    render(container, widgetData, config) {
        const t = (k, fb) => (window.i18n ? window.i18n.translate(k) : null) || fb;
        const eventName = config.event_name || 'Countdown';
        const targetDate = (config.target_date || '').trim();
        const targetTime = (config.target_time || '00:00').trim();
        const style = config.style || 'boxes';
        const showSec = config.show_seconds !== 'Nein';
        const locale = window.i18n?.currentLocale || 'de-DE';

        if (this._timers[widgetData.id]) {
            clearInterval(this._timers[widgetData.id]);
        }

        if (!targetDate) {
            container.innerHTML = `<div class="countdown-wrap countdown-${style}">
                <div class="countdown-label">${window.escapeHtml(eventName)}</div>
                <div class="countdown-no-date muted-text">${t('countdown_no_date', 'Bitte Datum konfigurieren')}</div>
            </div>`;
            return;
        }

        const target = new Date(`${targetDate}T${targetTime || '00:00'}:00`);
        if (isNaN(target.getTime())) {
            container.innerHTML = `<div class="countdown-wrap"><div class="countdown-error muted-text">${t('countdown_invalid_date', 'Ungültiges Datum')}</div></div>`;
            return;
        }

        const tick = () => {
            const now = new Date();
            const diff = target - now;

            if (diff <= 0) {
                container.innerHTML = `<div class="countdown-wrap countdown-${style}">
                    <div class="countdown-label">${window.escapeHtml(eventName)}</div>
                    <div class="countdown-done">🎉 ${window.escapeHtml(eventName)} ${t('countdown_done', 'ist jetzt!')}</div>
                </div>`;
                clearInterval(this._timers[widgetData.id]);
                return;
            }

            const totalSec = Math.floor(diff / 1000);
            const days = Math.floor(totalSec / 86400);
            const hours = Math.floor((totalSec % 86400) / 3600);
            const minutes = Math.floor((totalSec % 3600) / 60);
            const seconds = totalSec % 60;

            if (style === 'minimal') {
                const parts = [];
                if (days > 0) parts.push(`${days}d`);
                parts.push(`${String(hours).padStart(2,'0')}h`);
                parts.push(`${String(minutes).padStart(2,'0')}m`);
                if (showSec) parts.push(`${String(seconds).padStart(2,'0')}s`);
                container.innerHTML = `<div class="countdown-wrap countdown-minimal">
                    <div class="countdown-label">${window.escapeHtml(eventName)}</div>
                    <div class="countdown-minimal-digits">${parts.join(' ')}</div>
                    <div class="countdown-target muted-text">${target.toLocaleDateString(locale)}</div>
                </div>`;
            } else if (style === 'banner') {
                const total = days > 0 ? `${days}d` : `${hours}h ${minutes}m`;
                container.innerHTML = `<div class="countdown-wrap countdown-banner">
                    <div class="countdown-banner-inner">
                        <i data-lucide="timer" style="width:18px;height:18px;"></i>
                        <span class="countdown-banner-name">${window.escapeHtml(eventName)}</span>
                        <span class="countdown-banner-time">${total}</span>
                    </div>
                    <div class="countdown-target muted-text">${target.toLocaleDateString(locale)}</div>
                </div>`;
                window.refreshLucideIcons(container);
            } else {
                const units = [
                    { label: t('countdown_days', 'Tage'), val: days },
                    { label: t('countdown_hours', 'Std.'), val: hours },
                    { label: t('countdown_minutes', 'Min.'), val: minutes },
                ];
                if (showSec) units.push({ label: t('countdown_seconds', 'Sek.'), val: seconds });
                const boxes = units.map(u => `
                    <div class="countdown-box">
                        <span class="countdown-box-val">${String(u.val).padStart(2, '0')}</span>
                        <span class="countdown-box-label">${u.label}</span>
                    </div>
                `).join('<div class="countdown-sep">:</div>');
                container.innerHTML = `<div class="countdown-wrap countdown-boxes">
                    <div class="countdown-label">${window.escapeHtml(eventName)}</div>
                    <div class="countdown-boxes-row">${boxes}</div>
                    <div class="countdown-target muted-text">${target.toLocaleDateString(locale, { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
                </div>`;
            }
        };

        tick();
        this._timers[widgetData.id] = setInterval(tick, showSec ? 1000 : 60000);
    },

    onRemove(widgetId) {
        if (this._timers[widgetId]) {
            clearInterval(this._timers[widgetId]);
            delete this._timers[widgetId];
        }
    },
});
