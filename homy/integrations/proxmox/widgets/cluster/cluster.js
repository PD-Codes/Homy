window.WidgetRegistry.register('proxmox', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';

        try {
            const data = await API.request(`/api/proxmox/status?widget_id=${widgetData.id}`);
            container.innerHTML = '';

            const card = document.createElement('div');
            card.className = 'proxmox-container';

            const vms = data.vms || [];
            let itemsHTML = '';

            if (vms.length > 0) {
                vms.forEach(vm => {
                    const isRunning = vm.status === 'running';
                    const isCt = vm.kind === 'ct';
                    const statusClass = isRunning ? 'pve-running' : 'pve-stopped';
                    const buttonAction = isRunning ? 'stop' : 'start';
                    const buttonClass = isRunning ? 'btn-danger' : 'btn-success';
                    const icon = isCt ? 'box' : 'server';
                    const kindBadge = isCt
                        ? `<span class="pve-kind-badge pve-ct">CT</span>`
                        : `<span class="pve-kind-badge pve-vm">VM</span>`;

                    const stats = isRunning
                        ? `<span class="pve-vm-stat">CPU: ${vm.cpu}% · RAM: ${vm.ram}%</span>`
                        : `<span class="pve-vm-stat muted-text">Offline</span>`;

                    itemsHTML += `
                        <div class="pve-vm-row">
                            <div class="pve-vm-meta">
                                <span class="pve-status-dot ${statusClass}"></span>
                                <i data-lucide="${icon}" style="width:12px;height:12px;color:var(--text-muted);flex-shrink:0"></i>
                                ${kindBadge}
                                <span class="pve-vm-name" title="${vm.name}">${vm.name}</span>
                                <span class="pve-vm-id">(${vm.vmid})</span>
                            </div>
                            <div class="pve-vm-controls">
                                ${stats}
                                <button class="btn ${buttonClass} btn-xs btn-pve-toggle"
                                        data-vmid="${vm.vmid}"
                                        data-kind="${vm.kind || 'vm'}"
                                        data-action="${buttonAction}">
                                    <i data-lucide="${isRunning ? 'square' : 'play'}" style="width:10px;height:10px;"></i>
                                </button>
                            </div>
                        </div>
                    `;
                });
            } else {
                itemsHTML = '<div class="muted-text text-center" style="padding:12px;">Keine VMs / Container gefunden.</div>';
            }

            const vmCount = vms.filter(v => v.kind !== 'ct').length;
            const ctCount = vms.filter(v => v.kind === 'ct').length;
            const runCount = vms.filter(v => v.status === 'running').length;

            card.innerHTML = `
                <div class="pve-header">
                    <span class="pve-title"><i data-lucide="server" class="pve-icon-header"></i>Node: ${data.node_name}</span>
                    <span class="pve-summary-badges">
                        <span class="pve-kind-badge pve-vm">${vmCount} VM</span>
                        ${ctCount > 0 ? `<span class="pve-kind-badge pve-ct">${ctCount} CT</span>` : ''}
                        <span class="pve-kind-badge" style="background:rgba(34,197,94,0.15);color:var(--success)">${runCount} online</span>
                    </span>
                    ${!data.online ? `<span class="search-launcher-item-badge" style="background:rgba(239,68,68,0.2);color:var(--danger)">Offline</span>` : ''}
                </div>

                <div class="pve-node-bars">
                    <div class="pve-bar-item">
                        <div class="pve-bar-label"><span>CPU-Auslastung</span><span>${data.cpu_usage}%</span></div>
                        <div class="pve-bar-track"><div class="pve-bar-fill" style="width:${data.cpu_usage}%"></div></div>
                    </div>
                    <div class="pve-bar-item">
                        <div class="pve-bar-label"><span>Arbeitsspeicher</span><span>${data.memory_usage}%</span></div>
                        <div class="pve-bar-track"><div class="pve-bar-fill fill-purple" style="width:${data.memory_usage}%"></div></div>
                    </div>
                </div>

                <div class="pve-vms-list">${itemsHTML}</div>
            `;

            card.querySelectorAll('.btn-pve-toggle').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const vmid = btn.getAttribute('data-vmid');
                    const kind = btn.getAttribute('data-kind') || 'vm';
                    const action = btn.getAttribute('data-action');
                    btn.disabled = true;
                    btn.innerHTML = '<div class="spinner spinner-xs" style="width:10px;height:10px;"></div>';
                    try {
                        await API.request('/api/proxmox/vm/toggle', {
                            method: 'POST',
                            body: { widget_id: widgetData.id, vmid, kind, action },
                        });
                        showToast(`Befehl '${action}' an ${kind.toUpperCase()} ${vmid} gesendet!`, 'success');
                        if (window.DashboardController) {
                            window.DashboardController.refreshWidget(widgetData.id, null, { force: true });
                        }
                    } catch (err) {
                        showToast('Fehler: ' + err.message, 'error');
                        btn.disabled = false;
                        btn.innerHTML = `<i data-lucide="${action === 'stop' ? 'square' : 'play'}" style="width:10px;height:10px;"></i>`;
                        window.refreshLucideIcons(btn);
                    }
                });
            });

            container.appendChild(card);
            window.refreshLucideIcons(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>${err.message}</span></div>`;
            window.refreshLucideIcons(container);
        }
    },
});
