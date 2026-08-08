// Core Application SPA Controller

// Escape HTML special characters to prevent XSS when interpolating
// user-controlled data into innerHTML template strings.
window.escapeHtml = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
};

// App State (Globally initialized)
window.AppState = {
    user: null,
    isEditingLayout: false,
    editingPublicLayout: false,
    activeSection: 'dashboard',
    modules: [],
    modulesReady: false,
    availableWidgets: [],
    theme: 'dark',
    navPosition: 'sidebar',
    locale: 'de-DE',
    activeTab: 'default',
    tabs: []
};
const AppState = window.AppState;

// Global registry for modular admin components
window.AdminRegistry = {
    _registry: {},
    register(moduleName, definition) {
        this._registry[moduleName] = definition;
        // If the admin section is active and visible, trigger render
        if (window.AppState && AppState.activeSection === 'admin') {
            this.renderAll();
        }
    },
    renderAll() {
        const container = document.getElementById('admin-custom-settings');
        if (!container) return;
        container.innerHTML = '';
        
        Object.keys(this._registry).forEach(moduleName => {
            const def = this._registry[moduleName];
            
            const card = document.createElement('div');
            card.className = 'card glass';
            
            const header = document.createElement('div');
            header.className = 'card-header';
            
            const iconName = def.icon || 'settings';
            header.innerHTML = `
                <i data-lucide="${iconName}" class="card-header-icon"></i>
                <h3>${def.title || moduleName}</h3>
            `;
            
            const body = document.createElement('div');
            body.className = 'card-body';
            
            card.appendChild(header);
            card.appendChild(body);
            container.appendChild(card);
            
            try {
                def.render(body);
            } catch (err) {
                body.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
            }
        });
        window.refreshLucideIcons();
    }
};

