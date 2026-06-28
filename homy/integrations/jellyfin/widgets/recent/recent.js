window.WidgetRegistry.register('jellyfin_recent', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/jellyfin_recent/data?widget_id=${widgetData.id}`);
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Nicht verfügbar'}</div>`;
                return;
            }
            const items = data.items || [];
            const t = (k, fb) => (window.i18n ? window.i18n.translate(k) : null) || fb;
            const rows = items.map(item => {
                const typeIcon = item.type === 'Movie' ? 'clapperboard' : 'tv';
                const typeLabel = item.type === 'Movie' ? t('jf_recent_movie', 'Film') : t('jf_recent_episode', 'Episode');
                const img = item.image_url
                    ? `<img src="${item.image_url}" class="jf-recent-thumb" alt="" loading="lazy" onerror="this.style.display='none'">`
                    : `<div class="jf-recent-thumb-placeholder"><i data-lucide="${typeIcon}" style="width:18px;height:18px;"></i></div>`;
                return `
                    <div class="jf-recent-row">
                        ${img}
                        <div class="jf-recent-info">
                            <div class="jf-recent-title" title="${item.title}">${item.title}</div>
                            <div class="jf-recent-meta">
                                <i data-lucide="${typeIcon}" style="width:11px;height:11px;"></i>
                                <span>${typeLabel}</span>
                                ${item.date ? `<span>· ${item.date}</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = `
                <div class="jf-recent-container">
                    <div class="jf-recent-header">
                        <i data-lucide="sparkles" style="width:14px;height:14px;color:var(--primary)"></i>
                        <span>${t('jf_recent_header', 'Zuletzt hinzugefügt')}</span>
                        <span class="jf-recent-count">${data.count || 0}</span>
                    </div>
                    <div class="jf-recent-list">
                        ${rows || `<div class="iw-empty">${t('jf_recent_empty', 'Keine Einträge gefunden')}</div>`}
                    </div>
                </div>
            `;
            window.refreshLucideIcons(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
        }
    },
});
