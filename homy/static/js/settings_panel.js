/**
 * User settings — tab navigation (same pattern as admin panel).
 */
(function () {
    'use strict';

    function el(id) {
        return document.getElementById(id);
    }

    const SettingsPanel = {
        init() {
            const nav = el('settings-tab-nav');
            if (!nav) return;
            nav.querySelectorAll('.admin-tab').forEach((tab) => {
                tab.addEventListener('click', () => {
                    const id = tab.getAttribute('data-settings-tab');
                    nav.querySelectorAll('.admin-tab').forEach((t) => t.classList.toggle('active', t === tab));
                    document.querySelectorAll('[data-settings-panel]').forEach((p) => {
                        p.classList.toggle('active', p.getAttribute('data-settings-panel') === id);
                    });
                    if (id === 'notifications' && typeof window.loadUserNotifications === 'function') {
                        window.loadUserNotifications();
                    }
                    if (id === 'media' && AppState.user) {
                        window.loadUserMediaSettings?.();
                    }
                    window.refreshLucideIcons?.();
                });
            });
        },

        showTab(tabId) {
            const nav = el('settings-tab-nav');
            const tab = nav?.querySelector(`[data-settings-tab="${tabId}"]`);
            tab?.click();
        },
    };

    window.SettingsPanel = SettingsPanel;
    document.addEventListener('DOMContentLoaded', () => SettingsPanel.init());
})();
