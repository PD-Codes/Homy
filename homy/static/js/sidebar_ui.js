/**
 * Sidebar collapse, dashboard edit button placement, user profile menu.
 */
(function () {
    'use strict';

    const LAYOUT_TRANSITION_MS = 420;

    function reflowMainLayout() {
        window.reflowDashboardGrid?.();
        window.dispatchEvent(new CustomEvent('homy:layout-changed'));
    }

    function scheduleLayoutReflow() {
        reflowMainLayout();
        const container = document.getElementById('app-container');
        if (!container) return;

        const onTransitionEnd = (e) => {
            if (e.target !== container || e.propertyName !== 'grid-template-columns') return;
            container.removeEventListener('transitionend', onTransitionEnd);
            reflowMainLayout();
        };
        container.addEventListener('transitionend', onTransitionEnd);
        window.setTimeout(reflowMainLayout, LAYOUT_TRANSITION_MS + 40);
    }

    function applySidebarCollapsed(collapsed) {
        const container = document.getElementById('app-container');
        const btn = document.getElementById('btn-sidebar-collapse');
        if (!container) return;
        container.classList.toggle('sidebar-collapsed', !!collapsed);
        localStorage.setItem('sidebarCollapsed', collapsed ? 'true' : 'false');
        if (btn) {
            btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            // Expanded: arrow points outward (left) to collapse; collapsed: points right to expand.
            // Rebuild the <i> each time because lucide replaces it with an <svg> after rendering,
            // which would otherwise make querySelector('i') null and freeze the icon.
            const iconName = collapsed ? 'chevrons-right' : 'chevrons-left';
            btn.innerHTML = `<i data-lucide="${iconName}"></i>`;
            const titleKey = collapsed ? 'sidebar_expand' : 'sidebar_collapse';
            btn.setAttribute('data-i18n-title', titleKey);
            btn.title = window.i18n?.translate(titleKey) || btn.title;
            window.refreshLucideIcons?.(btn);
        }
        scheduleLayoutReflow();
    }

    function placeDashboardControls() {
        const controls = document.getElementById('dashboard-controls');
        const sidebarSlot = document.getElementById('sidebar-dashboard-actions');
        const tabsSlot = document.getElementById('dashboard-layout-actions');
        const topBarRight = document.querySelector('.top-bar-right');
        if (!controls) return;

        if (AppState.navPosition === 'topbar') {
            if (topBarRight && controls.parentNode !== topBarRight) {
                topBarRight.appendChild(controls);
            }
            tabsSlot?.classList.add('hidden');
            if (sidebarSlot) sidebarSlot.innerHTML = '';
        } else if (sidebarSlot) {
            if (controls.parentNode !== sidebarSlot) {
                sidebarSlot.appendChild(controls);
            }
            tabsSlot?.classList.add('hidden');
        }
        scheduleLayoutReflow();
    }

    function updateCollapseVisibility() {
        const btn = document.getElementById('btn-sidebar-collapse');
        if (!btn) return;
        const topbar = document.getElementById('app-container')?.classList.contains('topbar-layout');
        btn.style.display = topbar ? 'none' : '';
    }

    function initCollapse() {
        const btn = document.getElementById('btn-sidebar-collapse');
        if (!btn || btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';
        updateCollapseVisibility();
        const stored = localStorage.getItem('sidebarCollapsed') === 'true';
        applySidebarCollapsed(stored);
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = !document.getElementById('app-container')?.classList.contains('sidebar-collapsed');
            applySidebarCollapsed(next);
        });
    }

    function initUserMenu() {
        const profile = document.getElementById('user-profile');
        const dropdown = document.getElementById('user-profile-dropdown');
        if (!profile || !dropdown || profile.dataset.menuBound === '1') return;
        profile.dataset.menuBound = '1';

        const close = () => dropdown.classList.add('hidden');

        profile.addEventListener('click', (e) => {
            if (e.target.closest('#btn-logout')) return;
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
        });

        dropdown.addEventListener('click', (e) => e.stopPropagation());

        document.addEventListener('click', (e) => {
            if (profile.contains(e.target) || dropdown.contains(e.target)) return;
            close();
        });

        document.getElementById('btn-profile-open')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            window.location.hash = '#settings';
            if (window.SettingsPanel) {
                SettingsPanel.showTab('account');
            }
        });

        document.getElementById('btn-password-open')?.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
            window.location.hash = '#settings';
            if (window.SettingsPanel) {
                SettingsPanel.showTab('account');
            }
            setTimeout(() => {
                document.getElementById('profile-password-section')?.scrollIntoView({ behavior: 'smooth' });
            }, 200);
        });

        document.getElementById('btn-logout-menu')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            close();
            document.getElementById('btn-logout')?.click();
        });
    }

    window.SidebarUI = {
        init() {
            initCollapse();
            initUserMenu();
            placeDashboardControls();
            updateCollapseVisibility();
        },
        placeDashboardControls,
        applySidebarCollapsed,
        updateCollapseVisibility,
        reflowMainLayout,
        updateProfileAvatar(user) {
            const slot = document.getElementById('profile-avatar');
            if (!slot) return;
            const aid = user?.profile_asset_id;
            if (aid) {
                const src = `/api/assets/${aid}/file?t=${Date.now()}`;
                slot.innerHTML = `<img src="${src}" alt="" class="profile-avatar-img">`;
            } else {
                slot.innerHTML = '<i data-lucide="user"></i>';
            }
            const nameEl = document.getElementById('profile-username');
            if (nameEl) {
                nameEl.textContent = user.display_name || user.username || '';
                nameEl.title = user.username || '';
            }
            window.refreshLucideIcons?.(document.getElementById('user-profile'));
        },
    };

    document.addEventListener('DOMContentLoaded', () => {
        window.SidebarUI?.init();
        if (window.ToggleSwitch) {
            const appearance = document.querySelector('[data-settings-panel="appearance"]');
            if (appearance) {
                ToggleSwitch.enhance(appearance);
            }
        }
    });
})();
