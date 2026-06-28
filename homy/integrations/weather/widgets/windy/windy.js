// Windy map embed widget

window.WidgetRegistry.register('windy_map', {
    async render(container, widgetData) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';

        try {
            const data = await API.request(`/api/windy_map/config?widget_id=${widgetData.id}`);

            if (!data.configured) {
                container.innerHTML = `<div class="widget-error"><i data-lucide="settings"></i><span>${data.message || 'Not configured'}</span></div>`;
                window.refreshLucideIcons(container);
                return;
            }

            // Radar & satellite are observational layers — they use their own
            // Windy "product", not the ECMWF forecast model.
            const productByOverlay = { radar: 'radar', satellite: 'satellite' };
            const product = productByOverlay[data.overlay] || 'ecmwf';

            const params = new URLSearchParams({
                lat: data.lat,
                lon: data.lon,
                zoom: data.zoom,
                overlay: data.overlay,
                level: data.level,
                metricWind: data.metric_wind,
                metricTemp: data.metric_temp,
                product,
                message: 'true',
            });

            const src = `https://embed.windy.com/embed2.html?${params}`;

            container.innerHTML = '';
            const wrap = document.createElement('div');
            wrap.className = 'windy-widget-wrap';

            const iframe = document.createElement('iframe');
            iframe.src = src;
            iframe.title = 'Windy Map';
            iframe.allowFullscreen = true;
            iframe.setAttribute('loading', 'lazy');

            iframe.onerror = () => {
                container.innerHTML = `<div class="widget-error"><i data-lucide="map-off"></i><span>Windy map unavailable</span></div>`;
                window.refreshLucideIcons(container);
            };

            wrap.appendChild(iframe);
            container.appendChild(wrap);
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-circle"></i><span>${err.message}</span></div>`;
            window.refreshLucideIcons(container);
        }
    },
});
