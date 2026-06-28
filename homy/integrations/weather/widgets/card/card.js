// Weather — compact card (reference UI) + detail modal on click

window.WidgetRegistry.register('openweather_card', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';

        try {
            const locale = window.i18n?.currentLocale || 'de-DE';
            const lang = locale.startsWith('de') ? 'de' : 'en';
            const data = await API.request(`/api/openweather_card/data?widget_id=${widgetData.id}&lang=${lang}`);
            container.innerHTML = '';

            if (data.error) {
                container.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>${data.message || data.error}</span></div>`;
                window.refreshLucideIcons(container);
                return;
            }

            const tempUnit = data.units === 'metric' ? '°C' : '°F';
            const windUnit = data.units === 'metric' ? 'km/h' : 'mph';
            const windKmh = data.units === 'metric' ? (data.wind_speed * 3.6).toFixed(1) : data.wind_speed;
            const temp = Math.round(data.temp * 10) / 10;
            const tempStr = String(temp).replace('.', ',');
            const iconName = this.getWeatherIconName(data.weather.icon);
            const locLabel = data.location_label || `${data.city}`;
            const subtitle = config.location_label ? 'Forecast' : (data.city || 'Wetter');
            const monoIcons = config.forecast_colored_icons === 'Nein';

            const card = document.createElement('div');
            card.className = `weather-compact-card weather-clickable${monoIcons ? ' weather-icons-mono' : ''}`;
            card.title = window.i18n?.translate('weather_click_details') || 'Click for details';

            let forecastHtml = '';
            if (data.forecast && data.forecast.length) {
                forecastHtml = `<div class="weather-forecast-strip">${data.forecast.map(day => {
                    const dayName = this.getWeekdayLabel(day.date);
                    const maxT = Math.round(day.temp_max ?? day.temp);
                    const minT = Math.round(day.temp_min ?? day.temp);
                    const ic = this.getWeatherIconName(day.weather.icon);
                    return `
                        <div class="weather-fday">
                            <span class="weather-fday-name">${dayName}</span>
                            <i data-lucide="${ic}" class="weather-fday-icon"></i>
                            <span class="weather-fday-hi">${String(maxT).replace('.', ',')}°</span>
                            <span class="weather-fday-lo">${String(minT).replace('.', ',')}°</span>
                        </div>
                    `;
                }).join('')}</div>`;
            }

            card.innerHTML = `
                <div class="weather-compact-top">
                    <div class="weather-compact-left">
                        <i data-lucide="${iconName}" class="weather-compact-icon"></i>
                        <div>
                            <div class="weather-compact-status">${data.weather.description}</div>
                            <div class="weather-compact-loc">${subtitle}</div>
                        </div>
                    </div>
                    <div class="weather-compact-right">
                        <div class="weather-compact-temp">${tempStr} ${tempUnit}</div>
                        <div class="weather-compact-wind">
                            <i data-lucide="wind"></i>
                            <span>${windKmh} ${windUnit}${data.wind_label ? ` (${data.wind_label})` : ''}</span>
                        </div>
                    </div>
                </div>
                ${forecastHtml}
            `;

            container.appendChild(card);
            window.refreshLucideIcons(container);

            card.addEventListener('click', (e) => {
                if (e.target.closest('.widget-btn-refresh')) return;
                this.openDetailModal(data, config, tempUnit, windUnit, widgetData);
            });

        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-circle"></i><span>${err.message}</span></div>`;
            window.refreshLucideIcons(container);
        }
    },

    openDetailModal(data, config, tempUnit, windUnit, widgetData) {
        let modal = document.getElementById('weather-detail-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'weather-detail-modal';
            modal.className = 'modal-overlay weather-detail-overlay';
            modal.innerHTML = `
                <div class="modal weather-detail-modal glass">
                    <div class="weather-detail-header">
                        <button type="button" class="icon-btn" id="weather-detail-close"><i data-lucide="x"></i></button>
                        <div class="weather-detail-title-wrap">
                            <span class="muted-text" style="font-size:0.7rem;">${window.i18n?.translate('weather_forecast') || 'Forecast'}</span>
                            <h2 id="weather-detail-title">Wetter</h2>
                        </div>
                    </div>
                    <div class="weather-detail-body" id="weather-detail-body"></div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector('#weather-detail-close').onclick = () => modal.classList.remove('open');
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });
        }

        const body = modal.querySelector('#weather-detail-body');
        const title = modal.querySelector('#weather-detail-title');
        title.textContent = data.location_label || data.city || 'Wetter';

        const temp = Math.round(data.temp * 10) / 10;
        const iconName = this.getWeatherIconName(data.weather.icon);
        const updated = data.updated_at ? new Date(data.updated_at * 1000) : new Date();
        const agoMin = Math.max(0, Math.round((Date.now() - updated) / 60000));
        const windKmh = data.units === 'metric' ? (data.wind_speed * 3.6).toFixed(1) : data.wind_speed;

        const dailyTab = (data.forecast || []).map(day => {
            const ic = this.getWeatherIconName(day.weather.icon);
            const maxT = Math.round(day.temp_max ?? day.temp);
            const minT = Math.round(day.temp_min ?? day.temp);
            return `
                <div class="weather-detail-fday">
                    <span>${this.getWeekdayLabel(day.date)}</span>
                    <i data-lucide="${ic}"></i>
                    <span class="hi">${maxT}°</span>
                    <span class="lo">${minT}°</span>
                </div>
            `;
        }).join('');

        const hourlyTab = (data.hourly || []).slice(0, 12).map(h => {
            const t = h.time ? h.time.split(' ')[1]?.slice(0, 5) : '';
            const ic = this.getWeatherIconName(h.weather?.icon);
            return `
                <div class="weather-detail-hour">
                    <span>${t}</span>
                    <i data-lucide="${ic}"></i>
                    <span>${Math.round(h.temp)}°</span>
                    ${h.pop ? `<span class="pop">${h.pop}%</span>` : ''}
                </div>
            `;
        }).join('');

        body.innerHTML = `
            <div class="weather-detail-current">
                <div class="weather-detail-current-left">
                    <i data-lucide="${iconName}" class="weather-detail-big-icon"></i>
                    <div>
                        <div class="weather-detail-desc">${data.weather.description}</div>
                        <div class="muted-text">${window.i18n?.translate('weather_ago_min', { min: agoMin || 1 }) || `${agoMin || 1} min ago`}</div>
                    </div>
                </div>
                <div class="weather-detail-temp-block">
                    <div class="weather-detail-big-temp">${String(temp).replace('.', ',')} ${tempUnit}</div>
                    <div class="muted-text">${Math.round(data.temp_max)}° / ${Math.round(data.temp_min)}°</div>
                </div>
            </div>
            <div class="weather-detail-metrics">
                <div><i data-lucide="gauge"></i><span>${window.i18n?.translate('weather_pressure') || 'Pressure'}</span><strong>${data.pressure || '—'} hPa</strong></div>
                <div><i data-lucide="droplets"></i><span>${window.i18n?.translate('weather_humidity') || 'Humidity'}</span><strong>${data.humidity}%</strong></div>
                <div><i data-lucide="wind"></i><span>${window.i18n?.translate('weather_wind') || 'Wind'}</span><strong>${windKmh} ${windUnit} (${data.wind_label || '—'})</strong></div>
            </div>
            <div class="weather-detail-tabs">
                <button type="button" class="weather-tab active" data-tab="daily">${window.i18n?.translate('weather_daily') || 'Daily'}</button>
                <button type="button" class="weather-tab" data-tab="hourly">${window.i18n?.translate('weather_hourly') || 'Hourly'}</button>
            </div>
            <div class="weather-tab-panel active" id="weather-tab-daily">${dailyTab || '<p class="muted-text">Keine Daten</p>'}</div>
            <div class="weather-tab-panel" id="weather-tab-hourly">${hourlyTab || '<p class="muted-text">Keine Daten</p>'}</div>
        `;

        body.querySelectorAll('.weather-tab').forEach(btn => {
            btn.onclick = () => {
                body.querySelectorAll('.weather-tab').forEach(b => b.classList.remove('active'));
                body.querySelectorAll('.weather-tab-panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                body.querySelector(`#weather-tab-${btn.dataset.tab}`).classList.add('active');
            };
        });

        window.refreshLucideIcons(modal);
        modal.classList.add('open');
    },

    getWeatherIconName(iconCode) {
        if (!iconCode) return 'sun';
        const prefix = iconCode.substring(0, 2);
        switch (prefix) {
            case '01': return iconCode.endsWith('d') ? 'sun' : 'moon';
            case '02': return iconCode.endsWith('d') ? 'cloud-sun' : 'cloud-moon';
            case '03': return 'cloud';
            case '04': return 'cloudy';
            case '09': return 'cloud-drizzle';
            case '10': return 'cloud-rain';
            case '11': return 'cloud-lightning';
            case '13': return 'snowflake';
            case '50': return 'wind';
            default: return 'sun';
        }
    },

    getWeekdayLabel(dateStr) {
        const date = new Date(dateStr);
        const daysDe = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
        const daysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return (window.i18n?.currentLocale === 'de-DE' ? daysDe : daysEn)[date.getDay()];
    },

    formatTime(unixTimestamp) {
        if (!unixTimestamp) return '';
        const date = new Date(unixTimestamp * 1000);
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    },
});
