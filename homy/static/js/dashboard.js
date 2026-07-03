// Core Dashboard UI Controller
// NOTE: AppState is declared globally in core.js — do not re-declare here.

// Global registry for third-party widget renderers
window.WidgetRegistry = {
    _registry: {},
    register(type, definition) {
        this._registry[type] = definition;
        // Re-render only widgets still waiting for their module script
        document.querySelectorAll(`.widget[data-type="${type}"]`).forEach(widgetEl => {
            const body = widgetEl.querySelector('.widget-body');
            if (!body || !body.querySelector('.widget-loading')) return;
            const data = JSON.parse(widgetEl.getAttribute('data-widget-raw') || '{}');
            if (!data.id) return;
            if (window.DashboardController && typeof window.DashboardController.renderWidgetBody === 'function') {
                window.DashboardController.renderWidgetBody(body, data, widgetEl);
            }
        });
    },
    get(type) {
        return this._registry[type];
    }
};

// window.applyWidgetScaling is removed in favor of module-specific scaling logic.

document.addEventListener('DOMContentLoaded', () => {
    function buildDashboardController(cfg) {
        const gridEl = document.getElementById(cfg.gridId);
        if (!gridEl) return null;
        const gridController = new DashboardGrid(cfg.gridId);
        if (cfg.isPrimary) {
            window.gridController = gridController;
        }

        const DashboardController = {
        gridEl,
        gridController,
        apiLayout: cfg.apiLayout,
        activeTabKey: cfg.activeTabKey || 'activeTab',
        tabsStateKey: cfg.tabsStateKey || 'tabs',
        sectionId: cfg.sectionId || 'dashboard',
        dashboardLayoutField: cfg.dashboardLayoutField || 'desktop',
        tabsElId: cfg.tabsElId || 'dashboard-tabs',
        tabsEditId: cfg.tabsEditId || 'dashboard-tabs-edit',
        tabBgLayerId: cfg.tabBgLayerId || 'tab-background-layer',
        addTabBtnId: cfg.addTabBtnId || 'btn-add-tab',
        isPrimary: !!cfg.isPrimary,
        getActiveTabId() {
            return AppState[this.activeTabKey] || 'default';
        },
        setActiveTabId(id) {
            AppState[this.activeTabKey] = id;
        },
        currentLayout: 'auto', // 'auto' (detect based on auth), 'public' (admin editing public layout)
        tabs: [],
        _widgetsCache: [],
        _tabDomCache: {},
        _tabScrollPos: {},
        _widgetsFetched: false,
        _initPromise: null,
        widgetAddSource: 'default',

        async initDashboard() {
            if (this._initPromise) return this._initPromise;
            this._initPromise = this._doInitDashboard();
            try {
                await this._initPromise;
            } finally {
                this._initPromise = null;
            }
        },

        async _doInitDashboard() {
            const publicBanner = document.getElementById('public-layout-banner');
            if (AppState.editingPublicLayout) {
                this.currentLayout = 'public';
                document.getElementById('page-title').textContent = window.i18n.translate('admin_public_layout');
                publicBanner?.classList.remove('hidden');
                window.refreshLucideIcons?.(publicBanner);
            } else {
                this.currentLayout = 'auto';
                publicBanner?.classList.add('hidden');
            }

            await this.loadTabs();
            this.applyTabBackground();
            await this.loadWidgets();
            this.setupControls();
        },

        async loadTabs() {
            try {
                const tabsLayout = this.currentLayout === 'public' ? 'public' : this.apiLayout;
                this.tabs = await API.getTabs(tabsLayout);
                if (!this.tabs || this.tabs.length === 0) {
                    this.tabs = [{ id: 'default', name: 'Main' }];
                }
                this.tabs.forEach(tab => this.normalizeTabBackground(tab));
                AppState[this.tabsStateKey] = this.tabs;
                
                if (!this.getActiveTabId() || !this.tabs.some(t => t.id === this.getActiveTabId())) {
                    this.setActiveTabId(this.tabs[0].id);
                }
                
                this.renderTabs();
                this.applyTabBackground();
            } catch (err) {
                console.error("Failed to load tabs:", err);
            }
        },

        normalizeTabBackground(tab) {
            if (!tab.background || typeof tab.background !== 'object') {
                tab.background = { type: 'none' };
            }
            return tab.background;
        },

        getActiveTab() {
            return this.tabs.find(t => t.id === this.getActiveTabId()) || this.tabs[0] || null;
        },

        applyTabBackground(tab = null) {
            const layer = document.getElementById(this.tabBgLayerId);
            if (!layer) return;
            const active = tab || this.getActiveTab();
            const bg = active?.background || { type: 'none' };

            if (bg.type === 'asset' && bg.asset_id) {
                const opacity = Math.min(100, Math.max(10, parseInt(bg.opacity, 10) || 100)) / 100;
                layer.style.backgroundImage = `url(/api/assets/${bg.asset_id}/file)`;
                layer.style.backgroundSize = bg.size || 'cover';
                layer.style.backgroundPosition = bg.position || 'center';
                layer.style.backgroundRepeat = 'no-repeat';
                layer.style.opacity = String(opacity);
                layer.classList.add('visible');
            } else {
                layer.style.backgroundImage = '';
                layer.classList.remove('visible');
            }
        },

        openTabBackgroundModal(tab) {
            const modal = document.getElementById('tab-background-modal');
            if (!modal) return;

            const tabIdInput = document.getElementById('tab-background-tab-id');
            const typeSelect = document.getElementById('tab-bg-type');
            const pickerGroup = document.getElementById('tab-bg-picker-group');
            const optionsGroup = document.getElementById('tab-bg-options-group');
            const assetIdInput = document.getElementById('tab-bg-asset-id');
            const opacityInput = document.getElementById('tab-bg-opacity');
            const sizeSelect = document.getElementById('tab-bg-size');
            const positionSelect = document.getElementById('tab-bg-position');
            const preview = document.getElementById('tab-bg-preview');
            const title = document.getElementById('tab-background-title');
            const nameInput = document.getElementById('tab-bg-name');

            this.normalizeTabBackground(tab);
            const bg = tab.background;

            tabIdInput.value = tab.id;
            if (nameInput) {
                nameInput.value = tab.name || '';
            }
            title.textContent = window.i18n?.translate('tab_edit_title', { name: tab.name })
                || `Tab: ${tab.name}`;
            typeSelect.value = bg.type === 'asset' ? 'asset' : 'none';
            assetIdInput.value = bg.asset_id ? String(bg.asset_id) : '';
            opacityInput.value = bg.opacity != null ? bg.opacity : 100;
            sizeSelect.value = bg.size || 'cover';
            positionSelect.value = bg.position || 'center';

            const syncGroups = () => {
                const isAsset = typeSelect.value === 'asset';
                pickerGroup.classList.toggle('hidden', !isAsset);
                optionsGroup.classList.toggle('hidden', !isAsset);
                preview.classList.toggle('hidden', !isAsset || !assetIdInput.value);
                if (isAsset && assetIdInput.value) {
                    preview.style.backgroundImage = `url(/api/assets/${assetIdInput.value}/file)`;
                }
            };

            typeSelect.onchange = syncGroups;

            if (window.AssetLibrary) {
                AssetLibrary.renderPicker(document.getElementById('tab-bg-asset-picker'), {
                    category: 'background',
                    selectedValue: assetIdInput.value || null,
                    showGlobalToggle: false,
                    allowUpload: !!AppState.user,
                    onSelect: (val) => {
                        assetIdInput.value = val;
                        syncGroups();
                    },
                });
            }

            syncGroups();

            const close = () => modal.classList.remove('open');
            modal.querySelectorAll('.btn-close-tab-bg').forEach(btn => { btn.onclick = close; });

            document.getElementById('tab-bg-save').onclick = async () => {
                const newName = nameInput?.value?.trim();
                if (newName) {
                    tab.name = newName;
                }
                if (typeSelect.value === 'asset' && !assetIdInput.value) {
                    showToast(window.i18n.translate('tab_edit_bg_required'), 'error');
                    return;
                }
                tab.background = typeSelect.value === 'asset' ? {
                    type: 'asset',
                    asset_id: parseInt(assetIdInput.value, 10),
                    opacity: parseInt(opacityInput.value, 10) || 100,
                    size: sizeSelect.value,
                    position: positionSelect.value,
                } : { type: 'none' };
                close();
                await this.saveTabsState();
                if (tab.id === this.getActiveTabId()) {
                    this.applyTabBackground();
                }
            };

            modal.classList.add('open');
            window.refreshLucideIcons && window.refreshLucideIcons(modal);
        },

        _reorderTabs(fromIndex, toIndex) {
            if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
            const next = [...this.tabs];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            this.tabs = next;
            this.saveTabsState();
        },

        openTabDuplicateModal(tab) {
            const modal = document.getElementById('tab-duplicate-modal');
            if (!modal) return;
            const nameInput = document.getElementById('tab-dup-name');
            const sourceLayoutSelect = document.getElementById('tab-dup-source-layout');
            const sourceTabSelect = document.getElementById('tab-dup-source-tab');
            const title = document.getElementById('tab-duplicate-title');
            if (!nameInput || !sourceLayoutSelect || !sourceTabSelect) return;

            nameInput.value = `${tab.name} (${window.i18n.translate('tab_dup_copy_suffix')})`;
            title.textContent = window.i18n.translate('tab_dup_title', { name: tab.name });

            const populateSourceTabs = async (layout) => {
                sourceTabSelect.innerHTML = '';
                try {
                    const tabs = await API.getTabs(layout);
                    (tabs || []).forEach((t) => {
                        const opt = document.createElement('option');
                        opt.value = t.id;
                        opt.textContent = t.name || t.id;
                        sourceTabSelect.appendChild(opt);
                    });
                    if (tab.id && [...sourceTabSelect.options].some((o) => o.value === tab.id)) {
                        sourceTabSelect.value = tab.id;
                    }
                } catch (err) {
                    console.error(err);
                }
            };

            sourceLayoutSelect.value = this.apiLayout === 'mobile' ? 'mobile' : 'auto';
            sourceLayoutSelect.onchange = () => populateSourceTabs(sourceLayoutSelect.value);
            populateSourceTabs(sourceLayoutSelect.value);

            const close = () => modal.classList.remove('open');
            modal.querySelectorAll('.btn-close-tab-dup').forEach((btn) => { btn.onclick = close; });

            document.getElementById('tab-dup-save').onclick = async () => {
                const name = nameInput.value?.trim();
                if (!name) {
                    showToast(window.i18n.translate('tab_dup_name_required'), 'error');
                    return;
                }
                const sourceLayout = sourceLayoutSelect.value || 'auto';
                const sourceTabId = sourceTabSelect.value;
                if (!sourceTabId) {
                    showToast(window.i18n.translate('tab_dup_source_required'), 'error');
                    return;
                }
                const newTabId = `tab_${Date.now()}`;
                try {
                    await API.duplicateTab({
                        name,
                        source_layout: sourceLayout,
                        target_layout: this.apiLayout,
                        source_tab_id: sourceTabId,
                        new_tab_id: newTabId,
                    });
                    close();
                    await this.loadTabs();
                    this.setActiveTabId(newTabId);
                    this._tabDomCache = {};
                    this._widgetsFetched = false;
                    await this.loadWidgets();
                    showToast(window.i18n.translate('tab_dup_success'), 'success');
                } catch (err) {
                    showToast(err.message || String(err), 'error');
                }
            };

            modal.classList.add('open');
            window.refreshLucideIcons?.(modal);
        },

        renderTabs() {
            const tabsEl = document.getElementById(this.tabsElId);
            const editTools = document.getElementById(this.tabsEditId);
            if (!tabsEl) return;
            
            tabsEl.innerHTML = '';
            
            if (AppState.isEditingLayout) {
                editTools.classList.remove('hidden');
            } else {
                editTools.classList.add('hidden');
            }
            
            this.tabs.forEach((tab, tabIndex) => {
                if (AppState.isEditingLayout) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'dashboard-tab-btn-edit-wrapper';
                    wrapper.draggable = true;
                    wrapper.dataset.tabIndex = String(tabIndex);
                    if (tab.id === this.getActiveTabId()) {
                        wrapper.classList.add('active');
                    }

                    wrapper.addEventListener('dragstart', (e) => {
                        e.dataTransfer.setData('text/plain', String(tabIndex));
                        e.dataTransfer.effectAllowed = 'move';
                        wrapper.classList.add('tab-dragging');
                    });
                    wrapper.addEventListener('dragend', () => wrapper.classList.remove('tab-dragging'));
                    wrapper.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        wrapper.classList.add('tab-drag-over');
                    });
                    wrapper.addEventListener('dragleave', () => wrapper.classList.remove('tab-drag-over'));
                    wrapper.addEventListener('drop', (e) => {
                        e.preventDefault();
                        wrapper.classList.remove('tab-drag-over');
                        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
                        const to = tabIndex;
                        this._reorderTabs(from, to);
                    });
                    
                    const btn = document.createElement('button');
                    btn.className = `dashboard-tab-btn ${tab.id === this.getActiveTabId() ? 'active' : ''}`;
                    btn.textContent = tab.name;
                    btn.type = 'button';
                    btn.onclick = () => this.switchTab(tab.id);
                    
                    const actions = document.createElement('div');
                    actions.className = 'dashboard-tab-edit-actions';

                    const btnGrip = document.createElement('button');
                    btnGrip.className = 'icon-btn tab-drag-handle';
                    btnGrip.type = 'button';
                    btnGrip.title = window.i18n.translate('tab_drag_handle');
                    btnGrip.innerHTML = '<i data-lucide="grip-vertical" style="width:12px;height:12px;"></i>';
                    btnGrip.onmousedown = (e) => e.stopPropagation();
                    
                    const btnEdit = document.createElement('button');
                    btnEdit.className = 'icon-btn';
                    btnEdit.title = window.i18n.translate('tab_edit_action');
                    btnEdit.innerHTML = '<i data-lucide="edit-2" style="width:12px;height:12px;"></i>';
                    btnEdit.type = 'button';
                    btnEdit.onclick = (e) => {
                        e.stopPropagation();
                        this.openTabBackgroundModal(tab);
                    };

                    const btnDup = document.createElement('button');
                    btnDup.className = 'icon-btn';
                    btnDup.title = window.i18n.translate('tab_dup_action');
                    btnDup.innerHTML = '<i data-lucide="copy" style="width:12px;height:12px;"></i>';
                    btnDup.type = 'button';
                    btnDup.onclick = (e) => {
                        e.stopPropagation();
                        this.openTabDuplicateModal(tab);
                    };

                    const btnDelete = document.createElement('button');
                    btnDelete.className = 'icon-btn text-danger';
                    btnDelete.innerHTML = '<i data-lucide="trash-2" style="width:12px;height:12px;"></i>';
                    btnDelete.type = 'button';
                    btnDelete.onclick = async (e) => {
                        e.stopPropagation();
                        if (this.tabs.length <= 1) {
                            showAppAlert(window.i18n.translate('tab_delete_last'), { type: 'warning' });
                            return;
                        }
                        const ok = await showAppConfirm(
                            window.i18n.translate('tab_delete_confirm', { name: tab.name }),
                            { title: window.i18n.translate('tab_delete_title'), danger: true }
                        );
                        if (ok) {
                            this.tabs = this.tabs.filter(t => t.id !== tab.id);
                            delete this._tabDomCache[tab.id];
                            if (this.getActiveTabId() === tab.id) {
                                this.setActiveTabId(this.tabs[0].id);
                            }
                            this.saveTabsState();
                        }
                    };
                    
                    actions.appendChild(btnGrip);
                    actions.appendChild(btnEdit);
                    actions.appendChild(btnDup);
                    actions.appendChild(btnDelete);
                    
                    wrapper.appendChild(btn);
                    wrapper.appendChild(actions);
                    tabsEl.appendChild(wrapper);
                } else {
                    const btn = document.createElement('button');
                    btn.className = `dashboard-tab-btn ${tab.id === this.getActiveTabId() ? 'active' : ''}`;
                    btn.textContent = tab.name;
                    btn.type = 'button';
                    btn.onclick = () => this.switchTab(tab.id);
                    tabsEl.appendChild(btn);
                }
            });
            
            window.refreshLucideIcons(tabsEl);
        },

        _stashActiveTabDom() {
            const tabId = this.getActiveTabId();
            const widgets = [...gridEl.querySelectorAll('.widget')];
            if (widgets.length) {
                this._tabDomCache[tabId] = widgets;
            }
            gridEl.innerHTML = '';
            if (window.WidgetRefreshManager) {
                WidgetRefreshManager.stopAll();
            }
        },

        _restoreTabDom(tabId) {
            const cached = this._tabDomCache[tabId];
            if (!cached || !cached.length) return false;

            cached.forEach((el) => {
                if (el.parentNode !== gridEl) {
                    gridEl.appendChild(el);
                }
            });

            const tabWidgets = this._widgetsCache.filter(
                (w) => (w.tab_id || 'default') === tabId,
            );
            gridController.setWidgets(tabWidgets);
            tabWidgets.forEach((w) => {
                const el = gridEl.querySelector(`.widget[data-id="${w.id}"]`);
                const gw = gridController.widgets.find((g) => g.id === w.id);
                if (gw && el) {
                    gw.el = el;
                }
            });
            gridController.enableEditing(AppState.isEditingLayout);
            gridController.arrangeWidgetsDOM();
            window.refreshLucideIcons(gridEl);
            if (window.WidgetRefreshManager) {
                const startRefresh = () => WidgetRefreshManager.start();
                if ('requestIdleCallback' in window) {
                    requestIdleCallback(startRefresh, { timeout: 1500 });
                } else {
                    setTimeout(startRefresh, 100);
                }
            }
            return true;
        },

        async switchTab(tabId) {
            if (tabId === this.getActiveTabId()) return;

            // Preserve scroll position of the content area for the current tab
            const scrollEl = document.querySelector('.content-body');
            if (scrollEl) {
                this._tabScrollPos[this.getActiveTabId()] = scrollEl.scrollTop;
            }

            this._stashActiveTabDom();
            this.setActiveTabId(tabId);
            this.renderTabs();
            this.applyTabBackground();

            const restored = this._restoreTabDom(tabId);

            // Restore scroll position for the new tab (after DOM is ready)
            if (scrollEl) {
                const savedPos = this._tabScrollPos[tabId] ?? 0;
                requestAnimationFrame(() => { scrollEl.scrollTop = savedPos; });
            }

            if (restored) return;

            await this.loadWidgets({
                soft: true,
                skipFetch: this._widgetsFetched,
            });
        },

        async saveTabsState() {
            try {
                await API.saveTabs(this.tabs, this.currentLayout === 'public', this.apiLayout);
                this.renderTabs();
                this.applyTabBackground();
                await this.loadWidgets();
            } catch (err) {
                showToast(window.i18n.translate('tabs_save_error', { message: err.message }), 'error');
            }
        },

        async loadWidgets(options = {}) {
            const soft = options.soft === true;
            const skipFetch = options.skipFetch === true && this._widgetsCache.length > 0;
            const hadContent = gridEl.querySelector('.widget');

            if (!skipFetch && (!soft || !hadContent)) {
                if (window.WidgetRefreshManager) {
                    WidgetRefreshManager.stopAll();
                }
                gridEl.innerHTML = '<div class="widget-loading" style="grid-column: span 12; height: 200px;"><div class="spinner"></div></div>';
            } else if (!hadContent) {
                if (window.WidgetRefreshManager) {
                    WidgetRefreshManager.stopAll();
                }
            }

            try {
                let widgetsData;
                if (skipFetch) {
                    widgetsData = this._widgetsCache;
                } else {
                    const widgetsLayout = this.currentLayout === 'public' ? 'public' : this.apiLayout;
                    widgetsData = await API.getWidgets(widgetsLayout);
                    this._widgetsCache = widgetsData;
                    this._widgetsFetched = true;
                }

                const activeTab = this.getActiveTabId();
                const tabWidgets = widgetsData.filter(w => (w.tab_id || 'default') === activeTab);

                const fragment = document.createDocumentFragment();
                gridController.setWidgets(tabWidgets);
                gridController.enableEditing(AppState.isEditingLayout);

                tabWidgets.forEach(w => {
                    const widgetEl = this.createWidgetDOM(w);
                    fragment.appendChild(widgetEl);
                    const gridWidget = gridController.widgets.find(gw => gw.id === w.id);
                    if (gridWidget) {
                        gridWidget.el = widgetEl;
                    }
                });

                if (!skipFetch || !hadContent) {
                    gridEl.innerHTML = '';
                }
                gridEl.classList.remove('widgets-loading');
                gridEl.appendChild(fragment);
                this._tabDomCache[activeTab] = [...gridEl.querySelectorAll('.widget')];
                gridController.arrangeWidgetsDOM();
                window.refreshLucideIcons(gridEl);
                // Re-measure after paint (F5 reload can hit 0-width grid before section is visible)
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (gridController) {
                            gridController.updateGridMetrics();
                            gridController.arrangeWidgetsDOM();
                        }
                    });
                });
                if (window.WidgetRefreshManager) {
                    // Start refresh after first paint/idle to reduce jank
                    const startRefresh = () => WidgetRefreshManager.start();
                    if ('requestIdleCallback' in window) {
                        requestIdleCallback(startRefresh, { timeout: 1500 });
                    } else {
                        setTimeout(startRefresh, 250);
                    }
                }
            } catch (err) {
                gridEl.classList.remove('widgets-loading');
                gridEl.innerHTML = `<div class="widget-error" style="grid-column: span 12; height: 200px;"><i data-lucide="alert-triangle"></i><span>${err.message}</span></div>`;
                window.refreshLucideIcons(gridEl);
            }
        },

        getWidgetData(widgetId) {
            return this._widgetsCache.find(w => w.id === widgetId) || null;
        },

        refreshWidgetsByType(type, options = {}) {
            const widgets = gridEl.querySelectorAll(`.widget[data-type="${type}"]`);
            return Promise.all([...widgets].map((el) => {
                const id = el.getAttribute('data-id');
                return id ? this.refreshWidget(id, null, options) : Promise.resolve();
            }));
        },

        async refreshWidget(widgetId, widgetData = null, options = {}) {
            const widgetEl = gridEl.querySelector(`.widget[data-id="${widgetId}"]`);
            if (!widgetEl) return;

            let w = widgetData;
            if (!w) {
                w = this.getWidgetData(widgetId);
            }
            if (!w) return;

            const idx = this._widgetsCache.findIndex(x => x.id === widgetId);
            if (idx >= 0) {
                this._widgetsCache[idx] = w;
            } else {
                this._widgetsCache.push(w);
            }

            widgetEl.setAttribute('data-widget-raw', JSON.stringify(w));
            if (window.WidgetAppearance) {
                WidgetAppearance.apply(widgetEl, w.config || {});
            }
            const titleText = widgetEl.querySelector('.widget-title-text');
            if (titleText) {
                titleText.textContent = w.title || w.type;
            }

            const body = widgetEl.querySelector('.widget-body');
            if (!body) return;

            if (options.force && window.ApiCache) {
                ApiCache.invalidateWidget(widgetId);
            }

            window._forceWidgetRefresh = options.force === true;
            try {
                await this.renderWidgetBody(body, w, widgetEl, options);
            } finally {
                window._forceWidgetRefresh = false;
            }
            window.refreshLucideIcons(widgetEl);
            this._updateRefreshStatus(widgetEl, w);
        },

        _updateRefreshStatus(widgetEl, widgetData) {
            const statusEl = widgetEl.querySelector('.widget-refresh-status');
            if (!statusEl) return;
            const sec = window.WidgetRefreshManager
                ? WidgetRefreshManager.resolveIntervalSeconds(widgetData)
                : 0;
            if (!sec) {
                statusEl.textContent = '';
                statusEl.title = window.i18n?.translate('auto_refresh_off') || 'Auto-Refresh off';
                return;
            }
            const now = new Date();
            statusEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            statusEl.title = window.i18n?.translate('last_updated_interval', { sec }) || `Last updated · every ${sec}s`;
        },

        _invalidateTabDomCache(tabId = null) {
            if (tabId) {
                delete this._tabDomCache[tabId];
            } else {
                this._tabDomCache = {};
            }
        },

        removeWidgetFromDOM(widgetId) {
            const w = this.getWidgetData(widgetId);
            if (w) {
                this._invalidateTabDomCache(w.tab_id || 'default');
                // Notify the widget renderer so it can clean up timers/intervals/observers
                const renderer = window.WidgetRegistry?.get(w.type);
                if (renderer?.onRemove) {
                    try { renderer.onRemove(widgetId); } catch (e) {}
                }
            }
            if (window.WidgetRefreshManager) {
                WidgetRefreshManager.unscheduleWidget(widgetId);
            }
            this._widgetsCache = this._widgetsCache.filter(w => w.id !== widgetId);
            const widgetEl = gridEl.querySelector(`.widget[data-id="${widgetId}"]`);
            if (widgetEl) {
                widgetEl.remove();
            }
            gridController.widgets = gridController.widgets.filter(gw => gw.id !== widgetId);
            gridController.arrangeWidgetsDOM();
        },

        appendWidgetToGrid(w) {
            this._invalidateTabDomCache(w.tab_id || 'default');
            this._widgetsCache.push(w);
            const widgetEl = this.createWidgetDOM(w);
            gridEl.appendChild(widgetEl);

            gridController.widgets.push({
                id: w.id,
                col: w.col,
                row: w.row,
                size_x: w.size_x,
                size_y: w.size_y,
                el: widgetEl
            });
            gridController.arrangeWidgetsDOM();
            window.refreshLucideIcons(widgetEl);
            if (window.WidgetRefreshManager) {
                WidgetRefreshManager.scheduleWidget(widgetEl);
            }
            this._updateRefreshStatus(widgetEl, w);
        },

        async renderWidgetBody(body, w, widgetEl, options = {}) {
            const silent = options.silent === true;
            const hasContent = body.children.length > 0 && !body.querySelector('.widget-loading');
            const useBuffer = silent && hasContent;
            let renderTarget = body;

            if (useBuffer) {
                renderTarget = document.createElement('div');
                renderTarget.className = 'widget-render-buffer';
            } else {
                body.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
            }

            const isModuleActive = AppState.modules && AppState.modules.some(m => m.id === w.module);
            const renderer = window.WidgetRegistry.get(w.type);

            if (!renderer) {
                if (!isModuleActive) {
                    body.innerHTML = `<div class="widget-error" style="color: var(--text-muted);"><i data-lucide="shield-alert" style="width: 24px; height: 24px; color: var(--text-muted); margin-bottom: 4px;"></i><span style="font-size: 0.8rem;">Modul deaktiviert</span></div>`;
                } else {
                    body.innerHTML = `<div class="widget-loading"><div class="spinner"></div><span style="font-size: 0.75rem; margin-top: 4px;">Loading Module...</span></div>`;
                }
                return;
            }

            if (!useBuffer) {
                body.innerHTML = '';
            }

            try {
                const result = renderer.render(renderTarget, w, w.config || {});
                if (result && typeof result.then === 'function') {
                    await result;
                }
                if (useBuffer) {
                    body.replaceChildren(...renderTarget.childNodes);
                }
                if (typeof renderer.onResize === 'function') {
                    renderer.onResize(body, widgetEl);
                }
            } catch (err) {
                if (!useBuffer) {
                    body.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>Renderer Error: ${err.message}</span></div>`;
                }
            }
        },

        createWidgetDOM(w) {
            const widgetEl = document.createElement('div');
            widgetEl.className = 'widget';
            if (w.type === 'spacer') {
                widgetEl.classList.add('widget-spacer');
            }
            widgetEl.setAttribute('data-id', w.id);
            widgetEl.setAttribute('data-type', w.type);
            widgetEl.setAttribute('data-widget-raw', JSON.stringify(w));
            if (window.WidgetAppearance) {
                WidgetAppearance.apply(widgetEl, w.config || {});
            }

            // Header
            const header = document.createElement('div');
            header.className = 'widget-header';
            
            const title = document.createElement('div');
            title.className = 'widget-title';
            title.innerHTML = `<i data-lucide="grip-vertical" class="widget-drag-handle"></i><span class="widget-title-text">${escapeHtml(w.title || w.type)}</span>`;
            
            const actions = document.createElement('div');
            actions.className = 'widget-actions';

            if (w.type !== 'spacer') {
                const btnRefresh = document.createElement('button');
                btnRefresh.className = 'icon-btn widget-btn-refresh';
                btnRefresh.type = 'button';
                btnRefresh.title = 'Jetzt aktualisieren';
                btnRefresh.innerHTML = '<i data-lucide="refresh-cw"></i>';
                btnRefresh.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    btnRefresh.disabled = true;
                    btnRefresh.classList.add('spinning');
                    try {
                        await this.refreshWidget(w.id, null, { silent: true, force: true });
                    } finally {
                        btnRefresh.disabled = false;
                        btnRefresh.classList.remove('spinning');
                        window.refreshLucideIcons(btnRefresh);
                    }
                });
                actions.appendChild(btnRefresh);

                const status = document.createElement('span');
                status.className = 'widget-refresh-status muted-text';
                actions.appendChild(status);
            }

            // Edit actions visible only in edit layout mode
            const editActions = document.createElement('div');
            editActions.className = 'widget-edit-buttons';
            if (!AppState.isEditingLayout) editActions.classList.add('hidden');
            
            // Move to Tab Button
            const btnMoveTab = document.createElement('button');
            btnMoveTab.className = 'icon-btn';
            btnMoveTab.title = 'In anderen Tab verschieben';
            btnMoveTab.innerHTML = '<i data-lucide="arrow-right-left"></i>';
            btnMoveTab.type = 'button';
            btnMoveTab.addEventListener('click', async (e) => {
                e.stopPropagation();
                const otherTabs = this.tabs.filter(t => t.id !== (w.tab_id || 'default'));
                if (otherTabs.length === 0) {
                    showAppAlert(window.i18n.translate('widget_move_no_tabs'), { type: 'info' });
                    return;
                }
                const targetId = await showAppSelect(window.i18n.translate('widget_move_tab_prompt'), {
                    title: 'Tab auswählen',
                    options: otherTabs.map(t => ({ value: t.id, label: t.name })),
                    confirmLabel: 'Verschieben',
                });
                if (!targetId) return;
                const targetTab = otherTabs.find(t => t.id === targetId);
                if (!targetTab) return;
                try {
                    await API.updateWidget(w.id, { tab_id: targetTab.id });
                    showToast(window.i18n.translate('widget_move_success', { name: targetTab.name }), 'success');
                    this.removeWidgetFromDOM(w.id);
                } catch (err) {
                    showToast(window.i18n.translate('widget_move_error', { message: err.message }), 'error');
                }
            });
            editActions.appendChild(btnMoveTab);

            const btnDuplicate = document.createElement('button');
            btnDuplicate.className = 'icon-btn';
            btnDuplicate.title = window.i18n?.translate('widget_duplicate_action') || 'Widget duplizieren';
            btnDuplicate.innerHTML = '<i data-lucide="copy"></i>';
            btnDuplicate.type = 'button';
            btnDuplicate.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    const newW = await API.duplicateWidget(w.id);
                    this.appendWidgetToGrid(newW);
                    showToast(window.i18n?.translate('widget_duplicated') || 'Widget dupliziert', 'success');
                } catch (err) {
                    showToast(err.message || String(err), 'error');
                }
            });
            editActions.appendChild(btnDuplicate);

            const btnConfig = document.createElement('button');
            btnConfig.className = 'icon-btn';
            btnConfig.title = 'Konfigurieren';
            btnConfig.innerHTML = '<i data-lucide="settings"></i>';
            btnConfig.type = 'button';
            btnConfig.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openConfigModal(w.id);
            });

            editActions.appendChild(btnConfig);
            actions.appendChild(editActions);
            
            header.appendChild(title);
            header.appendChild(actions);
            
            const body = document.createElement('div');
            body.className = 'widget-body';
            body.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';

            const resizeHandle = document.createElement('div');
            resizeHandle.className = 'widget-resize-handle';
            resizeHandle.innerHTML = '<i data-lucide="maximize-2" style="width: 100%; height: 100%; transform: rotate(90deg)"></i>';

            widgetEl.appendChild(header);
            widgetEl.appendChild(body);
            widgetEl.appendChild(resizeHandle);

            this.renderWidgetBody(body, w, widgetEl);
            this._updateRefreshStatus(widgetEl, w);

            return widgetEl;
        },

        setupControls() {
            const addTabBtn = document.getElementById(this.addTabBtnId);
            if (addTabBtn && addTabBtn.dataset.bound !== this.addTabBtnId) {
                addTabBtn.dataset.bound = this.addTabBtnId;
                addTabBtn.onclick = async () => {
                    const name = await showAppPrompt(
                        window.i18n.translate('tab_add_prompt'),
                        {
                            title: window.i18n.translate('tab_add_title'),
                            placeholder: window.i18n.translate('tab_add_placeholder'),
                            confirmLabel: window.i18n.translate('tab_add_confirm'),
                        },
                    );
                    if (name && name.trim()) {
                        const id = 'tab_' + Date.now();
                        this.tabs.push({ id, name: name.trim() });
                        this.saveTabsState();
                    }
                };
            }

            if (!this.isPrimary) return;

            const btnEdit = document.getElementById('btn-edit-dashboard');
            const editActions = document.getElementById('edit-mode-actions');
            const btnSave = document.getElementById('btn-save-layout');
            const btnCancel = document.getElementById('btn-cancel-layout');
            const btnAdd = document.getElementById('btn-add-widget');
            if (!btnEdit || btnEdit.dataset.dashControlsBound === '1') {
                return;
            }
            btnEdit.dataset.dashControlsBound = '1';
            
            // Reset state
            if (AppState.isEditingLayout) {
                btnEdit.classList.add('hidden');
                editActions.classList.remove('hidden');
            } else {
                if (AppState.user) {
                    btnEdit.classList.remove('hidden');
                } else {
                    btnEdit.classList.add('hidden');
                }
                editActions.classList.add('hidden');
            }

            // Edit Clicked
            btnEdit.onclick = () => {
                const ctrl = window.getActiveDashboardController();
                if (!ctrl) return;
                AppState.isEditingLayout = true;
                btnEdit.classList.add('hidden');
                editActions.classList.remove('hidden');
                ctrl.gridEl.querySelectorAll('.widget-edit-buttons').forEach(el => el.classList.remove('hidden'));
                ctrl.gridController.enableEditing(true);
                if (window.WidgetRefreshManager) WidgetRefreshManager.stopAll();
                ctrl.renderTabs();
                window.refreshLucideIcons(ctrl.gridEl);
            };

            // Cancel Clicked
            btnCancel.onclick = () => {
                const ctrl = window.getActiveDashboardController();
                if (!ctrl) return;
                AppState.isEditingLayout = false;
                btnEdit.classList.remove('hidden');
                editActions.classList.add('hidden');
                ctrl.gridEl.querySelectorAll('.widget-edit-buttons').forEach(el => el.classList.add('hidden'));
                ctrl.gridController.enableEditing(false);
                ctrl.loadTabs();
                ctrl.loadWidgets().then(() => {
                    if (window.WidgetRefreshManager) WidgetRefreshManager.start();
                });
            };

            // Save Clicked
            btnSave.onclick = async () => {
                const ctrl = window.getActiveDashboardController();
                if (!ctrl) return;
                const positions = ctrl.gridController.getPositions();
                positions.forEach(pos => {
                    pos.tab_id = ctrl.getActiveTabId();
                });
                try {
                    await API.saveBulkLayout(positions);
                    AppState.isEditingLayout = false;
                    btnEdit.classList.remove('hidden');
                    editActions.classList.add('hidden');
                    ctrl.gridEl.querySelectorAll('.widget-edit-buttons').forEach(el => el.classList.add('hidden'));
                    ctrl.gridController.enableEditing(false);
                    await ctrl.loadTabs();
                    await ctrl.loadWidgets();
                    if (window.WidgetRefreshManager) WidgetRefreshManager.start();
                    showToast(window.i18n.translate('layout_save_success'), 'success');
                } catch (err) {
                    showToast(window.i18n.translate('layout_save_error', { message: err.message }), 'error');
                }
            };

            // Add Widget Clicked (Slide Out Panel)
            const addPanel = document.getElementById('add-widget-panel');
            const searchInput = document.getElementById('widget-search-input');
            const categoryBtns = document.querySelectorAll('.widget-category-btn');
            const sourceBtns = document.querySelectorAll('.widget-source-btn');
            const defaultSearchGroup = document.getElementById('widget-default-search-group');
            const defaultCategories = document.getElementById('widget-default-categories');
            const integrationBuilder = document.getElementById('integration-widget-builder');

            btnAdd.onclick = async () => {
                const addCtrl = window.getActiveDashboardController() || this;
                addCtrl.widgetAddSource = 'default';
                sourceBtns.forEach(b => {
                    b.classList.toggle('active', (b.dataset.source || 'default') === 'default');
                });
                if (defaultSearchGroup) defaultSearchGroup.classList.remove('hidden');
                if (defaultCategories) defaultCategories.classList.remove('hidden');
                if (integrationBuilder) integrationBuilder.classList.add('hidden');
                if (searchInput) searchInput.value = '';
                categoryBtns.forEach(btn => {
                    if (btn.getAttribute('data-category') === 'all') {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
                addCtrl.renderAddWidgetsPanel();
                addPanel.classList.add('open');
            };

            document.getElementById('btn-close-widget-panel').onclick = () => {
                addPanel.classList.remove('open');
            };

            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    const addCtrl = window.getActiveDashboardController() || this;
                    if (addCtrl.widgetAddSource === 'default') {
                        addCtrl.renderAddWidgetsPanel();
                    }
                });
            }

            categoryBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    categoryBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const addCtrl = window.getActiveDashboardController() || this;
                    if (addCtrl.widgetAddSource === 'default') {
                        addCtrl.renderAddWidgetsPanel();
                    }
                });
            });

            sourceBtns.forEach(btn => {
                btn.addEventListener('click', async () => {
                    sourceBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const addCtrl = window.getActiveDashboardController() || this;
                    addCtrl.widgetAddSource = btn.dataset.source || 'default';
                    const isIntegrations = addCtrl.widgetAddSource === 'integrations';
                    if (defaultSearchGroup) defaultSearchGroup.classList.toggle('hidden', isIntegrations);
                    if (defaultCategories) defaultCategories.classList.toggle('hidden', isIntegrations);
                    if (integrationBuilder) integrationBuilder.classList.toggle('hidden', !isIntegrations);
                    if (isIntegrations) {
                        await addCtrl.renderIntegrationWidgetBuilder();
                    } else {
                        addCtrl.renderAddWidgetsPanel();
                    }
                });
            });

            window.addEventListener('homy-integrations-changed', async () => {
                const addCtrl = window.getActiveDashboardController() || this;
                if (addCtrl.widgetAddSource === 'integrations' && addPanel?.classList.contains('open')) {
                    await addCtrl.renderIntegrationWidgetBuilder();
                }
            });

            // Edit Public layout trigger (Admin setting panel)
            const btnEditPublic = document.getElementById('btn-edit-public-dashboard');
            if (btnEditPublic) {
                btnEditPublic.onclick = () => {
                    AppState.editingPublicLayout = true;
                    AppState.isEditingLayout = true;
                    window.location.hash = '#dashboard';
                    this.initDashboard();
                };
            }

            // Leave public-layout editing and return to the user's own dashboard,
            // without needing a full page reload (F5).
            const btnExitPublic = document.getElementById('btn-exit-public-dashboard');
            if (btnExitPublic) {
                btnExitPublic.onclick = () => this.exitPublicLayout();
            }
        },

        exitPublicLayout() {
            if (!AppState.editingPublicLayout) return;
            AppState.editingPublicLayout = false;
            AppState.isEditingLayout = false;
            // Reset caches so the user's own tabs/widgets are fetched fresh.
            this._widgetsFetched = false;
            this._tabDomCache = {};
            this.setActiveTabId(null);
            this.initDashboard();
        },

        _flattenPaths(obj, prefix = '', out = [], depth = 0) {
            if (depth > 4 || obj === null || obj === undefined) return out;
            if (Array.isArray(obj)) {
                if (prefix) out.push({ path: prefix, kind: 'array' });
                const sample = obj.find(x => x !== null && x !== undefined);
                if (sample !== undefined) this._flattenPaths(sample, prefix ? `${prefix}.0` : '0', out, depth + 1);
                return out;
            }
            if (typeof obj === 'object') {
                if (prefix) out.push({ path: prefix, kind: 'object' });
                Object.entries(obj).forEach(([k, v]) => {
                    const p = prefix ? `${prefix}.${k}` : k;
                    if (typeof v === 'number') out.push({ path: p, kind: 'number' });
                    else if (typeof v === 'string') out.push({ path: p, kind: 'string' });
                    else this._flattenPaths(v, p, out, depth + 1);
                });
            }
            return out;
        },

        _detectEndpointField(typeDef) {
            if (!typeDef?.fields) return null;
            const keys = Object.keys(typeDef.fields);
            return keys.find(k => /endpoint|path|route/i.test(k) && typeDef.fields[k]?.options?.length) || null;
        },

        _toRelativeEndpointPath(path) {
            const raw = String(path || '').trim();
            if (!raw) return '';
            return raw.replace(/^\/api\/v1/i, '').replace(/^\/api/i, '') || '/';
        },

        _inferDisplayTypeForPath(kind, sampleValue, pathHint = '') {
            const lowerPath = String(pathHint || '').toLowerCase();
            if (kind === 'number') return 'gauge';
            if (Array.isArray(sampleValue)) {
                const first = sampleValue.find(x => x && typeof x === 'object') || sampleValue[0];
                if (first && typeof first === 'object') {
                    const keys = Object.keys(first).map(k => k.toLowerCase());
                    const hasTime = keys.some(k => /(time|date|created|updated|timestamp|ts)/.test(k));
                    const hasMsg = keys.some(k => /(message|msg|text|event|title)/.test(k));
                    if (hasTime && hasMsg) return 'events';
                }
                return 'table';
            }
            if (sampleValue && typeof sampleValue === 'object') return 'table';
            if (typeof sampleValue === 'string') {
                if (/percent|cpu|ram|load|usage|temp|speed|rate|count|total|queue/.test(lowerPath)) return 'gauge';
                return 'text';
            }
            return 'text';
        },

        _readPathValue(payload, path) {
            if (!path) return payload;
            return String(path).split('.').reduce((cur, key) => {
                if (cur == null) return undefined;
                if (Array.isArray(cur) && /^\d+$/.test(key)) {
                    return cur[parseInt(key, 10)];
                }
                if (typeof cur === 'object') return cur[key];
                return undefined;
            }, payload);
        },

        _displayAllowsMultiplePaths(displayType) {
            return ['text', 'gauge', 'line', 'area'].includes(displayType);
        },

        _syncIntegrationPathMultiSelect(host, displayType, pathOptions, elPath) {
            if (!elPath) return;
            const allowMulti = this._displayAllowsMultiplePaths(displayType);
            elPath.multiple = allowMulti;
            const hint = host.querySelector('#iw-path-hint');
            if (hint) {
                hint.textContent = allowMulti
                    ? 'Mehrere Pfade möglich (Strg/Cmd + Klick) — es werden mehrere Widgets erstellt.'
                    : '';
            }
            if (!allowMulti) {
                const selected = elPath.selectedOptions?.[0] || elPath.options[elPath.selectedIndex];
                if (selected) {
                    [...elPath.options].forEach(opt => { opt.selected = opt === selected; });
                }
            }
        },

        _getSelectedIntegrationPaths(elPath, displayType) {
            if (this._displayAllowsMultiplePaths(displayType) && elPath.multiple) {
                return [...elPath.selectedOptions].map(o => o.value);
            }
            return [elPath.value || ''];
        },

        _renderIntegrationPreviewBox(elPreview, displayType, sampleValue, pathLabel = '') {
            if (!elPreview) return;
            const safeDisplay = String(displayType || 'text');
            const label = pathLabel || 'Preview';
            const value = sampleValue;

            if ((safeDisplay === 'gauge' || safeDisplay === 'line' || safeDisplay === 'area') && window.ChartWidgets) {
                const numeric = parseFloat(value);
                if (safeDisplay === 'gauge') {
                    ChartWidgets.renderGauge(elPreview, {
                        label,
                        value: Number.isFinite(numeric) ? numeric : 0,
                        max: 100,
                        unit: '',
                    });
                    return;
                }

                if (safeDisplay === 'line' || safeDisplay === 'area') {
                    const asArray = Array.isArray(value) ? value : [];
                    const points = asArray
                        .map(v => (typeof v === 'number' ? v : parseFloat(v)))
                        .filter(v => Number.isFinite(v))
                        .slice(-24);
                    const current = points.length ? points[points.length - 1] : (Number.isFinite(numeric) ? numeric : 0);
                    const historyKey = `iw_preview_${safeDisplay}_${label}`;
                    if (points.length) {
                        const fakeHistory = points.map((v, i) => ({ t: String(i + 1), v }));
                        try { localStorage.setItem(historyKey, JSON.stringify(fakeHistory)); } catch (_) {}
                    }
                    ChartWidgets.renderLine(elPreview, { label, value: current, historyKey });
                    return;
                }
            }

            if (safeDisplay === 'table' && Array.isArray(value) && value.length) {
                const first = value.find(x => x && typeof x === 'object') || value[0];
                if (first && typeof first === 'object' && !Array.isArray(first)) {
                    const columns = Object.keys(first).slice(0, 5);
                    const rows = value.slice(0, 5);
                    elPreview.innerHTML = `
                        <table class="integration-table" style="width:100%;font-size:0.8rem;">
                            <thead><tr>${columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
                            <tbody>
                                ${rows.map(row => `<tr>${columns.map(c => `<td>${row?.[c] ?? ''}</td>`).join('')}</tr>`).join('')}
                            </tbody>
                        </table>
                    `;
                    return;
                }
            }

            elPreview.textContent = JSON.stringify(value, null, 2).slice(0, 1200);
        },

        _getOwnWidgetsForIntegrationType(integrationType) {
            if (!integrationType) return [];
            return (AppState.availableWidgets || []).filter(w =>
                Array.isArray(w.integration_types) && w.integration_types.includes(integrationType)
            );
        },

        _buildDefaultWidgetConfig(schema, integrationId) {
            const config = { integration_id: String(integrationId) };
            Object.entries(schema?.config_schema || {}).forEach(([key, field]) => {
                if (key !== 'integration_id' && field.default !== undefined) {
                    config[key] = field.default;
                }
            });
            return config;
        },

        async _renderBuiltinWidgetPreview(previewEl, schema, integration) {
            if (!previewEl || !schema || !integration) return;
            const config = this._buildDefaultWidgetConfig(schema, integration.id);
            const mockWidget = {
                id: `preview-${integration.id}`,
                type: schema.type,
                module: schema.module,
                title: schema.name,
                config,
                col: 0,
                row: 0,
                size_x: schema.default_size_x || 4,
                size_y: schema.default_size_y || 3,
            };
            previewEl.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
            const renderer = window.WidgetRegistry.get(schema.type);
            if (!renderer) {
                previewEl.textContent = window.i18n.translate('renderer_not_loaded');
                return;
            }
            const scaler = document.createElement('div');
            scaler.className = 'widget-preview-scaler';
            try {
                const result = renderer.render(scaler, mockWidget, config);
                if (result && typeof result.then === 'function') {
                    await result;
                }
                previewEl.innerHTML = '';
                previewEl.appendChild(scaler);
                const boxH = previewEl.clientHeight || 160;
                const contentH = scaler.scrollHeight;
                if (contentH > boxH && contentH > 0) {
                    const scale = Math.min(1, (boxH - 8) / contentH);
                    scaler.style.transform = `scale(${scale})`;
                    scaler.style.width = `${100 / scale}%`;
                }
                window.refreshLucideIcons(previewEl);
            } catch (err) {
                previewEl.innerHTML = `<div class="widget-error" style="padding:8px;font-size:0.8rem;">${err.message}</div>`;
            }
        },

        async renderIntegrationWidgetBuilder() {
            const host = document.getElementById('integration-widget-builder');
            const list = document.getElementById('widgets-list');
            if (!host || !list) return;
            list.innerHTML = '';
            host.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';

            try {
                const [integrations, types] = await Promise.all([
                    API.request('/api/integrations'),
                    API.request('/api/integrations/types'),
                ]);
                if (!integrations.length) {
                    host.innerHTML = `
                        <p class="muted-text" style="padding:12px 0;">
                            ${t('iw_no_configured_integrations', 'No integrations configured yet. Add them under Settings → Integrations, then open this panel again.')}
                        </p>`;
                    return;
                }
                const intOpts = integrations.map((i) => {
                    const label = (i.name && String(i.name).trim())
                        ? i.name
                        : (i.type_name || i.type);
                    const typeHint = (i.name && String(i.name).trim())
                        ? ` (${i.type_name || i.type})`
                        : '';
                    return `<option value="${i.id}">${label}${typeHint}</option>`;
                }).join('');
                const t = (key, fb) => window.i18n.translate(key) || fb;
                host.innerHTML = `
                    <div class="form-group"><label data-i18n="iw_configured_integration">Configured integration</label><select id="iw-integration" class="form-control"><option value="">—</option>${intOpts}</select></div>
                    <div class="form-group hidden" id="iw-mode-group">
                        <label data-i18n="iw_widget_mode">Widget type</label>
                        <div class="iw-mode-tabs">
                            <button type="button" class="iw-mode-btn active" data-mode="integrated" data-i18n="iw_mode_integrated">Integrated</button>
                            <button type="button" class="iw-mode-btn" data-mode="own" data-i18n="iw_mode_own">Own</button>
                        </div>
                    </div>
                    <div id="iw-builtin-panel" class="hidden">
                        <p class="muted-text" style="font-size:0.75rem;margin-bottom:8px;" data-i18n="iw_integrated_widgets_hint">Built-in widgets for this integration</p>
                        <div id="iw-builtin-list" class="iw-own-widget-list"></div>
                        <div class="iw-builtin-preview-wrap">
                            <label class="muted-text" style="font-size:0.72rem;display:block;margin-bottom:4px;" data-i18n="iw_builtin_preview_label">Preview</label>
                            <div id="iw-builtin-preview" class="integration-widget-preview muted-text" data-i18n="iw_builtin_preview_pick">Select a widget to preview.</div>
                        </div>
                        <div class="iw-builtin-actions">
                            <button type="button" class="btn btn-primary btn-sm" id="iw-builtin-insert" disabled data-i18n="iw_builtin_insert">Insert widget</button>
                        </div>
                    </div>
                    <div id="iw-custom-panel">
                        <p id="iw-custom-hint" class="muted-text hidden" style="font-size:0.75rem;margin-bottom:8px;" data-i18n="iw_custom_builder_hint">Build a widget from this integration&apos;s API data.</p>
                        <div class="form-group hidden" id="iw-endpoint-group"><label>Endpoint</label><select id="iw-endpoint" class="form-control"></select></div>
                        <div class="form-group"><label>Display</label>
                            <select id="iw-display" class="form-control">
                                <option value="text">Text</option>
                                <option value="gauge">Gauge</option>
                                <option value="line">Graph</option>
                                <option value="area">Diagram</option>
                                <option value="table">Table</option>
                                <option value="list">List</option>
                                <option value="events">Events</option>
                            </select>
                        </div>
                        <div class="form-group"><label>Data path</label><select id="iw-path" class="form-control"><option value="">_raw</option></select><div id="iw-path-hint" class="muted-text" style="font-size:0.75rem;margin-top:4px;"></div></div>
                        <div style="display:flex;gap:8px;">
                            <button type="button" class="btn btn-outline btn-sm" id="iw-preview">Load preview</button>
                            <button type="button" class="btn btn-primary btn-sm" id="iw-insert">Insert widget</button>
                        </div>
                        <div id="iw-preview-box" class="integration-widget-preview muted-text">No preview loaded.</div>
                    </div>
                `;
                window.i18n.translateDOM();

                const elIntegration = host.querySelector('#iw-integration');
                const elModeGroup = host.querySelector('#iw-mode-group');
                const elBuiltinPanel = host.querySelector('#iw-builtin-panel');
                const elBuiltinList = host.querySelector('#iw-builtin-list');
                const elBuiltinPreview = host.querySelector('#iw-builtin-preview');
                const btnBuiltinInsert = host.querySelector('#iw-builtin-insert');
                const elCustomPanel = host.querySelector('#iw-custom-panel');
                const elCustomHint = host.querySelector('#iw-custom-hint');
                const elPathHint = host.querySelector('#iw-path-hint');
                const elEndpointGroup = host.querySelector('#iw-endpoint-group');
                const elEndpoint = host.querySelector('#iw-endpoint');
                const elPath = host.querySelector('#iw-path');
                const elDisplay = host.querySelector('#iw-display');
                const elPreview = host.querySelector('#iw-preview-box');
                const modeBtns = host.querySelectorAll('.iw-mode-btn');
                let iwMode = 'integrated';
                let lastPreviewPayload = null;
                let lastPathOptions = [];
                let displayLockedByUser = false;
                let selectedBuiltinType = null;
                let selectedBuiltinSchema = null;

                const getSelected = () => integrations.find(i => String(i.id) === String(elIntegration.value));

                const setIwMode = (mode) => {
                    iwMode = mode;
                    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
                    const showBuiltin = mode === 'integrated';
                    elBuiltinPanel?.classList.toggle('hidden', !showBuiltin);
                    elCustomPanel?.classList.toggle('hidden', showBuiltin);
                };

                const resetBuiltinSelection = () => {
                    selectedBuiltinType = null;
                    selectedBuiltinSchema = null;
                    if (btnBuiltinInsert) btnBuiltinInsert.disabled = true;
                    if (elBuiltinPreview) {
                        elBuiltinPreview.innerHTML = '';
                        elBuiltinPreview.textContent = t('iw_builtin_preview_pick', 'Select a widget to preview.');
                    }
                    elBuiltinList?.querySelectorAll('.iw-own-widget-card').forEach(b => b.classList.remove('selected'));
                };

                const renderBuiltinWidgets = async () => {
                    if (!elBuiltinList) return;
                    resetBuiltinSelection();
                    const selected = getSelected();
                    if (!selected) {
                        elBuiltinList.innerHTML = `<div class="muted-text">${t('iw_select_integration', 'Select integration')}</div>`;
                        return;
                    }
                    const own = this._getOwnWidgetsForIntegrationType(selected.type);
                    if (!own.length) {
                        elBuiltinList.innerHTML = `<div class="muted-text">${t('iw_no_own_widgets', 'No own widgets')}</div>`;
                        return;
                    }
                    elBuiltinList.innerHTML = own.map(w => `
                        <button type="button" class="iw-own-widget-card" data-type="${w.type}">
                            <i data-lucide="${w.icon || 'box'}"></i>
                            <span>${w.name}</span>
                            <span class="muted-text" style="font-size:0.7rem;margin-left:auto;">${w.default_size_x || 4}×${w.default_size_y || 3}</span>
                        </button>
                    `).join('');
                    elBuiltinList.querySelectorAll('.iw-own-widget-card').forEach(btn => {
                        btn.addEventListener('click', async () => {
                            const schema = own.find(x => x.type === btn.dataset.type);
                            if (!schema || !selected) return;
                            selectedBuiltinType = schema.type;
                            selectedBuiltinSchema = schema;
                            elBuiltinList.querySelectorAll('.iw-own-widget-card').forEach(b => {
                                b.classList.toggle('selected', b === btn);
                            });
                            if (btnBuiltinInsert) btnBuiltinInsert.disabled = false;
                            if (elBuiltinPreview) {
                                await this._renderBuiltinWidgetPreview(elBuiltinPreview, schema, selected);
                            }
                        });
                    });
                    window.refreshLucideIcons(elBuiltinList);
                    const firstBtn = elBuiltinList.querySelector('.iw-own-widget-card');
                    if (firstBtn) firstBtn.click();
                };

                if (btnBuiltinInsert) {
                    btnBuiltinInsert.addEventListener('click', async () => {
                        const selected = getSelected();
                        if (!selected || !selectedBuiltinSchema) {
                            showToast(t('iw_builtin_preview_pick', 'Select a widget first.'), 'error');
                            return;
                        }
                        const schema = selectedBuiltinSchema;
                        const size_x = schema.default_size_x || 4;
                        const size_y = schema.default_size_y || 3;
                        const pos = gridController.findFirstAvailableSpace(size_x, size_y);
                        const config = this._buildDefaultWidgetConfig(schema, selected.id);
                        try {
                            const newW = await API.createWidget({
                                module: schema.module,
                                type: schema.type,
                                title: `${selected.name} · ${schema.name}`,
                                config,
                                col: pos.col,
                                row: pos.row,
                                size_x,
                                size_y,
                                tab_id: this.getActiveTabId(),
                                is_public: this.currentLayout === 'public',
                                dashboard_layout: this.dashboardLayoutField,
                            });
                            this.appendWidgetToGrid(newW);
                            document.getElementById('add-widget-panel').classList.remove('open');
                            showToast(t('iw_builtin_inserted', 'Widget placed — configure in settings.'), 'success');
                            requestAnimationFrame(() => this.openConfigModal(newW));
                        } catch (err) {
                            showToast(err.message, 'error');
                        }
                    });
                }

                const prefillMetricPaths = () => {
                    const selected = getSelected();
                    if (!selected) return false;
                    const tdef = types.find(t => t.id === selected.type);
                    const metrics = Array.isArray(tdef?.metrics) ? tdef.metrics : [];
                    if (!metrics.length) return false;
                    lastPathOptions = [{ path: '', label: '_raw', kind: 'object' }].concat(
                        metrics.map(m => ({
                            path: m.path,
                            label: m.label ? `${m.path} (${m.label})` : m.path,
                            kind: 'number',
                        }))
                    );
                    elPath.innerHTML = lastPathOptions.map(o =>
                        `<option value="${o.path}">${o.label}</option>`
                    ).join('');
                    const first = metrics[0]?.path ?? '';
                    if (first) elPath.value = first;
                    elDisplay.value = 'text';
                    if (elPathHint) {
                        elPathHint.textContent = metrics.map(m => m.label || m.path).join(' · ');
                    }
                    return true;
                };

                const syncModeVisibility = () => {
                    const selected = getSelected();
                    const own = selected ? this._getOwnWidgetsForIntegrationType(selected.type) : [];
                    const hasBuiltin = own.length > 0;

                    if (elModeGroup) {
                        elModeGroup.classList.toggle('hidden', !selected || !hasBuiltin);
                    }
                    elCustomHint?.classList.toggle('hidden', !selected || hasBuiltin);

                    if (!selected) {
                        setIwMode('integrated');
                        renderBuiltinWidgets();
                        return false;
                    }
                    if (!hasBuiltin) {
                        setIwMode('own');
                        prefillMetricPaths();
                        renderBuiltinWidgets();
                        return true;
                    }
                    setIwMode('integrated');
                    renderBuiltinWidgets();
                    return false;
                };

                modeBtns.forEach(btn => {
                    btn.addEventListener('click', () => setIwMode(btn.dataset.mode || 'integrated'));
                });

                const getEndpointOverride = () => {
                    if (elEndpointGroup.classList.contains('hidden') || !elEndpoint.value) {
                        return { endpointField: null, endpointValue: null };
                    }
                    return { endpointField: 'endpoint', endpointValue: elEndpoint.value };
                };

                const populateEndpointDropdown = (preserveSelection = true) => {
                    const selected = getSelected();
                    const previous = preserveSelection ? elEndpoint.value : '';
                    if (!selected) {
                        elEndpointGroup.classList.add('hidden');
                        elEndpoint.innerHTML = '';
                        return;
                    }
                    const tdef = types.find(t => t.id === selected.type);
                    const widgetEndpoints = Array.isArray(tdef?.widget_endpoints) ? tdef.widget_endpoints : null;
                    if (widgetEndpoints && widgetEndpoints.length) {
                        if (window.IntegrationWidgetHelpers) {
                            elEndpoint.innerHTML = IntegrationWidgetHelpers.buildEndpointSelectHtml(
                                tdef,
                                previous || selected.config?.endpoint,
                                tdef.default_widget_endpoint
                            );
                        } else {
                            elEndpoint.innerHTML = widgetEndpoints.map(ep => {
                                const rel = this._toRelativeEndpointPath(ep.path || '');
                                return `<option value="${ep.key}">${ep.label}${rel ? ` · ${rel}` : ''}</option>`;
                            }).join('');
                            const fallback = previous || selected.config?.endpoint || tdef.default_widget_endpoint || '';
                            if (fallback && [...elEndpoint.options].some(o => o.value === fallback)) {
                                elEndpoint.value = fallback;
                            }
                        }
                        elEndpointGroup.classList.remove('hidden');
                        return;
                    }
                    const endpointField = this._detectEndpointField(tdef);
                    if (!endpointField) {
                        elEndpointGroup.classList.add('hidden');
                        elEndpoint.innerHTML = '';
                        return;
                    }
                    const field = tdef.fields[endpointField];
                    elEndpoint.innerHTML = (field.options || []).map(o => `<option value="${o}">${o}</option>`).join('');
                    const current = previous || selected.config?.[endpointField];
                    if (current && field.options?.includes(current)) elEndpoint.value = current;
                    elEndpointGroup.classList.remove('hidden');
                };

                const captureSelectedPaths = () => {
                    if (elPath.multiple) {
                        return [...elPath.selectedOptions].map(o => o.value);
                    }
                    return [elPath.value];
                };

                const restoreSelectedPaths = (paths, options) => {
                    const valid = paths.filter(p => options.some(o => o.path === p));
                    if (!valid.length && options.length) {
                        valid.push(options[0].path);
                    }
                    [...elPath.options].forEach(opt => {
                        opt.selected = valid.includes(opt.value);
                    });
                    if (!elPath.multiple && valid.length) {
                        elPath.value = valid[0];
                    }
                };

                const applyPathOptions = (payload, { preserveSelections = true } = {}) => {
                    const previousPaths = captureSelectedPaths();
                    const previousDisplay = elDisplay.value;
                    const isFirstPreview = !lastPreviewPayload;

                    const paths = this._flattenPaths(payload);
                    const options = [{ path: '', label: '_raw', kind: 'object' }].concat(
                        paths.map(p => ({ path: p.path, label: `${p.path} (${p.kind})`, kind: p.kind }))
                    );
                    lastPreviewPayload = payload;
                    lastPathOptions = options;
                    elPath.innerHTML = options.map(o => `<option value="${o.path}">${o.label}</option>`).join('');
                    this._syncIntegrationPathMultiSelect(host, elDisplay.value, lastPathOptions, elPath);

                    if (preserveSelections) {
                        restoreSelectedPaths(previousPaths, options);
                    } else {
                        const preferred = options.find(o => o.kind === 'number')
                            || options.find(o => o.kind === 'array')
                            || options[0];
                        if (preferred) restoreSelectedPaths([preferred.path], options);
                    }

                    const pathStillValid = previousPaths.some(p => options.some(o => o.path === p));
                    const shouldInferDisplay = !displayLockedByUser && (
                        isFirstPreview || !(preserveSelections && pathStillValid)
                    );
                    if (shouldInferDisplay) {
                        const primaryPath = captureSelectedPaths()[0] ?? '';
                        const selectedOpt = options.find(o => o.path === primaryPath) || options[0];
                        const selectedSample = this._readPathValue(payload, primaryPath);
                        const inferred = this._inferDisplayTypeForPath(
                            selectedOpt?.kind,
                            selectedSample,
                            primaryPath
                        );
                        if (inferred) elDisplay.value = inferred;
                    } else {
                        elDisplay.value = previousDisplay;
                    }

                    const previewPath = captureSelectedPaths()[0] ?? '';
                    const selectedSample = this._readPathValue(payload, previewPath);
                    const sample = selectedSample === undefined ? payload : selectedSample;
                    this._renderIntegrationPreviewBox(elPreview, elDisplay.value, sample, previewPath || '_raw');
                };

                const loadPreview = async () => {
                    const selected = getSelected();
                    if (!selected) return;
                    const { endpointField, endpointValue } = getEndpointOverride();
                    const qs = new URLSearchParams();
                    if (endpointField && endpointValue) qs.set(`override_${endpointField}`, endpointValue);
                    const res = await API.request(`/api/integrations/${selected.id}/fetch?${qs.toString()}`);
                    if (!res.ok) throw new Error(res.message || 'Fetch failed');
                    applyPathOptions(res.payload, { preserveSelections: true });
                };

                host.querySelector('#iw-preview').onclick = async () => {
                    try { await loadPreview(); } catch (err) { elPreview.textContent = `Preview failed: ${err.message}`; }
                };

                host.querySelector('#iw-insert').onclick = async () => {
                    const selected = getSelected();
                    if (!selected) {
                        showToast(window.i18n.translate('widget_add_pick_integration'), 'error');
                        return;
                    }
                    const { endpointField, endpointValue } = getEndpointOverride();
                    const display = elDisplay.value;
                    const paths = this._getSelectedIntegrationPaths(elPath, display);
                    if (!paths.length) {
                        showToast(window.i18n.translate('widget_add_pick_paths'), 'error');
                        return;
                    }

                    const schemaByType = (widgetType) => AppState.availableWidgets.find(w => w.type === widgetType);
                    let created = 0;

                    for (const path of paths) {
                        let widgetType = 'metric_display';
                        let module = 'metric_display';
                        let config = { integration_id: String(selected.id), data_path: path, chart_type: 'stat' };

                        if (display === 'table' || display === 'list') {
                            widgetType = 'integration_table';
                            module = 'integration_table';
                            config = { integration_id: String(selected.id), data_path: path, mode: display, max_rows: '10', columns: '' };
                        } else if (display === 'events') {
                            widgetType = 'integration_events';
                            module = 'integration_events';
                            config = { integration_id: String(selected.id), events_path: path, time_path: 'timestamp', message_path: 'message', severity_path: '', max_items: '10' };
                        } else {
                            widgetType = 'metric_display';
                            module = 'metric_display';
                            const chart = display === 'text' ? 'stat' : display;
                            config = { integration_id: String(selected.id), data_path: path, chart_type: chart, label: path || 'Metrik', unit: '', max_value: '100' };
                        }
                        if (endpointField && endpointValue) {
                            config.override_key = endpointField;
                            config.override_value = endpointValue;
                        }

                        const schema = schemaByType(widgetType);
                        const size_x = schema?.default_size_x || 4;
                        const size_y = schema?.default_size_y || 3;
                        const pos = gridController.findFirstAvailableSpace(size_x, size_y);

                        try {
                            const pathLabel = path || '_raw';
                            const title = paths.length > 1
                                ? `${selected.name} · ${pathLabel}`
                                : `${selected.name} · ${display}`;
                            const newW = await API.createWidget({
                                module,
                                type: widgetType,
                                title,
                                config,
                                col: pos.col,
                                row: pos.row,
                                size_x,
                                size_y,
                                tab_id: this.getActiveTabId(),
                                is_public: this.currentLayout === 'public',
                                dashboard_layout: this.dashboardLayoutField,
                            });
                            this.appendWidgetToGrid(newW);
                            created += 1;
                        } catch (err) {
                            showToast(`Insert failed: ${err.message}`, 'error');
                            break;
                        }
                    }

                    if (created > 0) {
                        document.getElementById('add-widget-panel').classList.remove('open');
                        showToast(
                            created > 1
                                ? window.i18n.translate('iw_widgets_inserted', { count: created })
                                : window.i18n.translate('iw_widget_inserted'),
                            'success'
                        );
                    }
                };

                elIntegration.addEventListener('change', () => {
                    populateEndpointDropdown(false);
                    lastPreviewPayload = null;
                    lastPathOptions = [];
                    displayLockedByUser = false;
                    elPath.innerHTML = '<option value="">_raw</option>';
                    if (elPathHint) elPathHint.textContent = '';
                    elDisplay.value = 'text';
                    elPreview.textContent = t('iw_preview_hint', 'Click "Load preview" to inspect this endpoint.');
                    const needsAutoPreview = syncModeVisibility();
                    if (needsAutoPreview) {
                        elPreview.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
                        loadPreview().catch(err => {
                            elPreview.textContent = `${t('iw_preview_failed', 'Preview failed')}: ${err.message}`;
                        });
                    }
                });
                elEndpoint.addEventListener('change', async () => {
                    if (!getSelected()) return;
                    elPreview.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
                    try {
                        await loadPreview();
                    } catch (err) {
                        elPreview.textContent = `Preview failed: ${err.message}`;
                    }
                });
                elPath.addEventListener('change', () => {
                    if (!lastPreviewPayload) return;
                    const previewPath = captureSelectedPaths()[0] ?? '';
                    const selectedOpt = lastPathOptions.find(o => o.path === previewPath) || { kind: 'object' };
                    const sample = this._readPathValue(lastPreviewPayload, previewPath);
                    if (!displayLockedByUser) {
                        const inferred = this._inferDisplayTypeForPath(selectedOpt.kind, sample, previewPath);
                        if (inferred) elDisplay.value = inferred;
                    }
                    this._renderIntegrationPreviewBox(
                        elPreview,
                        elDisplay.value,
                        sample === undefined ? lastPreviewPayload : sample,
                        previewPath || '_raw'
                    );
                });
                elDisplay.addEventListener('change', () => {
                    displayLockedByUser = true;
                    this._syncIntegrationPathMultiSelect(host, elDisplay.value, lastPathOptions, elPath);
                    if (lastPreviewPayload) {
                        const previewPath = captureSelectedPaths()[0] ?? '';
                        const sample = this._readPathValue(lastPreviewPayload, previewPath);
                        this._renderIntegrationPreviewBox(
                            elPreview,
                            elDisplay.value,
                            sample === undefined ? lastPreviewPayload : sample,
                            previewPath || '_raw'
                        );
                    }
                });
                populateEndpointDropdown(false);
                syncModeVisibility();
                this._syncIntegrationPathMultiSelect(host, elDisplay.value, lastPathOptions, elPath);
                window.refreshLucideIcons(host);
            } catch (err) {
                host.innerHTML = `<div class="widget-error">${err.message}</div>`;
            }
        },

        renderAddWidgetsPanel() {
            const list = document.getElementById('widgets-list');
            if (!list) return;
            if (this.widgetAddSource === 'integrations') {
                list.innerHTML = '';
                return;
            }
            list.innerHTML = '';
            
            const searchInput = document.getElementById('widget-search-input');
            const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
            
            const activeBtn = document.querySelector('.widget-category-btn.active');
            const activeCategory = activeBtn ? activeBtn.getAttribute('data-category') : 'all';
            
            const getWidgetCategoryAndIcon = (w) => {
                const type = (w.type || '').toLowerCase();
                const module = (w.module || '').toLowerCase();
                const name = (w.name || '').toLowerCase();
                
                const categoryMapping = {
                    'pihole': { cat: 'system', icon: 'shield' },
                    'proxmox': { cat: 'system', icon: 'server' },
                    'torrent': { cat: 'media', icon: 'download-cloud' },
                    'seerr': { cat: 'media', icon: 'film' },
                    'jellyfin': { cat: 'media', icon: 'play-circle' },
                    'radarr': { cat: 'media', icon: 'clapperboard' },
                    'sonarr': { cat: 'media', icon: 'tv' },
                    'lidarr': { cat: 'media', icon: 'music' },
                    'prowlarr': { cat: 'media', icon: 'radar' },
                    'tautulli': { cat: 'media', icon: 'bar-chart' },
                    'sabnzbd': { cat: 'media', icon: 'download' },
                    'portainer': { cat: 'system', icon: 'container' },
                    'uptime_kuma': { cat: 'system', icon: 'activity' },
                    'glances': { cat: 'system', icon: 'activity' },
                    'zabbix': { cat: 'system', icon: 'activity' },
                    'uptime_kuma_status': { cat: 'system', icon: 'activity' },
                    'glances_system': { cat: 'system', icon: 'cpu' },
                    'adguard_status': { cat: 'system', icon: 'shield-check' },
                    'arr_queue': { cat: 'media', icon: 'list-ordered' },
                    'sabnzbd_queue': { cat: 'media', icon: 'download' },
                    'torrent_status': { cat: 'media', icon: 'download-cloud' },
                    'media_streams': { cat: 'media', icon: 'play-circle' },
                    'tautulli_streams': { cat: 'media', icon: 'bar-chart-2' },
                    'plex_status': { cat: 'media', icon: 'play' },
                    'overseerr_requests': { cat: 'media', icon: 'clapperboard' },
                    'rss_feed': { cat: 'utility', icon: 'rss' },
                    'portainer_containers': { cat: 'system', icon: 'container' },
                    'prowlarr_indexers': { cat: 'media', icon: 'radar' },
                    'bazarr_missing': { cat: 'media', icon: 'subtitles' },
                    'immich_stats': { cat: 'media', icon: 'image' },
                    'flex_stat': { cat: 'utility', icon: 'hash' },
                    'flex_gauge': { cat: 'utility', icon: 'gauge' },
                    'flex_list': { cat: 'utility', icon: 'list' },
                    'flex_chart': { cat: 'utility', icon: 'line-chart' },
                    'flex_banner': { cat: 'utility', icon: 'type' },
                    'service_status': { cat: 'system', icon: 'globe' },
                    'metric_display': { cat: 'utility', icon: 'bar-chart-2' },
                    'integration_table': { cat: 'utility', icon: 'table' },
                    'integration_events': { cat: 'utility', icon: 'bell' },
                    'weather_warnings': { cat: 'smarthome', icon: 'alert-triangle' },
                    'clock': { cat: 'utility', icon: 'clock' },
                    'homeassistant': { cat: 'smarthome', icon: 'home' },
                    'weather': { cat: 'smarthome', icon: 'cloud-sun' },
                    'spacer': { cat: 'utility', icon: 'move' },
                    'calendar': { cat: 'utility', icon: 'calendar' },
                    'discord': { cat: 'utility', icon: 'message-square' },
                    'custom_json': { cat: 'utility', icon: 'code' },
                    'favorites': { cat: 'utility', icon: 'star' },
                    'countdown': { cat: 'utility', icon: 'timer' },
                    'note': { cat: 'utility', icon: 'sticky-note' },
                    'jellyfin_recent': { cat: 'media', icon: 'sparkles' },
                    'arr_calendar': { cat: 'media', icon: 'calendar-days' }
                };
                
                if (categoryMapping[type]) return categoryMapping[type];
                if (categoryMapping[module]) return categoryMapping[module];
                
                const text = `${type} ${module} ${name}`;
                if (/system|cpu|ram|mem|disk|temp|server|docker|portainer|net|ping|speed|adguard|shield/.test(text)) {
                    return { cat: 'system', icon: 'server' };
                }
                if (/stream|video|play|movie|tv|music|torrent|download|show|plex|jellyfin|emby|kodi|media|sonarr|radarr|lidarr|tautulli/.test(text)) {
                    return { cat: 'media', icon: 'film' };
                }
                if (/home|hass|aqara|smart|mqtt|light|switch|temp|sensor|weather|wetter|sun|cloud/.test(text)) {
                    return { cat: 'smarthome', icon: 'home' };
                }
                return { cat: 'utility', icon: 'layout' };
            };
            
            const filteredWidgets = AppState.availableWidgets.filter(w => {
                if (w.widget_role === 'integration' || w.widget_source === 'integration') {
                    return false;
                }
                const info = getWidgetCategoryAndIcon(w);
                
                if (activeCategory !== 'all' && info.cat !== activeCategory) {
                    return false;
                }
                
                if (query !== '') {
                    const matchName = (w.name || '').toLowerCase().includes(query);
                    const matchModule = (w.module || '').toLowerCase().includes(query);
                    const matchType = (w.type || '').toLowerCase().includes(query);
                    return matchName || matchModule || matchType;
                }
                
                return true;
            });
            
            if (filteredWidgets.length === 0) {
                list.innerHTML = `
                    <div class="muted-text" style="padding: 24px; text-align: center;">
                        Keine Widgets gefunden.
                    </div>
                `;
                return;
            }
            
            filteredWidgets.forEach(w => {
                const info = getWidgetCategoryAndIcon(w);
                const item = document.createElement('button');
                item.className = 'widget-item-add';
                item.type = 'button';
                item.innerHTML = `
                    <div class="widget-item-add-icon">
                        <i data-lucide="${info.icon}"></i>
                    </div>
                    <div class="widget-item-add-content">
                        <div class="widget-item-name">${w.name}</div>
                        <div class="widget-item-desc">${w.module} plugin${w.dual_data_source ? ' · Integration / Custom' : ''}</div>
                        <div class="widget-item-add-badge">
                            <i data-lucide="grid" style="width:10px; height:10px;"></i> Grid: ${w.default_size_x}x${w.default_size_y}
                        </div>
                    </div>
                `;
                item.onclick = async () => {
                    const size_x = w.default_size_x;
                    const size_y = w.default_size_y;
                    const { col, row } = gridController.findFirstAvailableSpace(size_x, size_y);
                    const dualSource = w.dual_data_source === true;
                    const initialConfig = dualSource ? { data_source: 'integration' } : {};

                    try {
                        const newW = await API.createWidget({
                            module: w.module,
                            type: w.type,
                            title: w.name,
                            config: initialConfig,
                            col: col,
                            row: row,
                            size_x: size_x,
                            size_y: size_y,
                            tab_id: this.getActiveTabId(),
                            is_public: this.currentLayout === 'public',
                            dashboard_layout: this.dashboardLayoutField,
                        });

                        document.getElementById('add-widget-panel').classList.remove('open');

                        this.appendWidgetToGrid(newW);
                        if (dualSource) {
                            showToast(
                                window.i18n?.translate('flex_configure_hint')
                                || 'Widget platziert — Datenquelle (Integration oder Custom) wählen.',
                                'success',
                            );
                            requestAnimationFrame(() => this.openConfigModal(newW));
                        } else if (window.showToast) {
                            window.showToast(window.i18n.translate('widget_add_success'), 'success');
                        }
                    } catch (err) {
                        showToast(window.i18n.translate('widget_add_error', { message: err.message }), 'error');
                    }
                };
                list.appendChild(item);
            });
            
            if (window.lucide) {
                lucide.createIcons({ nodes: list.querySelectorAll('[data-lucide]') });
            }
        },

        // --- Widget Configuration Modal Manager ---
        resolveWidgetData(widgetRef) {
            const widgetId = typeof widgetRef === 'object' ? widgetRef.id : widgetRef;
            if (!widgetId) return null;

            let w = this.getWidgetData(widgetId);
            if (w) return { ...w };

            const widgetEl = gridEl.querySelector(`.widget[data-id="${widgetId}"]`);
            if (widgetEl) {
                try {
                    const raw = JSON.parse(widgetEl.getAttribute('data-widget-raw') || 'null');
                    if (raw && raw.id) return raw;
                } catch (err) {
                    console.warn('Failed to parse widget raw data', err);
                }
            }
            return typeof widgetRef === 'object' ? { ...widgetRef } : null;
        },

        _appendSchemaConfigFields(fieldsContainer, schema, currentConfig, options = {}) {
            const skipKeys = new Set(options.skipKeys || []);
            const widgetType = options.widgetType || '';
            const TYPE_ICONS = {
                text: 'type', password: 'key-round', select: 'chevrons-up-down',
                textarea: 'align-left', number: 'hash', toggle: 'toggle-left',
            };
            Object.keys(schema).forEach(key => {
                if (skipKeys.has(key)) return;
                const field = schema[key];
                const value = currentConfig[key] !== undefined ? currentConfig[key] : (field.default !== undefined ? field.default : '');

                const tKeyLabel = widgetType ? `widget_${widgetType}_${key}_label` : '';
                const tKeyHelp = widgetType ? `widget_${widgetType}_${key}_help` : '';
                const transLabel = (tKeyLabel && window.i18n) ? window.i18n.translate(tKeyLabel) : null;
                const transHelp = (tKeyHelp && window.i18n) ? window.i18n.translate(tKeyHelp) : null;
                const displayLabel = transLabel && transLabel !== tKeyLabel ? transLabel : (field.label || key);
                const displayHelp = transHelp && transHelp !== tKeyHelp ? transHelp : (field.help || '');

                const group = document.createElement('div');
                group.className = 'form-group cfg-field-group';

                const labelEl = document.createElement('label');
                labelEl.setAttribute('for', `cfg-${key}`);
                const icon = TYPE_ICONS[field.type] || 'settings';
                labelEl.innerHTML = `<span class="cfg-field-icon-wrap"><i data-lucide="${icon}" class="cfg-field-icon"></i></span>${displayLabel}`;

                if (field.type === 'password' && window.WidgetConfigFields) {
                    WidgetConfigFields.appendPasswordField(group, {
                        id: `cfg-${key}`,
                        label: displayLabel,
                        storedValue: value,
                    });
                    if (displayHelp) {
                        const hint = document.createElement('small');
                        hint.className = 'cfg-field-help';
                        hint.innerHTML = `<i data-lucide="info" style="width:11px;height:11px;vertical-align:middle;margin-right:3px;"></i>${displayHelp}`;
                        group.appendChild(hint);
                    }
                    fieldsContainer.appendChild(group);
                    return;
                }

                let input;
                if (field.type === 'select') {
                    const opts = field.options || [];
                    // Use button-group for small option sets
                    if (opts.length <= 4 && !field.force_select) {
                        const btnGroup = document.createElement('div');
                        btnGroup.className = 'cfg-btn-group';
                        btnGroup.id = `cfg-${key}-group`;
                        // Hidden real select for form reading
                        const hiddenSel = document.createElement('select');
                        hiddenSel.id = `cfg-${key}`;
                        hiddenSel.className = 'hidden-cfg-select';
                        hiddenSel.style.display = 'none';
                        opts.forEach(opt => {
                            const o = document.createElement('option');
                            o.value = opt;
                            const tKeyOpt = widgetType ? `widget_${widgetType}_${key}_option_${opt}` : '';
                            const transOpt = (tKeyOpt && window.i18n) ? window.i18n.translate(tKeyOpt) : null;
                            o.textContent = transOpt && transOpt !== tKeyOpt ? transOpt : opt;
                            if (opt === value) o.selected = true;
                            hiddenSel.appendChild(o);
                        });
                        opts.forEach(opt => {
                            const btn = document.createElement('button');
                            btn.type = 'button';
                            btn.className = `cfg-btn-opt${opt === value ? ' active' : ''}`;
                            const tKeyOpt = widgetType ? `widget_${widgetType}_${key}_option_${opt}` : '';
                            const transOpt = (tKeyOpt && window.i18n) ? window.i18n.translate(tKeyOpt) : null;
                            btn.textContent = transOpt && transOpt !== tKeyOpt ? transOpt : opt;
                            btn.onclick = () => {
                                btnGroup.querySelectorAll('.cfg-btn-opt').forEach(b => b.classList.remove('active'));
                                btn.classList.add('active');
                                hiddenSel.value = opt;
                            };
                            btnGroup.appendChild(btn);
                        });
                        group.appendChild(labelEl);
                        group.appendChild(btnGroup);
                        group.appendChild(hiddenSel);
                        if (displayHelp) {
                            const hint = document.createElement('small');
                            hint.className = 'cfg-field-help';
                            hint.innerHTML = `<i data-lucide="info" style="width:11px;height:11px;vertical-align:middle;margin-right:3px;"></i>${displayHelp}`;
                            group.appendChild(hint);
                        }
                        fieldsContainer.appendChild(group);
                        return;
                    }
                    input = document.createElement('select');
                    input.className = 'form-control';
                    input.id = `cfg-${key}`;
                    opts.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = opt;
                        const tKeyOpt = widgetType ? `widget_${widgetType}_${key}_option_${opt}` : '';
                        const transOpt = (tKeyOpt && window.i18n) ? window.i18n.translate(tKeyOpt) : null;
                        option.textContent = transOpt && transOpt !== tKeyOpt ? transOpt : opt;
                        if (opt === value) option.selected = true;
                        input.appendChild(option);
                    });
                } else if (field.type === 'textarea') {
                    input = document.createElement('textarea');
                    input.className = 'form-control';
                    input.id = `cfg-${key}`;
                    input.rows = field.rows || 4;
                    input.value = value;
                    if (field.placeholder) input.placeholder = field.placeholder;
                } else {
                    input = document.createElement('input');
                    input.className = 'form-control';
                    input.id = `cfg-${key}`;
                    input.type = 'text';
                    input.value = value;
                    if (field.placeholder) input.placeholder = field.placeholder;
                    else if (field.default !== undefined && field.default !== '') input.placeholder = String(field.default);
                }

                group.appendChild(labelEl);
                group.appendChild(input);
                if (displayHelp) {
                    const hint = document.createElement('small');
                    hint.className = 'cfg-field-help';
                    hint.innerHTML = `<i data-lucide="info" style="width:11px;height:11px;vertical-align:middle;margin-right:3px;"></i>${displayHelp}`;
                    group.appendChild(hint);
                }
                fieldsContainer.appendChild(group);
            });
            window.refreshLucideIcons && window.refreshLucideIcons(fieldsContainer);
        },

        _createCollapsibleSection(title, icon, expanded = false) {
            const sec = document.createElement('div');
            sec.className = `cfg-section${expanded ? ' expanded' : ''}`;
            const hdr = document.createElement('button');
            hdr.type = 'button';
            hdr.className = 'cfg-section-header';
            hdr.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            hdr.innerHTML = `<i data-lucide="${icon}" class="cfg-section-icon"></i><span>${title}</span><i data-lucide="chevron-down" class="cfg-section-chevron"></i>`;
            const body = document.createElement('div');
            body.className = 'cfg-section-body';
            hdr.addEventListener('click', () => {
                const isExp = sec.classList.toggle('expanded');
                hdr.setAttribute('aria-expanded', isExp ? 'true' : 'false');
                if (isExp) window.refreshLucideIcons && window.refreshLucideIcons(body);
            });
            sec.appendChild(hdr);
            sec.appendChild(body);
            return { sec, body };
        },

        openConfigModal(widgetRef) {
            const w = this.resolveWidgetData(widgetRef);
            if (!w) return;

            const modal = document.getElementById('widget-config-modal');
            const form = document.getElementById('widget-config-form');
            const titleInput = document.getElementById('widget-title-input');
            const fieldsContainer = document.getElementById('widget-custom-fields');
            const t = (k, fb) => (window.i18n ? window.i18n.translate(k) : null) || fb;

            titleInput.value = w.title || '';
            fieldsContainer.innerHTML = '';

            let schemaDef;
            let schema = {};
            let currentConfig = {};
            let isIntegrationWidget = false;
            let linkedIntegrationId = null;
            let renderer = null;

            try {

            schemaDef = AppState.availableWidgets.find(aw => aw.type === w.type);
            schema = schemaDef ? schemaDef.config_schema : {};
            currentConfig = w.config || {};
            isIntegrationWidget = schemaDef && (
                schemaDef.widget_role === 'integration' || schemaDef.widget_source === 'integration'
            );
            linkedIntegrationId = currentConfig.integration_id;

            // --- Section 1: Widget-Einstellungen (expanded) ---
            const { sec: sec1, body: body1 } = this._createCollapsibleSection(
                t('cfg_section_widget', 'Widget-Einstellungen'), 'settings', true
            );

            if (linkedIntegrationId) {
                const intGroup = document.createElement('div');
                intGroup.className = 'form-group';
                intGroup.innerHTML = `
                    <label data-i18n="iw_linked_integration">Linked integration</label>
                    <p class="muted-text" id="cfg-integration-display" style="margin:4px 0 0;">…</p>
                    <input type="hidden" id="cfg-integration_id" value="${linkedIntegrationId}">
                `;
                body1.appendChild(intGroup);
                API.request('/api/integrations').then((list) => {
                    const match = (list || []).find(i => String(i.id) === String(linkedIntegrationId));
                    const el = document.getElementById('cfg-integration-display');
                    if (el && match) {
                        el.textContent = `${match.name} (${match.type_name || match.type})`;
                    } else if (el) {
                        el.textContent = `ID ${linkedIntegrationId}`;
                    }
                }).catch(() => {});
            }

            renderer = window.WidgetRegistry.get(w.type);
            if (renderer && typeof renderer.renderConfig === 'function') {
                renderer.renderConfig(body1, w, currentConfig);
            } else {
                const skipKeys = isIntegrationWidget && linkedIntegrationId ? ['integration_id'] : [];
                this._appendSchemaConfigFields(body1, schema, currentConfig, { skipKeys, widgetType: w.type });
            }
            fieldsContainer.appendChild(sec1);

            // --- Section 2: Darstellung (collapsed) ---
            if (w.type !== 'spacer' && window.WidgetAppearance) {
                const { sec: sec2, body: body2 } = this._createCollapsibleSection(
                    t('cfg_section_appearance', 'Darstellung'), 'palette', false
                );
                WidgetAppearance.appendConfigFields(body2, currentConfig);
                fieldsContainer.appendChild(sec2);
            }

            // --- Section 3: Auto-Aktualisierung (collapsed) ---
            if (w.type !== 'spacer' && window.WidgetRefreshManager) {
                const { sec: sec3, body: body3 } = this._createCollapsibleSection(
                    t('cfg_section_refresh', 'Auto-Aktualisierung'), 'refresh-cw', false
                );
                WidgetRefreshManager.appendRefreshConfigFields(body3, currentConfig);
                fieldsContainer.appendChild(sec3);
            }

            window.refreshLucideIcons && window.refreshLucideIcons(fieldsContainer);

            } catch (setupErr) {
                // If anything in the config setup throws, show the error inside
                // the modal rather than leaving the user with a broken/empty modal.
                console.error('openConfigModal setup failed:', setupErr);
                fieldsContainer.innerHTML = `<div class="widget-error" style="padding:12px;">
                    <i data-lucide="alert-triangle"></i>
                    <span>Config konnte nicht geladen werden: ${setupErr.message}</span>
                </div>`;
                window.refreshLucideIcons?.(fieldsContainer);
            }

            // Save Trigger
            form.onsubmit = async (e) => {
                e.preventDefault();
                
                let updatedConfig = {};
                if (renderer && typeof renderer.readConfig === 'function') {
                    updatedConfig = renderer.readConfig(fieldsContainer);
                } else {
                    const skipKeys = new Set();
                    Object.keys(schema).forEach(key => {
                        if (skipKeys.has(key)) return;
                        if (window.WidgetConfigFields && schema[key].type === 'password') {
                            const val = WidgetConfigFields.readSchemaField(schema, key);
                            if (val !== undefined) {
                                updatedConfig[key] = val;
                            }
                            return;
                        }
                        const input = document.getElementById(`cfg-${key}`);
                        if (input) {
                            updatedConfig[key] = input.value;
                        }
                    });
                }
                const hiddenInt = document.getElementById('cfg-integration_id');
                if (hiddenInt && hiddenInt.value) {
                    updatedConfig.integration_id = hiddenInt.value;
                } else if (currentConfig.integration_id && !updatedConfig.integration_id) {
                    updatedConfig.integration_id = currentConfig.integration_id;
                }
                if (window.WidgetRefreshManager) {
                    updatedConfig = { ...updatedConfig, ...WidgetRefreshManager.readRefreshConfig(fieldsContainer) };
                }
                if (window.WidgetAppearance) {
                    updatedConfig = { ...updatedConfig, ...WidgetAppearance.readConfig(fieldsContainer) };
                }

                // Read current grid position to avoid layout jumps
                const gridWidget = gridController.widgets.find(gw => gw.id === w.id);
                const updatePayload = {
                    title: titleInput.value,
                    config: updatedConfig
                };
                if (gridWidget) {
                    updatePayload.col = gridWidget.col;
                    updatePayload.row = gridWidget.row;
                    updatePayload.size_x = gridWidget.size_x;
                    updatePayload.size_y = gridWidget.size_y;
                }
                
                try {
                    const saved = await API.updateWidget(w.id, updatePayload);
                    
                    modal.classList.remove('open');
                    const mergedConfig = window.WidgetConfigFields
                        ? WidgetConfigFields.maskConfigPasswords(updatedConfig, schema)
                        : updatedConfig;
                    const updated = {
                        ...w,
                        ...saved,
                        title: titleInput.value,
                        config: mergedConfig,
                    };
                    const idx = this._widgetsCache.findIndex(x => x.id === w.id);
                    if (idx >= 0) {
                        this._widgetsCache[idx] = updated;
                    }
                    await this.refreshWidget(w.id, updated, { force: true });
                    if (window.WidgetRefreshManager) {
                        WidgetRefreshManager.rescheduleWidget(w.id);
                    }
                    if (window.showToast) {
                        window.showToast(window.i18n.translate('widget_config_saved'), 'success');
                    }
                } catch (err) {
                    showToast(window.i18n.translate('widget_config_save_error', { message: err.message }), 'error');
                }
            };
            
            // Delete Trigger
            document.getElementById('btn-delete-widget-modal').onclick = async (e) => {
                e.preventDefault();
                const ok = await showAppConfirm(window.i18n.translate('confirm_delete_widget'), {
                    title: 'Widget löschen',
                    danger: true,
                });
                if (!ok) return;
                try {
                    await API.deleteWidget(w.id);
                    modal.classList.remove('open');
                    this.removeWidgetFromDOM(w.id);
                    showToast(window.i18n.translate('widget_deleted'), 'success');
                } catch (err) {
                    showToast(window.i18n.translate('widget_delete_error', { message: err.message }), 'error');
                }
            };
            
            modal.classList.add('open');
        }
    };

        return DashboardController;
    }

    window.getActiveDashboardController = function getActiveDashboardController() {
        if (AppState.activeSection === 'mobile-dashboard' && window.MobileDashboardController) {
            return window.MobileDashboardController;
        }
        return window.DashboardController;
    };

    window.DashboardController = buildDashboardController({
        gridId: 'dashboard-grid',
        apiLayout: 'auto',
        isPrimary: true,
        addTabBtnId: 'btn-add-tab',
    });

    window.MobileDashboardController = buildDashboardController({
        gridId: 'mobile-dashboard-grid',
        apiLayout: 'mobile',
        activeTabKey: 'activeMobileTab',
        tabsStateKey: 'mobileTabs',
        sectionId: 'mobile-dashboard',
        dashboardLayoutField: 'mobile',
        tabsElId: 'mobile-dashboard-tabs',
        tabsEditId: 'mobile-dashboard-tabs-edit',
        tabBgLayerId: 'mobile-tab-background-layer',
        addTabBtnId: 'btn-mobile-add-tab',
    });

    function dashboardRouteSection() {
        const hash = window.location.hash || '#dashboard';
        if (hash === '#mobile-dashboard') return 'mobile-dashboard';
        if (!hash || hash === '#dashboard') return 'dashboard';
        return null;
    }

    function tryInitDashboard() {
        if (!AppState.modulesReady) return;
        const section = dashboardRouteSection();
        if (section === 'dashboard' && window.DashboardController) {
            window.DashboardController.initDashboard();
        } else if (section === 'mobile-dashboard' && window.MobileDashboardController) {
            window.MobileDashboardController.initDashboard();
        }
    }

    window.tryInitDashboard = tryInitDashboard;
    window.isDashboardRoute = () => !!dashboardRouteSection();

    let _hashChangeTimer = null;
    window.addEventListener('hashchange', () => {
        clearTimeout(_hashChangeTimer);
        _hashChangeTimer = setTimeout(() => {
            if (dashboardRouteSection()) {
                tryInitDashboard();
            } else {
                AppState.editingPublicLayout = false;
            }
        }, 0);
    });

    window.addEventListener('homy:modules-ready', () => {
        tryInitDashboard();
    });

    window.addEventListener('pageshow', () => {
        if (dashboardRouteSection()) {
            tryInitDashboard();
        }
    });

    if (AppState.modulesReady) {
        requestAnimationFrame(() => tryInitDashboard());
    }
});
