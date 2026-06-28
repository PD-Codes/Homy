window.WidgetRegistry.register('portainer_containers', {
    _row(c, showEndpoint) {
        const running = c.state === 'running';
        const stateClass = running ? 'pt-state-up' : (c.state === 'restarting' ? 'pt-state-warn' : 'pt-state-down');
        const ep = showEndpoint && c.endpoint ? `<span class="pt-ep">${c.endpoint}</span>` : '';
        return `<div class="pt-row">
            <span class="pt-dot ${running ? 'pt-dot-up' : c.state === 'restarting' ? 'pt-dot-warn' : 'pt-dot-down'}"></span>
            <span class="pt-name" title="${c.name}">${c.name}</span>
            ${ep}
            <span class="pt-badge ${stateClass}">${c.state || 'unknown'}</span>
        </div>`;
    },

    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {
            const data = await API.request(`/api/portainer_containers/data?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            if (!data.online) {
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${data.message || 'Not available'}</div>`;
                return;
            }
            const containers = data.containers || [];
            const runCount = data.running_count ?? containers.filter(c => c.state === 'running').length;

            const statsHtml = `<div class="pt-stats">
                <div class="pt-stat"><span class="pt-val pt-color-up">${runCount}</span><span class="pt-label">Running</span></div>
                <div class="pt-stat"><span class="pt-val">${containers.length}</span><span class="pt-label">Angezeigt</span></div>
                <div class="pt-stat"><span class="pt-val">${data.container_count ?? containers.length}</span><span class="pt-label">Gesamt</span></div>
            </div>`;

            let listHtml;
            if (data.group_by_endpoint) {
                const groups = {};
                containers.forEach(c => { const ep = c.endpoint || 'Default'; (groups[ep] = groups[ep] || []).push(c); });
                listHtml = Object.entries(groups).map(([ep, cs]) =>
                    `<div class="pt-group"><div class="pt-group-title"><i data-lucide="server" style="width:11px;height:11px;margin-right:5px"></i>${ep}</div>${cs.map(c => this._row(c, false)).join('')}</div>`
                ).join('');
            } else {
                listHtml = containers.length
                    ? containers.map(c => this._row(c, data.show_endpoint)).join('')
                    : '<div class="pt-empty">Keine Container</div>';
            }

            container.innerHTML = `<div class="pt-container">${statsHtml}<div class="pt-list">${listHtml}</div></div>`;
            window.refreshLucideIcons?.(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>${err.message}</span></div>`;
            window.refreshLucideIcons?.(container);
        }
    },
});