window.showToast = function(message, type = 'success') {
    let toast = document.getElementById('toast-container');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast-container';
        toast.className = 'toast-container';
        document.body.appendChild(toast);
    }
    
    toast.className = `toast-container toast-${type}`;
    
    let iconName = 'check-circle';
    if (type === 'error') {
        iconName = 'x-circle';
    } else if (type === 'info') {
        iconName = 'info';
    }
    
    // Escaped: showToast is routinely called with err.message, which carries
    // server- and integration-controlled text.
    toast.innerHTML = `
        <div class="toast-icon"><i data-lucide="${window.escapeHtml(iconName)}"></i></div>
        <div class="toast-message">${window.escapeHtml(message)}</div>
    `;
    
    if (window.lucide) {
        window.refreshLucideIcons();
    }
    
    toast.classList.add('show');
    
    if (window.toastTimeout) {
        clearTimeout(window.toastTimeout);
    }
    window.toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
};

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Layout & Theme from LocalStorage (fast load)
    const storedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', storedTheme);
    AppState.theme = storedTheme;
    const initialLink = document.getElementById('active-theme-link');
    if (initialLink) {
        initialLink.href = `/themes/${storedTheme}/${storedTheme}.css`;
    }

    // Performance mode: disable expensive blur/shadows/transitions
    const perfEnabled = localStorage.getItem('performanceMode') === 'true';
    if (perfEnabled) {
        document.documentElement.setAttribute('data-perf', 'true');
    }
    const perfToggle = document.getElementById('performance-mode');
    if (perfToggle) {
        perfToggle.checked = perfEnabled;
        perfToggle.addEventListener('change', (e) => {
            const enabled = !!e.target.checked;
            localStorage.setItem('performanceMode', enabled ? 'true' : 'false');
            if (enabled) {
                document.documentElement.setAttribute('data-perf', 'true');
            } else {
                document.documentElement.removeAttribute('data-perf');
            }
        });
    }

    const storedNav = localStorage.getItem('navPosition') || 'sidebar';
    AppState.navPosition = storedNav;
    document.getElementById('nav-position').value = storedNav;
    applyNavPosition(storedNav);

    // Setup translations
    const selectLang = document.getElementById('language-select');
    selectLang.value = window.i18n.currentLocale;
    selectLang.addEventListener('change', (e) => {
        window.i18n.setLocale(e.target.value);
    });

    // Number formatting preferences (decimal/thousands separators)
    const decimalSepSelect = document.getElementById('number-decimal-separator');
    const thousandSepSelect = document.getElementById('number-thousand-separator');
    const numberPref = {
        decimal: localStorage.getItem('numberDecimalSeparator') || 'auto',
        thousand: localStorage.getItem('numberThousandSeparator') || 'auto',
    };
    if (decimalSepSelect) decimalSepSelect.value = numberPref.decimal;
    if (thousandSepSelect) thousandSepSelect.value = numberPref.thousand;

    const resolveLocaleSeparators = () => {
        const parts = new Intl.NumberFormat(window.i18n?.currentLocale || 'de-DE').formatToParts(12345.67);
        return {
            decimal: parts.find(p => p.type === 'decimal')?.value || ',',
            group: parts.find(p => p.type === 'group')?.value || '.',
        };
    };

    window.NumberFormatSettings = {
        get() {
            return {
                decimal: localStorage.getItem('numberDecimalSeparator') || 'auto',
                thousand: localStorage.getItem('numberThousandSeparator') || 'auto',
            };
        },
    };

    window.formatNumber = function(value, opts = {}) {
        const num = Number(value);
        if (!Number.isFinite(num)) return String(value ?? '');
        const minimumFractionDigits = opts.minimumFractionDigits ?? 0;
        const maximumFractionDigits = opts.maximumFractionDigits ?? 0;
        const base = num.toLocaleString(window.i18n?.currentLocale || 'de-DE', {
            minimumFractionDigits,
            maximumFractionDigits,
        });
        const localeSep = resolveLocaleSeparators();
        const pref = window.NumberFormatSettings.get();
        const dec = pref.decimal === 'auto' ? localeSep.decimal : pref.decimal;
        const grp = pref.thousand === 'auto' ? localeSep.group : (pref.thousand === 'none' ? '' : pref.thousand);

        let out = base;
        if (localeSep.group && grp !== localeSep.group) {
            out = out.split(localeSep.group).join(grp);
        }
        if (localeSep.decimal && dec !== localeSep.decimal) {
            out = out.replace(localeSep.decimal, dec);
        }
        return out;
    };

    const onNumberPrefChange = () => {
        if (decimalSepSelect) localStorage.setItem('numberDecimalSeparator', decimalSepSelect.value);
        if (thousandSepSelect) localStorage.setItem('numberThousandSeparator', thousandSepSelect.value);
        const dashCtrl = window.getActiveDashboardController?.();
        if (dashCtrl && (AppState.activeSection === 'dashboard' || AppState.activeSection === 'mobile-dashboard')) {
            dashCtrl.loadWidgets({ soft: true });
        }
    };
    if (decimalSepSelect) decimalSepSelect.addEventListener('change', onNumberPrefChange);
    if (thousandSepSelect) thousandSepSelect.addEventListener('change', onNumberPrefChange);

    // --- Navigation Routing (SPA Router) ---
    function navigateToSection() {
        const hash = window.location.hash || '#dashboard';
        const sectionId = hash.substring(1);
        
        // Map target names to section IDs
        let targetId = 'dashboard';
        if (['dashboard', 'mobile-dashboard', 'favorites', 'integrations', 'settings', 'admin'].includes(sectionId)) {
            targetId = sectionId;
        }
        
        AppState.activeSection = targetId;

        // Gate the (now section-external) tab background layers on the active section
        const appMainEl = document.getElementById('app-main');
        if (appMainEl) {
            appMainEl.dataset.dashSection = (targetId === 'dashboard' || targetId === 'mobile-dashboard') ? targetId : '';
        }

        // Hide all sections, show active (avoid flicker if section already active)
        const activeSec = document.getElementById(`section-${targetId}`);
        document.querySelectorAll('.app-section').forEach(sec => {
            if (sec !== activeSec) {
                sec.classList.remove('active');
            }
        });
        if (activeSec) {
            activeSec.classList.add('active');
        }
        
        // Update Nav Menu highlight
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('data-nav') === targetId) {
                item.classList.add('active');
            }
        });
        
        // Update Title text
        let titleKey = null;
        if (targetId === 'integrations') {
            titleKey = null;
        } else if (targetId === 'mobile-dashboard') {
            titleKey = 'nav_mobile_dashboard';
        } else {
            titleKey = `nav_${targetId}`;
        }
        const titleEl = document.getElementById('page-title');
        if (titleKey) {
            titleEl.setAttribute('data-i18n', titleKey);
            titleEl.textContent = window.i18n.translate(titleKey);
        } else if (targetId === 'integrations') {
            titleEl.removeAttribute('data-i18n');
            titleEl.setAttribute('data-i18n', 'nav_integrations');
            titleEl.textContent = window.i18n.translate('nav_integrations');
        }
        
        // Toggle view specific controllers
        if (targetId === 'dashboard' || targetId === 'mobile-dashboard') {
            document.getElementById('dashboard-controls')?.classList.remove('hidden');
            window.SidebarUI?.placeDashboardControls?.();
            if (window.tryInitDashboard) {
                window.tryInitDashboard();
            }
        } else {
            document.getElementById('dashboard-controls')?.classList.add('hidden');
        }

        if (targetId === 'favorites') {
            if (window.FavoritesController) {
                window.FavoritesController.loadFavorites();
            }
        }

        if (targetId === 'integrations') {
            if (window.IntegrationsController) {
                IntegrationsController.load();
            }
        }

        if (targetId === 'settings') {
            loadUserMediaSettings();
        }
        
        if (targetId === 'admin') {
            loadGlobalSettings();
        }
        
        closeMobileSidebar();
    }

    window.addEventListener('hashchange', navigateToSection);

    const MOBILE_NAV_MQ = window.matchMedia('(max-width: 992px)');

    function isMobileNavDrawer() {
        return MOBILE_NAV_MQ.matches;
    }

    function closeMobileSidebar() {
        const sidebar = document.getElementById('app-sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (!sidebar) return;
        sidebar.classList.remove('open');
        backdrop?.classList.remove('open');
        document.body.classList.remove('mobile-sidebar-open');
    }

    function openMobileSidebar() {
        if (!isMobileNavDrawer()) return;
        document.getElementById('app-sidebar')?.classList.add('open');
        document.getElementById('sidebar-backdrop')?.classList.add('open');
        document.body.classList.add('mobile-sidebar-open');
    }

    window.closeMobileSidebar = closeMobileSidebar;

    // Sidebar toggle (mobile drawer)
    const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const appSidebar = document.getElementById('app-sidebar');
    const appMain = document.getElementById('app-main');

    btnSidebarToggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (appSidebar?.classList.contains('open')) {
            closeMobileSidebar();
        } else {
            openMobileSidebar();
        }
    });

    sidebarBackdrop?.addEventListener('click', closeMobileSidebar);

    appSidebar?.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    appMain?.addEventListener('click', () => {
        if (appSidebar?.classList.contains('open')) {
            closeMobileSidebar();
        }
    });

    document.querySelectorAll('.sidebar-nav .nav-item').forEach((item) => {
        item.addEventListener('click', () => {
            closeMobileSidebar();
            // Leaving the public-layout editor via the nav must restore the user's
            // own dashboard immediately — the hash often stays '#dashboard', so no
            // hashchange fires and a manual reset/re-init is required (avoids needing F5).
            if (AppState.editingPublicLayout) {
                const nav = item.getAttribute('data-nav');
                if (nav === 'dashboard' || nav === 'mobile-dashboard') {
                    window.DashboardController?.exitPublicLayout?.();
                } else {
                    AppState.editingPublicLayout = false;
                    AppState.isEditingLayout = false;
                }
            }
        });
    });

    MOBILE_NAV_MQ.addEventListener('change', (e) => {
        if (!e.matches) {
            closeMobileSidebar();
        }
    });

    window.addEventListener('resize', () => {
        if (!isMobileNavDrawer()) {
            closeMobileSidebar();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !appSidebar?.classList.contains('open') || !isMobileNavDrawer()) {
            return;
        }
        const openOverlay = document.querySelector('.modal-overlay.open, .panel-overlay.open');
        if (openOverlay) return;
        closeMobileSidebar();
    });

    function getWallpaperOptions() {
        return {
            opacity: parseInt(localStorage.getItem('wallpaperOpacity') || '100', 10),
            size: localStorage.getItem('wallpaperSize') || 'cover',
            position: localStorage.getItem('wallpaperPosition') || 'center',
            fixed: localStorage.getItem('wallpaperFixed') !== 'false',
        };
    }

    function applyWallpaper(type, customUrl = '') {
        const body = document.body;
        const opts = getWallpaperOptions();
        const opacity = Math.min(100, Math.max(10, opts.opacity)) / 100;
        const size = opts.size || 'cover';
        const position = opts.position || 'center';
        const attachment = opts.fixed ? 'fixed' : 'scroll';

        let imageUrl = '';
        if (type === 'library') {
            const assetId = localStorage.getItem('wallpaperAssetId');
            imageUrl = assetId ? `/api/assets/${assetId}/file` : '';
        } else if (type === 'custom' || type === 'upload') {
            imageUrl = customUrl || localStorage.getItem('wallpaperUrl') || '';
        } else if (type === 'unsplash_nature') {
            imageUrl = 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=1920&auto=format&fit=crop&q=80';
        } else if (type === 'unsplash_space') {
            imageUrl = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&auto=format&fit=crop&q=80';
        } else if (type === 'unsplash_abstract') {
            imageUrl = 'https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=1920&auto=format&fit=crop&q=80';
        }

        if (!imageUrl || type === 'none') {
            body.classList.remove('has-wallpaper');
            body.style.removeProperty('--wallpaper-image');
            body.style.removeProperty('--wallpaper-position-type');
            body.style.backgroundImage = '';
            body.style.backgroundSize = '';
            body.style.backgroundPosition = '';
            body.style.backgroundRepeat = '';
            body.style.backgroundAttachment = '';
            return;
        }

        body.classList.add('has-wallpaper');
        body.style.setProperty('--wallpaper-image', `url("${imageUrl.replace(/"/g, '\\"')}")`);
        body.style.setProperty('--wallpaper-opacity', String(opacity));
        body.style.setProperty('--wallpaper-size', size);
        body.style.setProperty('--wallpaper-position', position);
        body.style.setProperty('--wallpaper-position-type', opts.fixed ? 'fixed' : 'absolute');
        body.style.backgroundImage = '';
        body.style.backgroundSize = '';
        body.style.backgroundPosition = '';
        body.style.backgroundRepeat = '';
        body.style.backgroundAttachment = attachment;
    }

    window.applyWallpaper = applyWallpaper;

    // Initialize wallpaper from storage
    const storedWpType = localStorage.getItem('wallpaperType') || 'none';
    const storedWpUrl = localStorage.getItem('wallpaperUrl') || '';
    applyWallpaper(storedWpType, storedWpUrl);

    // Populate selectors
    const selectWp = document.getElementById('wallpaper-select');
    const inputWpUrl = document.getElementById('wallpaper-url-input');
    const wpUrlGroup = document.getElementById('wallpaper-url-group');
    const wpFileGroup = document.getElementById('wallpaper-file-group');
    const wpLibraryGroup = document.getElementById('wallpaper-library-group');
    const wpOptionsGroup = document.getElementById('wallpaper-options-group');
    const wpOpacity = document.getElementById('wallpaper-opacity');
    const wpSize = document.getElementById('wallpaper-size');
    const wpPosition = document.getElementById('wallpaper-position');
    const wpFixed = document.getElementById('wallpaper-fixed');
    const wpFileInput = document.getElementById('wallpaper-file-input');

    function toggleWallpaperGroups(type) {
        const showCustom = type === 'custom' || type === 'upload' || type === 'library';
        if (wpUrlGroup) wpUrlGroup.classList.toggle('hidden', type !== 'custom');
        if (wpFileGroup) wpFileGroup.classList.toggle('hidden', type !== 'upload');
        if (wpLibraryGroup) wpLibraryGroup.classList.toggle('hidden', type !== 'library');
        if (wpOptionsGroup) wpOptionsGroup.classList.toggle('hidden', type === 'none');
    }

    async function initWallpaperLibraryPicker() {
        const host = document.getElementById('wallpaper-library-picker');
        if (!host || !window.AssetLibrary) return;
        const selected = localStorage.getItem('wallpaperAssetId');
        await AssetLibrary.renderPicker(host, {
            category: 'background',
            selectedValue: selected,
            showGlobalToggle: false,
            onSelect: (assetId) => {
                localStorage.setItem('wallpaperAssetId', assetId);
                localStorage.setItem('wallpaperType', 'library');
                if (selectWp) selectWp.value = 'library';
                applyWallpaper('library');
            },
        });
    }

    if (selectWp) {
        selectWp.value = storedWpType;
        toggleWallpaperGroups(storedWpType);
        if (inputWpUrl) inputWpUrl.value = storedWpUrl;
        if (wpOpacity) wpOpacity.value = localStorage.getItem('wallpaperOpacity') || '100';
        if (wpSize) wpSize.value = localStorage.getItem('wallpaperSize') || 'cover';
        if (wpPosition) wpPosition.value = localStorage.getItem('wallpaperPosition') || 'center';
        if (wpFixed) wpFixed.checked = localStorage.getItem('wallpaperFixed') !== 'false';
        if (storedWpType === 'library') {
            initWallpaperLibraryPicker();
        }

        selectWp.addEventListener('change', (e) => {
            const type = e.target.value;
            localStorage.setItem('wallpaperType', type);
            toggleWallpaperGroups(type);
            if (type === 'library') {
                initWallpaperLibraryPicker();
            }
            applyWallpaper(type, inputWpUrl ? inputWpUrl.value : '');
        });

        if (inputWpUrl) {
            inputWpUrl.addEventListener('input', (e) => {
                const url = e.target.value.trim();
                localStorage.setItem('wallpaperUrl', url);
                applyWallpaper('custom', url);
            });
        }

        const persistWallpaperOpts = () => applyWallpaper(selectWp.value, inputWpUrl ? inputWpUrl.value : '');
        if (wpOpacity) {
            wpOpacity.addEventListener('input', () => {
                localStorage.setItem('wallpaperOpacity', wpOpacity.value);
                persistWallpaperOpts();
            });
        }
        if (wpSize) {
            wpSize.addEventListener('change', () => {
                localStorage.setItem('wallpaperSize', wpSize.value);
                persistWallpaperOpts();
            });
        }
        if (wpPosition) {
            wpPosition.addEventListener('change', () => {
                localStorage.setItem('wallpaperPosition', wpPosition.value);
                persistWallpaperOpts();
            });
        }
        if (wpFixed) {
            wpFixed.addEventListener('change', () => {
                localStorage.setItem('wallpaperFixed', wpFixed.checked ? 'true' : 'false');
                persistWallpaperOpts();
            });
        }
        if (wpFileInput) {
            wpFileInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    localStorage.setItem('wallpaperUrl', reader.result);
                    localStorage.setItem('wallpaperType', 'upload');
                    selectWp.value = 'upload';
                    toggleWallpaperGroups('upload');
                    applyWallpaper('upload', reader.result);
                };
                reader.readAsDataURL(file);
            });
        }
    }

    function applyThemeStyle(themeId) {
        document.documentElement.setAttribute('data-theme', themeId);
        AppState.theme = themeId;
        localStorage.setItem('theme', themeId);

        const link = document.getElementById('active-theme-link');
        const customPanel = document.getElementById('custom-theme-panel');
        if (customPanel) {
            customPanel.classList.toggle('hidden', themeId !== 'custom');
        }

        if (themeId === 'custom') {
            if (link) {
                link.href = '/themes/dark/dark.css';
            }
            if (AppState.user) {
                API.getUserProfile()
                    .then((d) => window.applyCustomThemeFromPrefs?.(d.preferences))
                    .catch(() => {});
            }
        } else {
            document.getElementById('user-custom-theme-style')?.remove();
            if (link) {
                link.href = `/themes/${themeId}/${themeId}.css`;
            }
        }
        
        const oldScript = document.getElementById('theme-dynamic-script');
        if (oldScript) {
            oldScript.remove();
        }
        
        const themeObj = window.AppState.availableThemes && window.AppState.availableThemes.find(t => t.id === themeId);
        if (themeObj && themeObj.js_file) {
            const script = document.createElement('script');
            script.id = 'theme-dynamic-script';
            script.src = themeObj.js_file;
            document.body.appendChild(script);
        }
    }

    // Theme selector change
    document.getElementById('theme-select').addEventListener('change', (e) => {
        const theme = e.target.value;
        applyThemeStyle(theme);
        localStorage.setItem('theme', theme);
    });

    // Menu Position change
    document.getElementById('nav-position').addEventListener('change', (e) => {
        const position = e.target.value;
        applyNavPosition(position);
    });

    // Layout Export Button
    const btnExport = document.getElementById('btn-export-layout');
    if (btnExport) {
        btnExport.addEventListener('click', async () => {
            try {
                const data = await API.exportLayout();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `homy_backup_${new Date().toISOString().slice(0,10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast(window.i18n.translate('layout_export_success'), 'success');
            } catch (err) {
                showToast(window.i18n.translate('layout_export_error', { message: err.message }), 'error');
            }
        });
    }

    // Layout Import trigger and file handling
    const btnImportTrigger = document.getElementById('btn-import-trigger');
    const importFileInput = document.getElementById('import-file-input');
    if (btnImportTrigger && importFileInput) {
        btnImportTrigger.addEventListener('click', () => {
            importFileInput.click();
        });

        importFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const data = JSON.parse(evt.target.result);
                    if (!data.widgets || !data.tabs) {
                        throw new Error("Ungültiges Backup-Format (widgets oder tabs fehlen).");
                    }

                    if (await showAppConfirm(
                        window.i18n.translate('layout_import_confirm'),
                        { title: 'Backup einspielen', danger: true, confirmLabel: 'Einspielen' }
                    )) {
                        await API.importLayout(data);
                        showToast(window.i18n.translate('layout_import_success'), 'success');
                        // Reset file input
                        importFileInput.value = '';
                        // Redirect to dashboard and reload
                        window.location.hash = '#dashboard';
                        if (window.DashboardController) {
                            window.DashboardController.initDashboard();
                        }
                    }
                } catch (err) {
                    showToast(window.i18n.translate('layout_import_error', { message: err.message }), 'error');
                    importFileInput.value = '';
                }
            };
            reader.readAsText(file);
        });
    }

    function applyNavPosition(pos) {
        const container = document.getElementById('app-container');
        const dashboardControls = document.getElementById('dashboard-controls');
        
        if (pos === 'topbar') {
            container.classList.add('topbar-layout');
            const sidebar = document.getElementById('app-sidebar');
            const footer = sidebar ? sidebar.querySelector('.sidebar-footer') : null;
            if (sidebar && footer && dashboardControls) {
                sidebar.insertBefore(dashboardControls, footer);
            }
        } else {
            container.classList.remove('topbar-layout');
            const topBarRight = document.querySelector('.top-bar-right');
            if (topBarRight && dashboardControls) {
                topBarRight.appendChild(dashboardControls);
            }
        }
        localStorage.setItem('navPosition', pos);
        AppState.navPosition = pos;
        closeMobileSidebar();
        window.SidebarUI?.placeDashboardControls?.();
        window.SidebarUI?.updateCollapseVisibility?.();
        window.SidebarUI?.reflowMainLayout?.();
        window.refreshLucideIcons();
    }

    window.applySiteBranding = function applySiteBranding(policy) {
        const title = policy?.siteTitle || 'Homy';
        const logoUrl = policy?.siteLogoUrl || '';
        const brandText = document.querySelector('.sidebar-brand .brand-text');
        const brandIcon = document.querySelector('.sidebar-brand .brand-icon');
        const brandLogo = document.getElementById('site-brand-logo');
        if (brandText) brandText.textContent = title;
        if (brandLogo) {
            if (logoUrl) {
                brandLogo.src = logoUrl;
                brandLogo.classList.remove('hidden');
                brandIcon?.classList.add('hidden');
            } else {
                brandLogo.classList.add('hidden');
                brandLogo.removeAttribute('src');
                brandIcon?.classList.remove('hidden');
            }
        }
    }

    // --- Authentication Flow ---
    const loginModal = document.getElementById('login-modal');
    const authForm = document.getElementById('auth-form');
    const btnAuthSubmit = document.getElementById('btn-auth-submit');
    const btnAuthToggle = document.getElementById('btn-auth-toggle');
    const authMsg = document.getElementById('auth-message');
    let isRegistering = false;

    // Modal close: backdrop click, Escape, .btn-close-* — see modal_util.js

    document.getElementById('btn-login-trigger').addEventListener('click', () => {
        showLoginModal();
    });

    const pwdResetModal = document.getElementById('password-reset-modal');
    let pwdResetStep = 'request';
    document.getElementById('btn-forgot-password')?.addEventListener('click', () => {
        loginModal.classList.remove('open');
        pwdResetStep = 'request';
        document.getElementById('pwd-reset-code-group')?.classList.add('hidden');
        document.getElementById('pwd-reset-new-group')?.classList.add('hidden');
        document.getElementById('pwd-reset-message')?.classList.add('hidden');
        pwdResetModal?.classList.add('open');
    });
    pwdResetModal?.querySelectorAll('.btn-close-pwd-reset').forEach((btn) => {
        btn.addEventListener('click', () => pwdResetModal.classList.remove('open'));
    });
    document.getElementById('password-reset-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ident = document.getElementById('pwd-reset-identifier')?.value?.trim();
        const msgEl = document.getElementById('pwd-reset-message');
        const submitBtn = document.getElementById('btn-pwd-reset-submit');
        try {
            if (pwdResetStep === 'request') {
                const res = await API.passwordResetRequest(ident);
                const key = res.message_key || 'password_reset_sent_generic';
                msgEl.textContent = window.i18n.translate(key);
                msgEl.className = 'alert alert-success';
                msgEl.classList.remove('hidden');
                pwdResetStep = 'confirm';
                document.getElementById('pwd-reset-code-group')?.classList.remove('hidden');
                document.getElementById('pwd-reset-new-group')?.classList.remove('hidden');
                if (submitBtn) submitBtn.textContent = window.i18n.translate('password_reset_confirm_btn');
            } else {
                await API.passwordResetConfirm(
                    ident,
                    document.getElementById('pwd-reset-code')?.value,
                    document.getElementById('pwd-reset-new')?.value,
                );
                showToast(window.i18n.translate('password_reset_success'), 'success');
                pwdResetModal.classList.remove('open');
                showLoginModal();
            }
        } catch (err) {
            const key = err.data?.message_key;
            msgEl.textContent = key ? window.i18n.translate(key) : err.message;
            msgEl.className = 'alert alert-danger';
            msgEl.classList.remove('hidden');
        }
    });

    function updateAuthToggleVisibility() {
        if (!btnAuthToggle) return;
        const regEnabled = AppState.authPolicy?.registrationEnabled === true;
        if (regEnabled) {
            btnAuthToggle.classList.remove('hidden');
        } else {
            btnAuthToggle.classList.add('hidden');
            isRegistering = false;
        }
    }

    function showLoginModal() {
        isRegistering = false;
        mfaStepActive = false;
        authMfaGroup?.classList.add('hidden');
        const pwd = document.getElementById('auth-password');
        if (pwd) pwd.disabled = false;
        authForm.reset();
        authMsg.classList.add('hidden');
        document.getElementById('auth-modal-title').setAttribute('data-i18n', 'auth_login_title');
        btnAuthSubmit.setAttribute('data-i18n', 'btn_login');
        btnAuthToggle.setAttribute('data-i18n', 'auth_toggle_register');
        updateAuthToggleVisibility();
        window.i18n.translateDOM();
        loginModal.classList.add('open');
    }

    btnAuthToggle.addEventListener('click', (e) => {
        e.preventDefault();
        isRegistering = !isRegistering;
        authMsg.classList.add('hidden');
        if (isRegistering) {
            document.getElementById('auth-modal-title').setAttribute('data-i18n', 'auth_register_title');
            btnAuthSubmit.setAttribute('data-i18n', 'btn_save');
            btnAuthToggle.setAttribute('data-i18n', 'auth_toggle_login');
        } else {
            document.getElementById('auth-modal-title').setAttribute('data-i18n', 'auth_login_title');
            btnAuthSubmit.setAttribute('data-i18n', 'btn_login');
            btnAuthToggle.setAttribute('data-i18n', 'auth_toggle_register');
        }
        window.i18n.translateDOM();
    });

    let mfaStepActive = false;
    const authMfaGroup = document.getElementById('auth-mfa-group');

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('auth-username').value.trim();
        const password = document.getElementById('auth-password').value;

        try {
            authMsg.classList.add('hidden');
            let res;

            if (mfaStepActive) {
                const code = document.getElementById('auth-mfa-code').value.trim();
                res = await API.verifyMfa(code);
            } else if (isRegistering) {
                if (!username || !password) return;
                res = await API.register(username, password);
                if (res.success) res = await API.login(username, password);
            } else {
                if (!username || !password) return;
                res = await API.login(username, password);
            }

            if (res.mfa_required) {
                mfaStepActive = true;
                authMfaGroup?.classList.remove('hidden');
                document.getElementById('auth-password').disabled = true;
                btnAuthSubmit.textContent = window.i18n.translate('auth_mfa_submit');
                authMsg.textContent = window.i18n.translate('auth_mfa_hint');
                authMsg.className = 'alert alert-info';
                authMsg.classList.remove('hidden');
                return;
            }

            if (res.success) {
                mfaStepActive = false;
                authMfaGroup?.classList.add('hidden');
                document.getElementById('auth-password').disabled = false;
                loginModal.classList.remove('open');
                await checkAuthStatus();
                if (window.DashboardController) {
                    window.DashboardController.initDashboard();
                }
            }
        } catch (err) {
            authMsg.textContent = err.message;
            authMsg.className = 'alert alert-danger';
            authMsg.classList.remove('hidden');
        }
    });

    // Setup form submit listener
    const setupForm = document.getElementById('setup-form');
    const setupModal = document.getElementById('setup-modal');
    if (setupForm) {
        setupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('setup-username').value.trim();
            const password = document.getElementById('setup-password').value;
            const confirmPass = document.getElementById('setup-confirm-password').value;
            const setupMsg = document.getElementById('setup-message');
            
            if (!username || !password || !confirmPass) return;
            
            if (password !== confirmPass) {
                setupMsg.textContent = window.i18n.translate('setup_password_mismatch');
                setupMsg.className = "alert alert-danger";
                setupMsg.classList.remove('hidden');
                return;
            }
            
            try {
                setupMsg.classList.add('hidden');
                const res = await API.setup(username, password);
                if (res.success) {
                    setupModal.classList.remove('open');
                    await checkAuthStatus();
                    // Reload dashboard
                    if (window.DashboardController) {
                        window.DashboardController.initDashboard();
                    }
                }
            } catch (err) {
                setupMsg.textContent = err.message;
                setupMsg.className = "alert alert-danger";
                setupMsg.classList.remove('hidden');
            }
        });
    }

    document.getElementById('btn-logout').addEventListener('click', async () => {
        try {
            await API.logout();
            await checkAuthStatus();
            if (window.DashboardController) {
                window.DashboardController.initDashboard();
            }
            window.location.hash = '#dashboard';
        } catch (err) {
            console.error("Logout failed:", err);
        }
    });

    async function checkAuthStatus() {
        try {
            const data = await API.checkAuth();
            const sidebarFooter = document.querySelector('.sidebar-footer');
            const userProfile = document.getElementById('user-profile');
            const btnLoginTrigger = document.getElementById('btn-login-trigger');
            const navAdmin = document.getElementById('nav-admin');
            const btnEditDashboard = document.getElementById('btn-edit-dashboard');

            // Handle Setup/First Start modal overlay
            AppState.authPolicy = {
                registrationEnabled: !!data.registration_enabled,
                maintenanceMode: !!data.maintenance_mode,
                siteTitle: data.site_title || 'Homy',
                defaultLocale: data.default_locale || 'de-DE',
                siteLogoUrl: data.site_logo_url || '',
            };
            applySiteBranding(AppState.authPolicy);
            if (data.site_title) {
                document.title = data.site_title;
            }
            if (data.default_locale && window.i18n && !localStorage.getItem('locale')) {
                window.i18n.setLocale(data.default_locale);
                const langSel = document.getElementById('language-select');
                if (langSel) langSel.value = data.default_locale;
            }
            window.updateAuthToggleVisibility?.();
            const oidcHint = document.getElementById('auth-oidc-hint');
            if (oidcHint) {
                oidcHint.classList.toggle('hidden', !data.auth_oidc_enabled);
            }

            if (data.needs_setup) {
                setupModal.classList.add('open');
            } else {
                setupModal.classList.remove('open');
            }

            if (data.logged_in) {
                AppState.user = data.user;
                window.SidebarUI?.updateProfileAvatar?.(data.user);

                const roleKey = `role_${data.user.role}`;
                document.getElementById('profile-role').setAttribute('data-i18n', roleKey);
                document.getElementById('profile-role').textContent = window.i18n.translate(roleKey);
                
                userProfile.classList.remove('hidden');
                btnLoginTrigger.classList.add('hidden');
                
                // Non-blocking: this only toggles one button, so it must not sit in
                // the critical path between auth and the first dashboard paint.
                btnEditDashboard?.classList.remove('hidden');
                API.request('/api/admin/layout-lock')
                    .then((lockRes) => {
                        if (lockRes?.locked && data.user.role !== 'admin') {
                            btnEditDashboard?.classList.add('hidden');
                        }
                    })
                    .catch(() => { /* keep the button visible on failure */ });

                if (data.user.role === 'admin') {
                    navAdmin.classList.remove('hidden');
                } else {
                    navAdmin.classList.add('hidden');
                }
                
                renderAccountSettingsCard(true);
            } else {
                AppState.user = null;
                userProfile.classList.add('hidden');
                btnLoginTrigger.classList.remove('hidden');
                navAdmin.classList.add('hidden');
                btnEditDashboard.classList.add('hidden');
                
                renderAccountSettingsCard(false);
            }
            
            window.i18n.translateDOM();
            // Scope icon scan to the sidebar/nav area only
            lucide.createIcons({ nodes: document.getElementById('app-sidebar').querySelectorAll('[data-lucide]') });
        } catch (err) {
            console.error("Failed to check auth status:", err);
        }
    }

    function renderAccountSettingsCard(isLoggedIn) {
        const container = document.getElementById('settings-auth-status');
        if (!container) return;
        
        if (isLoggedIn) {
            if (typeof window.loadUserProfileSettings === 'function') {
                window.loadUserProfileSettings();
            }
        } else {
            container.innerHTML = `
                <div class="alert alert-danger" style="margin-bottom: 20px;">
                    <i data-lucide="info" style="vertical-align: middle; width: 18px; height: 18px;"></i>
                    <span style="vertical-align: middle;" data-i18n="status_logged_out">${window.i18n.translate('status_logged_out')}</span>
                </div>
                <button id="btn-settings-login" class="btn btn-primary">
                    <i data-lucide="log-in"></i>
                    <span data-i18n="btn_login">${window.i18n.translate('btn_login')}</span>
                </button>
            `;
            
            const btn = document.getElementById('btn-settings-login');
            if (btn) {
                btn.addEventListener('click', showLoginModal);
            }
        }
        lucide.createIcons({ nodes: container.querySelectorAll('[data-lucide]') });

        const mediaCard = document.getElementById('user-media-card');
        if (mediaCard) {
            mediaCard.classList.toggle('hidden', !isLoggedIn);
        }
        if (typeof window.loadUserNotifications === 'function') {
            window.loadUserNotifications();
        }
        if (isLoggedIn) {
            loadUserMediaSettings();
        }
    }

    async function loadUserMediaSettings() {
        const host = document.getElementById('user-media-manager');
        if (!host || !window.AssetLibrary || !AppState.user) return;
        await AssetLibrary.renderAssetManager(host, { categories: ['icon', 'background'] });
    }
    window.loadUserMediaSettings = loadUserMediaSettings;

    // Admin Module Management Rendering
    async function loadAdminModules() {
        const modulesListContainer = document.getElementById('admin-modules-list');
        if (!modulesListContainer) return;
        
        modulesListContainer.innerHTML = '<div class="spinner"></div>';
        
        try {
            const modules = await API.adminGetModules();
            modulesListContainer.innerHTML = '';
            
            modules.forEach(m => {
                const item = document.createElement('div');
                item.className = 'admin-module-row';

                const meta = document.createElement('div');
                meta.className = 'admin-module-meta';
                const esc = window.escapeHtml;
                meta.innerHTML = `
                    <div class="admin-module-name">${esc(m.name)} <span class="muted-text">v${esc(m.version)}</span></div>
                    <div class="admin-module-desc">${esc(m.description || m.id)}</div>
                `;

                const switchLabel = document.createElement('label');
                switchLabel.className = 'switch';
                
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = m.enabled;
                input.style.opacity = '0';
                input.style.width = '0';
                input.style.height = '0';
                
                const slider = document.createElement('span');
                slider.style.position = 'absolute';
                slider.style.cursor = 'pointer';
                slider.style.top = '0';
                slider.style.left = '0';
                slider.style.right = '0';
                slider.style.bottom = '0';
                slider.style.backgroundColor = input.checked ? 'var(--success)' : '#4b5563';
                slider.style.transition = '.3s';
                slider.style.borderRadius = '20px';
                
                const knob = document.createElement('span');
                knob.style.position = 'absolute';
                knob.style.content = '""';
                knob.style.height = '14px';
                knob.style.width = '14px';
                knob.style.left = input.checked ? '22px' : '3px';
                knob.style.bottom = '3px';
                knob.style.backgroundColor = 'white';
                knob.style.transition = '.3s';
                knob.style.borderRadius = '50%';
                
                slider.appendChild(knob);
                switchLabel.appendChild(input);
                switchLabel.appendChild(slider);
                
                input.onchange = async () => {
                    input.disabled = true;
                    try {
                        const res = await API.adminToggleModule(m.id, input.checked);
                        if (res.success) {
                            slider.style.backgroundColor = input.checked ? 'var(--success)' : '#4b5563';
                            knob.style.left = input.checked ? '22px' : '3px';
                            // Reload modules list in AppState
                            const data = await API.getModules();
                            AppState.modules = data.modules;
                            AppState.availableWidgets = data.widgets;
                            
                            if (window.DashboardController) {
                                window.DashboardController.loadWidgets({ soft: true });
                            }
                        }
                    } catch (err) {
                        showToast(window.i18n.translate('admin_error', { message: err.message }), 'error');
                        input.checked = !input.checked;
                    } finally {
                        input.disabled = false;
                    }
                };
                
                item.appendChild(meta);
                item.appendChild(switchLabel);
                modulesListContainer.appendChild(item);
            });
        } catch (err) {
            modulesListContainer.innerHTML = `<div class="alert alert-danger">Error: ${err.message}</div>`;
        }
    }

    window.loadAdminModules = loadAdminModules;

    async function loadGlobalSettings() {
        if (!AppState.user || AppState.user.role !== 'admin') return;
        if (window.AdminPanel) {
            await AdminPanel.loadAll();
        }
    }

    // Listen to tab clicks to load admin settings
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const nav = item.getAttribute('data-nav');
            if (nav === 'admin') {
                loadGlobalSettings();
            }
        });
    });

    // --- Global Search Launcher ---
    const SearchLauncher = {
        isOpen: false,
        items: [],
        activeIndex: 0,
        
        init() {
            const modal = document.getElementById('search-launcher-modal');
            const input = document.getElementById('search-launcher-input');
            const closeBtn = document.getElementById('btn-close-search');
            
            if (!modal || !input) return;
            
            // Toggle visibility via keybinds
            window.addEventListener('keydown', (e) => {
                if (e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'k')) {
                    const active = document.activeElement;
                    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
                        return;
                    }
                    e.preventDefault();
                    this.open();
                } else if (e.key === 'Escape' && this.isOpen) {
                    this.close();
                }
            });
            
            // Input event for live search
            input.addEventListener('input', () => {
                this.renderResults();
            });
            
            // Keyboard navigation within suggestions
            input.addEventListener('keydown', (e) => {
                if (!this.isOpen) return;
                
                const resultsContainer = document.getElementById('search-launcher-results');
                const resultEls = resultsContainer.querySelectorAll('.search-launcher-item');
                
                if (resultEls.length === 0) return;
                
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.activeIndex = (this.activeIndex + 1) % resultEls.length;
                    this.updateActiveItem(resultEls);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.activeIndex = (this.activeIndex - 1 + resultEls.length) % resultEls.length;
                    this.updateActiveItem(resultEls);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const activeEl = resultEls[this.activeIndex];
                    if (activeEl) {
                        activeEl.click();
                    }
                }
            });
            
            // Close buttons
            if (closeBtn) {
                closeBtn.onclick = () => this.close();
            }
            modal.onclick = (e) => {
                if (e.target === modal) this.close();
            };
        },
        
        async open() {
            if (this.isOpen) return;
            this.isOpen = true;
            
            const modal = document.getElementById('search-launcher-modal');
            const input = document.getElementById('search-launcher-input');
            
            modal.classList.add('open');
            input.value = '';
            this.activeIndex = 0;
            
            // Build the search index dynamically
            await this.buildIndex();
            
            this.renderResults();
            setTimeout(() => input.focus(), 50);
        },
        
        close() {
            if (!this.isOpen) return;
            this.isOpen = false;
            document.getElementById('search-launcher-modal').classList.remove('open');
        },
        
        async buildIndex() {
            this.items = [];
            const layout = window.DashboardController ? window.DashboardController.currentLayout : 'auto';
            
            // 1. Navigation Pages
            this.items.push({
                type: 'nav',
                title: window.i18n.translate('nav_dashboard'),
                subtitle: 'Bereich wechseln',
                target: '#dashboard',
                icon: 'grid'
            });
            this.items.push({
                type: 'nav',
                title: window.i18n.translate('nav_favorites'),
                subtitle: 'Bereich wechseln',
                target: '#favorites',
                icon: 'star'
            });
            this.items.push({
                type: 'nav',
                title: window.i18n.translate('nav_settings'),
                subtitle: 'Bereich wechseln',
                target: '#settings',
                icon: 'settings'
            });
            if (AppState.user && AppState.user.role === 'admin') {
                this.items.push({
                    type: 'nav',
                    title: window.i18n.translate('nav_admin'),
                    subtitle: 'Bereich wechseln',
                    target: '#admin',
                    icon: 'shield-check'
                });
            }
            
            // 2. Tabs (from dashboard layout)
            if (AppState.tabs && AppState.tabs.length > 0) {
                AppState.tabs.forEach(tab => {
                    this.items.push({
                        type: 'tab',
                        title: `Tab: ${tab.name}`,
                        subtitle: window.i18n.translate('search_subtitle_tab'),
                        target: tab.id,
                        icon: 'layout-list'
                    });
                });
            }
            
            // 3. Favorites / Links
            try {
                const favs = await API.getFavorites(layout);
                favs.forEach(f => {
                    this.items.push({
                        type: 'favorite',
                        title: f.title,
                        subtitle: f.url,
                        target: f.url,
                        icon: f.icon_type === 'image' ? f.icon_value : (f.icon_value || 'link'),
                        iconType: f.icon_type,
                        is_private: f.is_private
                    });
                });
            } catch (err) {
                console.error("Search index failed to load favorites:", err);
            }
            
            // 4. Widgets
            try {
                const widgets = await API.getWidgets(layout);
                widgets.forEach(w => {
                    this.items.push({
                        type: 'widget',
                        title: w.title || w.type,
                        subtitle: window.i18n.translate('search_subtitle_widget', { name: this.getTabName(w.tab_id) }),
                        target: { id: w.id, tab_id: w.tab_id || 'default' },
                        icon: 'layout'
                    });
                });
            } catch (err) {
                console.error("Search index failed to load widgets:", err);
            }
        },
        
        getTabName(tabId) {
            if (!tabId) return 'Main';
            const tab = AppState.tabs ? AppState.tabs.find(t => t.id === tabId) : null;
            return tab ? tab.name : 'Main';
        },
        
        renderResults() {
            const query = document.getElementById('search-launcher-input').value.toLowerCase().trim();
            const container = document.getElementById('search-launcher-results');
            container.innerHTML = '';
            
            let filtered = [];
            if (query === '') {
                // If query is empty, show default navigation/tabs/favorites
                filtered = this.items.slice(0, 8);
            } else {
                // Fuzzy/Substring search matching title, subtitle, target
                filtered = this.items.filter(item => {
                    const matchTitle = item.title.toLowerCase().includes(query);
                    const matchSubtitle = (item.subtitle || '').toLowerCase().includes(query);
                    return matchTitle || matchSubtitle;
                });
                
                // Add Google search suggestion at the bottom
                filtered.push({
                    type: 'web',
                    title: `Google-Suche nach "${query}"`,
                    subtitle: 'Im Web suchen',
                    target: `https://google.com/search?q=${encodeURIComponent(query)}`,
                    icon: 'search'
                });
            }
            
            if (filtered.length === 0) {
                container.innerHTML = `
                    <div class="text-center muted-text" style="padding: 24px;">
                        Keine Ergebnisse gefunden.
                    </div>
                `;
                return;
            }
            
            // Bound active index to length of filtered
            if (this.activeIndex >= filtered.length) {
                this.activeIndex = 0;
            }
            
            filtered.forEach((item, index) => {
                const itemEl = document.createElement('a');
                itemEl.className = `search-launcher-item ${index === this.activeIndex ? 'active' : ''}`;
                itemEl.href = '#';
                
                // Icon HTML
                let iconHTML = '';
                if (item.type === 'favorite' && item.iconType === 'image') {
                    iconHTML = `<div class="search-launcher-item-icon"><img src="${escapeHtml(item.icon)}" onerror="this.src='/static/img/fallback-fav.png'; this.onerror=null;"></div>`;
                } else {
                    iconHTML = `<div class="search-launcher-item-icon"><i data-lucide="${escapeHtml(item.icon || 'link')}"></i></div>`;
                }
                
                const privateBadge = (item.is_private) ? '<i data-lucide="lock" style="width:11px;height:11px;opacity:0.6;margin-left:4px;"></i>' : '';
                
                itemEl.innerHTML = `
                    ${iconHTML}
                    <div class="search-launcher-item-content">
                        <span class="search-launcher-item-title" style="display:flex;align-items:center;">
                            ${escapeHtml(item.title)}
                            ${privateBadge}
                        </span>
                        <span class="search-launcher-item-subtitle">${escapeHtml(item.subtitle)}</span>
                    </div>
                    <span class="search-launcher-item-badge">${escapeHtml(item.type)}</span>
                `;
                
                itemEl.onclick = (e) => {
                    e.preventDefault();
                    this.executeItem(item);
                };
                
                container.appendChild(itemEl);
            });
            
            if (window.lucide) {
                lucide.createIcons({ nodes: container.querySelectorAll('[data-lucide]') });
            }
        },
        
        updateActiveItem(resultEls) {
            resultEls.forEach((el, index) => {
                if (index === this.activeIndex) {
                    el.classList.add('active');
                    el.scrollIntoView({ block: 'nearest' });
                } else {
                    el.classList.remove('active');
                }
            });
        },
        
        async executeItem(item) {
            this.close();
            
            if (item.type === 'nav') {
                window.location.hash = item.target;
            } else if (item.type === 'tab') {
                window.location.hash = '#dashboard';
                if (window.DashboardController) {
                    await window.DashboardController.switchTab(item.target);
                }
            } else if (item.type === 'favorite' || item.type === 'web') {
                window.open(item.target, '_blank');
            } else if (item.type === 'widget') {
                window.location.hash = '#dashboard';
                
                // If widget tab is different from active tab, switch tab first
                if (window.DashboardController) {
                    const activeTab = AppState.activeTab || 'default';
                    if (item.target.tab_id !== activeTab) {
                        await window.DashboardController.switchTab(item.target.tab_id);
                    }
                    
                    // Highlight the widget temporarily
                    setTimeout(() => {
                        const widgetEl = document.querySelector(`.widget[data-id="${item.target.id}"]`);
                        if (widgetEl) {
                            widgetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            widgetEl.style.transition = 'outline 0.3s ease, transform 0.3s ease';
                            widgetEl.style.outline = '4px solid var(--primary)';
                            widgetEl.style.transform = 'scale(1.02)';
                            
                            setTimeout(() => {
                                widgetEl.style.outline = '';
                                widgetEl.style.transform = '';
                            }, 2000);
                        }
                    }, 300);
                }
            }
        }
    };

    window.SearchLauncher = SearchLauncher;

    // Boot App
    async function boot() {
        SearchLauncher.init();

        // Kick off every independent boot request at once, before awaiting anything.
        // Previously these ran as a serial waterfall (auth -> themes -> modules ->
        // plugins), so the first widget paint cost the sum of all round trips instead
        // of the slowest one. Nothing here depends on translations being loaded.
        const themesPromise = API.request('/api/themes').catch((err) => {
            console.error('Failed to fetch themes:', err);
            return null;
        });
        const modulesPromise = API.getModules().catch((err) => {
            console.error('Failed to fetch modules:', err);
            return null;
        });
        const pluginsPromise = API.request('/api/integration-plugins').catch((err) => {
            console.warn('Integration plugins not loaded:', err);
            return null;
        });

        // Translations must be in place before anything calls i18n.translate(),
        // otherwise the first paint shows raw translation keys.
        try {
            await window.i18n.loadCoreAppTranslations();
        } catch (err) {
            console.warn('Core translations not loaded:', err);
        }

        await checkAuthStatus();
        navigateToSection();

        // Apply themes
        try {
            const themes = await themesPromise;
            if (!themes) throw new Error('themes unavailable');
            AppState.availableThemes = themes;

            const themeSelect = document.getElementById('theme-select');
            const adminThemeSelect = document.getElementById('admin-default-theme');

            if (themeSelect) themeSelect.innerHTML = '';
            if (adminThemeSelect) adminThemeSelect.innerHTML = '';

            themes.forEach(t => {
                const opt1 = document.createElement('option');
                opt1.value = t.id;
                opt1.textContent = t.name;
                themeSelect?.appendChild(opt1);

                const opt2 = document.createElement('option');
                opt2.value = t.id;
                opt2.textContent = t.name;
                adminThemeSelect?.appendChild(opt2);
            });

            // Restore active theme
            if (themeSelect) themeSelect.value = AppState.theme;
            applyThemeStyle(AppState.theme);
            if (AppState.theme === 'custom' && AppState.user) {
                API.getUserProfile()
                    .then((d) => window.applyCustomThemeFromPrefs?.(d.preferences))
                    .catch(() => {});
            }
        } catch (err) {
            console.error("Failed to apply themes:", err);
        }

        // Sidebar init must not depend on the theme request succeeding.
        try {
            window.SidebarUI?.init?.();
        } catch (err) {
            console.error('SidebarUI init failed:', err);
        }

        // Modules + integration plugins (both requests already in flight)
        const signalModulesReady = () => {
            AppState.modulesReady = true;
            window.dispatchEvent(new CustomEvent('homy:modules-ready'));
            window.tryInitDashboard?.();
        };

        try {
            const data = await modulesPromise;
            if (!data) throw new Error('modules unavailable');
            AppState.modules = data.modules;
            AppState.availableWidgets = data.widgets;

            const pluginData = await pluginsPromise;
            AppState.integrationPlugins = pluginData?.integrations || [];

            // Translation bundles are loaded in parallel with each other, but strictly
            // BEFORE the module scripts: a module that calls i18n.translate() at load
            // time would otherwise bake in raw keys.
            await Promise.all([
                window.i18n.loadAllModuleTranslations().catch((e) => console.warn('Module translations not loaded:', e)),
                window.i18n.loadAllIntegrationTranslations(AppState.integrationPlugins).catch((e) => console.warn('Integration translations not loaded:', e)),
            ]);
            window.i18n.translateDOM();

            // Never let a single failing module asset skip signalModulesReady().
            await window.loadModuleAssets(data.modules)
                .catch((e) => console.error('Some module assets failed to load:', e));

            signalModulesReady();
        } catch (err) {
            console.error("Failed to initialise modules:", err);
            signalModulesReady();
        }
    }

    boot();
});
