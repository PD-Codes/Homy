window.WidgetRegistry.register('homeassistant', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        
        try {
            const data = await API.request(`/api/homeassistant/status?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            
            const card = document.createElement('div');
            card.className = 'hass-container';
            
            let htmlContent = '';
            
            if (data.entities && data.entities.length > 0) {
                // Separate switches and sensors
                const switches = data.entities.filter(e => e.type === 'switch');
                const sensors = data.entities.filter(e => e.type === 'sensor');
                
                let switchesHTML = '';
                switches.forEach(sw => {
                    const isActive = sw.state === 'on';
                    const iconName = sw.entity_id.startsWith('light') ? 'lightbulb' : 'power';
                    const activeClass = isActive ? 'hass-sw-active' : '';
                    const action = isActive ? 'turn_off' : 'turn_on';
                    
                    switchesHTML += `
                        <div class="hass-sw-item">
                            <div class="hass-sw-meta">
                                <i data-lucide="${iconName}" class="hass-sw-icon ${activeClass}"></i>
                                <span class="hass-sw-name" title="${sw.name}">${sw.name}</span>
                            </div>
                            <label class="hass-switch-toggle">
                                <input type="checkbox" class="btn-hass-toggle" 
                                       data-entity="${sw.entity_id}" 
                                       data-action="${action}" 
                                       ${isActive ? 'checked' : ''}>
                                <span class="hass-switch-slider"></span>
                            </label>
                        </div>
                    `;
                });
                
                let sensorsHTML = '';
                sensors.forEach(sn => {
                    let iconName = 'info';
                    if (sn.entity_id.includes('temperature') || sn.unit === '°C') {
                        iconName = 'thermometer';
                    } else if (sn.entity_id.includes('humidity') || sn.unit === '%') {
                        iconName = 'droplets';
                    }
                    
                    sensorsHTML += `
                        <div class="hass-sn-item">
                            <i data-lucide="${iconName}" class="hass-sn-icon"></i>
                            <div class="hass-sn-info">
                                <span class="hass-sn-val">${sn.state}${sn.unit}</span>
                                <span class="hass-sn-name" title="${sn.name}">${sn.name}</span>
                            </div>
                        </div>
                    `;
                });
                
                htmlContent = `
                    ${switchesHTML ? `<div class="hass-grid-switches">${switchesHTML}</div>` : ''}
                    ${sensorsHTML ? `<div class="hass-grid-sensors">${sensorsHTML}</div>` : ''}
                `;
            } else {
                htmlContent = '<div class="muted-text text-center" style="padding: 12px;">Keine Smart Home Geräte gefunden.</div>';
            }
            
            card.innerHTML = `
                <div class="hass-header">
                    <span class="hass-title"><i data-lucide="home" class="hass-icon-header"></i>Smart Home Steuerung</span>
                    ${!data.online ? `<span class="search-launcher-item-badge" style="background:rgba(239,68,68,0.2);color:var(--danger)">Offline</span>` : ''}
                </div>
                <div class="hass-body-grid">
                    ${htmlContent}
                </div>
            `;
            
            // Add click listeners to toggles
            card.querySelectorAll('.btn-hass-toggle').forEach(input => {
                input.addEventListener('change', async (e) => {
                    e.stopPropagation();
                    const entityId = input.getAttribute('data-entity');
                    const isChecked = input.checked;
                    const action = isChecked ? 'turn_on' : 'turn_off';
                    
                    try {
                        await API.request('/api/homeassistant/toggle', {
                            method: 'POST',
                            body: {
                                widget_id: widgetData.id,
                                entity_id: entityId,
                                action: action
                            }
                        });
                        showToast(`Gerät erfolgreich ${isChecked ? 'eingeschaltet' : 'ausgeschaltet'}!`, "success");
                        // Refresh widgets
                        if (window.DashboardController) {
                            window.DashboardController.refreshWidget(widgetData.id, null, { force: true });
                        }
                    } catch (err) {
                        showToast("Fehler: " + err.message, "error");
                        input.checked = !isChecked; // Revert checkbox state
                    }
                });
            });
            
            container.appendChild(card);
            window.refreshLucideIcons(container);
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>${err.message}</span></div>`;
            window.refreshLucideIcons(container);
        }
    }
});
