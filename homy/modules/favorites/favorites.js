// Bookmarks / Favorites Module Frontend

/** Shared icon resolution for widget + manager (auto favicon vs lucide vs asset). */
window.FavoritesIcon = {
    usesLucide(f) {
        if (!f || f.icon_type !== 'icon') return false;
        const v = String(f.icon_value || '').trim();
        return v.length > 0 && v !== 'auto' && v !== 'link';
    },
    usesAsset(f) {
        return !!(f && f.icon_type === 'asset' && f.icon_value);
    },
    usesImage(f) {
        return !!(f && f.icon_type === 'image' && f.icon_value);
    },
    usesFavicon(f) {
        if (!f || !String(f.url || '').trim()) return false;
        if (f.icon_type === 'auto') return true;
        if (this.usesAsset(f) || this.usesImage(f) || this.usesLucide(f)) return false;
        // Legacy rows: icon_type "icon" with link/auto/empty → website favicon
        if (f.icon_type === 'icon') {
            const v = String(f.icon_value || '').trim();
            return !v || v === 'auto' || v === 'link';
        }
        return true;
    },
    faviconSrc(url) {
        const u = String(url || '').trim();
        if (!u) return '/static/media/fallback-icon.svg';
        return window.AssetLibrary
            ? AssetLibrary.faviconUrl(u)
            : `/api/favicon?url=${encodeURIComponent(u)}`;
    },
    appendTo(parent, f, { wrapperClass = 'fav-icon-wrapper', imgClass = '' } = {}) {
        const wrap = document.createElement('div');
        wrap.className = wrapperClass;

        const mkImg = (src) => {
            const img = document.createElement('img');
            img.src = src;
            img.alt = f.title || '';
            if (imgClass) img.className = imgClass;
            img.loading = 'lazy';
            img.decoding = 'async';
            img.referrerPolicy = 'no-referrer';
            img.onerror = function () {
                this.src = '/static/media/fallback-icon.svg';
                this.onerror = null;
            };
            return img;
        };

        if (this.usesAsset(f)) {
            wrap.appendChild(mkImg(`/api/assets/${f.icon_value}/file`));
        } else if (this.usesImage(f)) {
            wrap.appendChild(mkImg(f.icon_value));
        } else if (this.usesLucide(f)) {
            wrap.innerHTML = `<i data-lucide="${f.icon_value}"></i>`;
        } else if (this.usesFavicon(f)) {
            wrap.classList.add('fav-icon-auto');
            wrap.appendChild(mkImg(this.faviconSrc(f.url)));
        } else {
            wrap.innerHTML = '<i data-lucide="link"></i>';
        }
        parent.appendChild(wrap);
        return wrap;
    },
};

// 1. Register Widget Renderer
window.WidgetRegistry.register('favorites', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        
        try {
            // Determine layout to load based on dashboard editing mode
            const layout = window.DashboardController.currentLayout;
            const favs = await API.getFavorites(layout);
            container.innerHTML = '';
            
            let filteredFavs = favs;
            const filter = config.category_filter || '';
            if (filter.trim() !== '') {
                filteredFavs = favs.filter(f => f.category && f.category.toLowerCase() === filter.toLowerCase().trim());
            }
            
            if (filteredFavs.length === 0) {
                container.innerHTML = '<div class="muted-text text-center" style="padding: 20px;">Keine Favoriten vorhanden.</div>';
                return;
            }
            
            const layoutMode = config.layout_mode || 'Grid';
            const tileSize = config.tile_size || 'Mittel';
            const sizeClass = { Klein: 'fav-size-sm', Mittel: 'fav-size-md', Groß: 'fav-size-lg' }[tileSize] || 'fav-size-md';
            const groupByCat = config.group_by_category !== 'Nein'; // Default to true
            
            if (groupByCat) {
                // Group by category
                const groups = {};
                filteredFavs.forEach(f => {
                    const cat = f.category && f.category.trim() ? f.category.trim() : '— (ohne Kategorie)';
                    if (!groups[cat]) groups[cat] = [];
                    groups[cat].push(f);
                });
                
                const widgetWrapper = document.createElement('div');
                widgetWrapper.className = 'fav-widget-categories-wrapper';
                
                const catOrder = await FavoritesController.loadCategoryOrder();
                const widgetCats = FavoritesController.sortCategoryNames(Object.keys(groups), catOrder);

                widgetCats.forEach(cat => {
                    const catBlock = document.createElement('div');
                    catBlock.className = 'fav-widget-category';
                    
                    const storageKey = `fav_collapsed_${widgetData.id}_${cat}`;
                    const isCollapsed = localStorage.getItem(storageKey) === 'true';
                    if (isCollapsed) {
                        catBlock.classList.add('collapsed');
                    }
                    
                    const header = document.createElement('div');
                    header.className = 'fav-widget-cat-header';
                    const label = FavoritesController.displayCategoryName(cat);
                    header.innerHTML = `
                        <i data-lucide="chevron-down" class="fav-cat-arrow"></i>
                        <span>${label}</span>
                    `;
                    
                    const body = document.createElement('div');
                    body.className = 'fav-widget-cat-body';
                    if (layoutMode === 'List') {
                        body.classList.add('fav-list-layout');
                    } else if (layoutMode === 'Buttons') {
                        body.classList.add('fav-buttons-layout', sizeClass);
                    } else {
                        body.classList.add('fav-grid-layout', sizeClass);
                    }
                    
                    // Render links inside group
                    groups[cat].forEach(f => {
                        const linkEl = document.createElement('a');
                        linkEl.href = f.url;
                        linkEl.target = '_blank';
                        
                        if (layoutMode === 'Buttons') {
                            linkEl.className = 'fav-button-item';
                            const icon = this.createIconHTML(f);
                            linkEl.appendChild(icon);
                            const label = document.createElement('span');
                            label.className = 'fav-button-label';
                            label.textContent = f.title;
                            linkEl.appendChild(label);
                        } else if (layoutMode === 'List') {
                            linkEl.className = 'fav-list-item';
                            const icon = this.createIconHTML(f);
                            linkEl.appendChild(icon);
                            const text = document.createElement('span');
                            text.textContent = f.title;
                            linkEl.appendChild(text);
                            if (f.is_private) {
                                const lock = document.createElement('i');
                                lock.setAttribute('data-lucide', 'lock');
                                lock.className = 'fav-lock-badge';
                                linkEl.appendChild(lock);
                            }
                        } else {
                            linkEl.className = 'fav-tile-item';
                            const icon = this.createIconHTML(f);
                            linkEl.appendChild(icon);
                            const label = document.createElement('div');
                            label.className = 'fav-tile-label';
                            label.textContent = f.title;
                            linkEl.appendChild(label);
                            if (f.is_private) {
                                const lock = document.createElement('i');
                                lock.setAttribute('data-lucide', 'lock');
                                lock.className = 'fav-lock-badge';
                                linkEl.appendChild(lock);
                            }
                        }
                        body.appendChild(linkEl);
                    });
                    
                    // Collapse Click Event
                    header.onclick = (e) => {
                        e.stopPropagation();
                        const currentlyCollapsed = catBlock.classList.toggle('collapsed');
                        localStorage.setItem(storageKey, currentlyCollapsed);
                    };
                    
                    catBlock.appendChild(header);
                    catBlock.appendChild(body);
                    widgetWrapper.appendChild(catBlock);
                });
                
                container.appendChild(widgetWrapper);
            } else {
                if (layoutMode === 'List') {
                    const list = document.createElement('div');
                    list.className = 'fav-list-layout';
                    filteredFavs.forEach(f => {
                        const item = document.createElement('a');
                        item.href = f.url;
                        item.target = '_blank';
                        item.className = 'fav-list-item';
                        
                        const icon = this.createIconHTML(f);
                        item.appendChild(icon);
                        
                        const text = document.createElement('span');
                        text.textContent = f.title;
                        item.appendChild(text);
                        
                        if (f.is_private) {
                            const lock = document.createElement('i');
                            lock.setAttribute('data-lucide', 'lock');
                            lock.className = 'fav-lock-badge';
                            item.appendChild(lock);
                        }
                        
                        list.appendChild(item);
                    });
                    container.appendChild(list);
                } else {
                    // Grid layout
                    const grid = document.createElement('div');
                    grid.className = 'fav-grid-layout';
                    filteredFavs.forEach(f => {
                        const tile = document.createElement('a');
                        tile.href = f.url;
                        tile.target = '_blank';
                        tile.className = 'fav-tile-item';
                        
                        const icon = this.createIconHTML(f);
                        tile.appendChild(icon);
                        
                        const label = document.createElement('div');
                        label.className = 'fav-tile-label';
                        label.textContent = f.title;
                        tile.appendChild(label);
                        
                        if (f.is_private) {
                            const lock = document.createElement('i');
                            lock.setAttribute('data-lucide', 'lock');
                            lock.className = 'fav-lock-badge';
                            tile.appendChild(lock);
                        }
                        
                        grid.appendChild(tile);
                    });
                    container.appendChild(grid);
                }
            }
            
            lucide.createIcons();
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>${err.message}</span></div>`;
            lucide.createIcons();
        }
    },
    
    createIconHTML(f) {
        const holder = document.createElement('div');
        window.FavoritesIcon.appendTo(holder, f);
        return holder.firstElementChild;
    },

    onResize(body) {
        if (!body) return;
        body.querySelectorAll('.fav-grid-layout, .fav-buttons-layout, .fav-list-layout').forEach((el) => {
            el.style.width = '100%';
        });
    },
});


// 2. Standalone Favorites Manager Controller
const FavoritesController = {
    EXTRA_CATEGORIES_KEY: 'homy_favorite_categories',
    CATEGORY_ORDER_KEY: 'homy_favorite_category_order',
    BROWSER_SYNC_CATEGORIES: new Set(['Aus Browser synchronisiert', 'Synced from browser']),

    tr(key, params) {
        return window.i18n?.translate(key, params) || key;
    },

    isBrowserSyncCategory(cat) {
        const c = (cat || '').trim();
        return this.BROWSER_SYNC_CATEGORIES.has(c);
    },

    displayCategoryName(cat) {
        if (this.isBrowserSyncCategory(cat)) {
            return this.tr('fav_cat_browser_sync');
        }
        return cat;
    },

    getExtraCategories() {
        try {
            const raw = localStorage.getItem(this.EXTRA_CATEGORIES_KEY);
            return JSON.parse(raw || '[]');
        } catch {
            return [];
        }
    },

    addExtraCategory(name) {
        const trimmed = (name || '').trim();
        if (!trimmed) return false;
        const list = this.getExtraCategories();
        if (!list.includes(trimmed)) {
            list.push(trimmed);
            localStorage.setItem(this.EXTRA_CATEGORIES_KEY, JSON.stringify(list));
        }
        return true;
    },

    async getAllCategories() {
        const categories = new Set(this.getExtraCategories());
        try {
            const favs = await API.getFavorites();
            favs.forEach(f => {
                if (f.category && f.category.trim()) {
                    categories.add(f.category.trim());
                }
            });
        } catch (err) {
            console.error('Failed to load categories:', err);
        }
        const names = Array.from(categories);
        const order = await this.loadCategoryOrder();
        return this.sortCategoryNames(names, order);
    },

    getLocalCategoryOrder() {
        try {
            const raw = localStorage.getItem(this.CATEGORY_ORDER_KEY);
            return JSON.parse(raw || '[]');
        } catch {
            return [];
        }
    },

    async loadCategoryOrder() {
        if (AppState.user) {
            try {
                const res = await API.getFavoriteCategoryOrder();
                if (Array.isArray(res.order) && res.order.length) {
                    localStorage.setItem(this.CATEGORY_ORDER_KEY, JSON.stringify(res.order));
                    return res.order;
                }
            } catch (err) {
                console.warn('Category order API failed, using local cache', err);
            }
        }
        return this.getLocalCategoryOrder();
    },

    async saveCategoryOrder(order) {
        localStorage.setItem(this.CATEGORY_ORDER_KEY, JSON.stringify(order));
        if (AppState.user) {
            await API.saveFavoriteCategoryOrder(order);
        }
    },

    sortCategoryNames(names, order) {
        const remaining = new Set(names);
        const sorted = [];
        (order || []).forEach((cat) => {
            const name = String(cat).trim();
            if (name && remaining.has(name)) {
                sorted.push(name);
                remaining.delete(name);
            }
        });
        [...remaining].sort((a, b) => a.localeCompare(b, 'de')).forEach((c) => sorted.push(c));
        return sorted;
    },

    async populateCategorySelect(selected = '') {
        const select = document.getElementById('fav-category-select');
        if (!select) return;
        const categories = await this.getAllCategories();
        select.innerHTML = '<option value="">— (ohne Kategorie)</option>';
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = this.displayCategoryName(cat);
            if (cat === selected) opt.selected = true;
            select.appendChild(opt);
        });
        if (selected === '' || selected === null) {
            select.value = '';
        }
    },

    async loadFavorites(options = {}) {
        const container = document.getElementById('favorites-categories');
        const actionsWrap = document.getElementById('favorites-header-actions');
        const silent = options.silent === true;
        
        if (!container) return;
        
        if (!silent) {
            container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        }
        
        if (AppState.user) {
            if (actionsWrap) actionsWrap.classList.remove('hidden');
        } else if (actionsWrap) {
            actionsWrap.classList.add('hidden');
        }
        
        try {
            const favs = await API.getFavorites();
            container.innerHTML = '';
            
            if (favs.length === 0) {
                container.innerHTML = `
                    <div class="text-center muted-text" style="padding: 40px;">
                        <i data-lucide="folder-open" style="width: 48px; height: 48px; margin-bottom: 12px; color: var(--text-muted);"></i>
                        <p>Noch keine Favoriten hinzugefügt.</p>
                    </div>
                `;
                lucide.createIcons();
                return;
            }
            
            // Group by category
            const groups = {};
            favs.forEach(f => {
                const cat = f.category && f.category.trim() ? f.category.trim() : '— (ohne Kategorie)';
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push(f);
            });

            this.getExtraCategories().forEach(cat => {
                if (!groups[cat]) groups[cat] = [];
            });

            const order = await this.loadCategoryOrder();
            const sortedCats = this.sortCategoryNames(Object.keys(groups), order);

            sortedCats.forEach(cat => {
                const catSection = document.createElement('div');
                catSection.className = 'fav-category-section';
                
                const header = document.createElement('h3');
                header.className = 'fav-category-header';
                header.textContent = this.displayCategoryName(cat);
                catSection.appendChild(header);
                
                const grid = document.createElement('div');
                grid.className = 'fav-manager-grid';
                
                groups[cat].forEach(f => {
                    const card = document.createElement('div');
                    card.className = 'fav-manager-card glass';
                    
                    const info = document.createElement('div');
                    info.className = 'fav-card-info';
                    
                    const iconSlot = document.createElement('div');
                    iconSlot.className = 'fav-manager-icon-slot';
                    window.FavoritesIcon.appendTo(iconSlot, f, { wrapperClass: 'fav-icon-wrapper fav-manager-icon-wrap' });
                    info.appendChild(iconSlot);
                    
                    const details = document.createElement('div');
                    details.innerHTML = `
                        <div class="fav-manager-title" style="display: flex; align-items: center; gap: 6px;">
                            ${f.title}
                            ${f.is_private ? '<i data-lucide="lock" class="fav-lock-badge-manager" style="width: 12px; height: 12px; opacity: 0.7;"></i>' : ''}
                        </div>
                        <a href="${f.url}" target="_blank" class="fav-manager-url muted-text">${f.url}</a>
                    `;
                    info.appendChild(details);
                    card.appendChild(info);
                    
                    // Edit controls (only if owned / logged in)
                    if (AppState.user && (f.user_id === AppState.user.id || AppState.user.role === 'admin')) {
                        const editBtn = document.createElement('button');
                        editBtn.className = 'icon-btn';
                        editBtn.innerHTML = '<i data-lucide="edit"></i>';
                        editBtn.onclick = () => this.openFavModal(f);
                        card.appendChild(editBtn);
                    }
                    
                    grid.appendChild(card);
                });
                
                catSection.appendChild(grid);
                container.appendChild(catSection);
            });
            
            lucide.createIcons();
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-triangle"></i><span>${err.message}</span></div>`;
            lucide.createIcons();
        }
    },
    
    async populateCategoriesDatalist() {
        await this.populateCategorySelect();
    },
    
    _resolveIconType(f) {
        if (!f) return 'auto';
        if (f.icon_type === 'asset' || f.icon_type === 'image') return f.icon_type;
        if (f.icon_type === 'icon' && f.icon_value && f.icon_value !== 'link' && f.icon_value !== 'auto') {
            return 'icon';
        }
        return 'auto';
    },

    _syncFavIconFields() {
        const iconType = document.getElementById('fav-icon-type');
        const lucideGroup = document.getElementById('fav-icon-lucide-group');
        const urlGroup = document.getElementById('fav-icon-url-group');
        const assetGroup = document.getElementById('fav-icon-asset-group');
        if (!iconType) return;
        const t = iconType.value;
        lucideGroup.classList.toggle('hidden', t !== 'icon');
        urlGroup.classList.toggle('hidden', t !== 'image');
        assetGroup.classList.toggle('hidden', t !== 'asset');
    },

    _updateFavIconPreview() {
        const preview = document.getElementById('fav-icon-preview');
        const iconType = document.getElementById('fav-icon-type');
        const urlInput = document.getElementById('fav-url-input');
        if (!preview || !iconType) return;

        preview.innerHTML = '';
        const mockFav = {
            title: document.getElementById('fav-title-input')?.value || '',
            url: urlInput?.value || '',
            icon_type: iconType.value,
            icon_value: '',
        };
        if (mockFav.icon_type === 'icon') {
            mockFav.icon_value = document.getElementById('fav-icon-val')?.value.trim() || 'link';
        } else if (mockFav.icon_type === 'image') {
            mockFav.icon_value = document.getElementById('fav-icon-url')?.value.trim() || '';
        } else if (mockFav.icon_type === 'asset') {
            mockFav.icon_value = document.getElementById('fav-icon-asset-id')?.value || '';
        }
        window.FavoritesIcon.appendTo(preview, mockFav);
        window.refreshLucideIcons && window.refreshLucideIcons(preview);
    },

    async _initFavAssetPicker(selectedId) {
        const picker = document.getElementById('fav-icon-asset-picker');
        if (!picker || !window.AssetLibrary) return;
        await AssetLibrary.renderPicker(picker, {
            category: 'icon',
            selectedValue: selectedId ? String(selectedId) : null,
            showGlobalToggle: true,
            onSelect: (val) => {
                document.getElementById('fav-icon-asset-id').value = val;
                this._updateFavIconPreview();
            },
        });
    },

    openFavModal(f = null) {
        FavoritesController.populateCategorySelect(f ? (f.category || '') : '');
        const modal = document.getElementById('fav-modal');
        const form = document.getElementById('fav-form');
        const idInput = document.getElementById('fav-id-input');
        const titleInput = document.getElementById('fav-title-input');
        const urlInput = document.getElementById('fav-url-input');
        const catSelect = document.getElementById('fav-category-select');
        const iconType = document.getElementById('fav-icon-type');
        const iconVal = document.getElementById('fav-icon-val');
        const iconUrl = document.getElementById('fav-icon-url');
        const iconAssetId = document.getElementById('fav-icon-asset-id');
        const deleteBtn = document.getElementById('btn-delete-fav');
        const modalTitle = document.getElementById('fav-modal-title');
        const privateInput = document.getElementById('fav-private-input');
        const privateGroup = document.getElementById('fav-private-group');
        
        form.reset();
        
        if (AppState.editingPublicLayout) {
            privateGroup.classList.add('hidden');
            privateInput.checked = false;
        } else {
            privateGroup.classList.remove('hidden');
            privateInput.checked = f ? !!f.is_private : false;
        }

        const resolvedType = this._resolveIconType(f);
        iconType.value = resolvedType;

        if (f) {
            modalTitle.textContent = 'Link bearbeiten';
            idInput.value = f.id;
            titleInput.value = f.title;
            urlInput.value = f.url;
            if (catSelect) catSelect.value = f.category || '';
            iconVal.value = f.icon_type === 'icon' ? (f.icon_value || 'link') : '';
            if (iconUrl) iconUrl.value = f.icon_type === 'image' ? (f.icon_value || '') : '';
            if (iconAssetId) iconAssetId.value = f.icon_type === 'asset' ? (f.icon_value || '') : '';
            deleteBtn.classList.remove('hidden');
        } else {
            modalTitle.textContent = 'Favorit hinzufügen';
            idInput.value = '';
            iconType.value = 'auto';
            deleteBtn.classList.add('hidden');
        }

        this._syncFavIconFields();
        this._initFavAssetPicker(iconAssetId ? iconAssetId.value : null);
        this._updateFavIconPreview();

        if (!iconType.dataset.bound) {
            iconType.dataset.bound = '1';
            iconType.addEventListener('change', () => {
                this._syncFavIconFields();
                this._updateFavIconPreview();
            });
            [iconVal, iconUrl, urlInput, titleInput].forEach((el) => {
                if (el) el.addEventListener('input', () => this._updateFavIconPreview());
            });
        }
        
        // Save triggers
        form.onsubmit = async (e) => {
            e.preventDefault();

            let saveIconType = iconType.value;
            let saveIconValue = '';
            if (saveIconType === 'icon') {
                saveIconValue = iconVal.value.trim() || 'link';
            } else if (saveIconType === 'image') {
                saveIconValue = iconUrl.value.trim();
            } else if (saveIconType === 'asset') {
                saveIconValue = iconAssetId.value.trim();
                if (!saveIconValue) {
                    showToast('Bitte ein Icon aus der Bibliothek wählen.', 'error');
                    return;
                }
            } else if (saveIconType === 'auto') {
                saveIconValue = '';
            }
            
            const favData = {
                title: titleInput.value.trim(),
                url: urlInput.value.trim(),
                category: catSelect ? catSelect.value.trim() : '',
                icon_type: saveIconType,
                icon_value: saveIconValue,
                is_private: privateInput.checked,
                is_public: AppState.editingPublicLayout
            };
            
            try {
                if (idInput.value) {
                    await API.updateFavorite(idInput.value, favData);
                } else {
                    await API.createFavorite(favData);
                }
                modal.classList.remove('open');
                await FavoritesController.loadFavorites({ silent: true });
                
                if (window.DashboardController) {
                    await window.DashboardController.refreshWidgetsByType('favorites', {
                        force: true,
                        silent: true,
                    });
                }
            } catch (err) {
                showToast("Fehler beim Speichern: " + err.message, "error");
            }
        };
        
        // Delete triggers
        deleteBtn.onclick = async (e) => {
            e.preventDefault();
            const ok = await showAppConfirm(window.i18n.translate('confirm_delete_fav'), {
                title: 'Lesezeichen löschen',
                danger: true,
            });
            if (!ok) return;
            try {
                await API.deleteFavorite(idInput.value);
                modal.classList.remove('open');
                await FavoritesController.loadFavorites({ silent: true });
                if (window.DashboardController) {
                    await window.DashboardController.refreshWidgetsByType('favorites', {
                        force: true,
                        silent: true,
                    });
                }
            } catch (err) {
                showToast("Fehler beim Löschen: " + err.message, "error");
            }
        };
        
        modal.classList.add('open');
    },

    async openCategoryModal() {
        const name = await showAppPrompt(this.tr('fav_category') + ':', {
            title: this.tr('fav_add_category'),
            placeholder: this.tr('fav_category'),
            confirmLabel: this.tr('btn_save'),
        });
        if (!name || !name.trim()) return;
        if (this.addExtraCategory(name.trim())) {
            const order = await this.loadCategoryOrder();
            if (!order.includes(name.trim())) {
                order.push(name.trim());
                await this.saveCategoryOrder(order);
            }
            this.loadFavorites();
            showToast && showToast(this.tr('fav_add_category'), 'success');
        }
    },

    async openCategorySortModal() {
        const modal = document.getElementById('fav-category-sort-modal');
        const list = document.getElementById('fav-category-sort-list');
        if (!modal || !list) return;

        const categories = await this.getAllCategories();
        list.innerHTML = '';
        if (!categories.length) {
            list.innerHTML = `<li class="muted-text">${this.tr('fav_no_categories')}</li>`;
            modal.classList.add('open');
            lucide.createIcons();
            return;
        }

        categories.forEach((cat, index) => {
            const li = document.createElement('li');
            li.className = 'fav-category-sort-item';
            li.draggable = true;
            li.dataset.category = cat;
            li.innerHTML = `
                <i data-lucide="grip-vertical" class="fav-category-sort-grip"></i>
                <span class="fav-category-sort-label">${this.displayCategoryName(cat)}</span>
                <div class="fav-category-sort-actions">
                    <button type="button" class="icon-btn fav-cat-sort-up" title="Up"><i data-lucide="chevron-up"></i></button>
                    <button type="button" class="icon-btn fav-cat-sort-down" title="Down"><i data-lucide="chevron-down"></i></button>
                </div>
            `;
            li.addEventListener('dragstart', () => {
                li.classList.add('dragging');
            });
            li.addEventListener('dragend', () => {
                li.classList.remove('dragging');
            });
            li.querySelector('.fav-cat-sort-up')?.addEventListener('click', () => {
                const prev = li.previousElementSibling;
                if (prev) list.insertBefore(li, prev);
            });
            li.querySelector('.fav-cat-sort-down')?.addEventListener('click', () => {
                const next = li.nextElementSibling;
                if (next) list.insertBefore(next, li);
            });
            list.appendChild(li);
        });

        if (!list.dataset.dndBound) {
            list.dataset.dndBound = '1';
            list.addEventListener('dragover', (e) => {
                e.preventDefault();
                const dragging = list.querySelector('.dragging');
                const after = [...list.querySelectorAll('.fav-category-sort-item:not(.dragging)')]
                    .find((el) => e.clientY <= el.getBoundingClientRect().top + el.offsetHeight / 2);
                if (dragging) {
                    if (after) list.insertBefore(dragging, after);
                    else list.appendChild(dragging);
                }
            });
        }

        const saveBtn = document.getElementById('btn-save-category-order');
        if (saveBtn) {
            saveBtn.onclick = async () => {
                const order = [...list.querySelectorAll('.fav-category-sort-item')]
                    .map((el) => el.dataset.category)
                    .filter(Boolean);
                await this.saveCategoryOrder(order);
                modal.classList.remove('open');
                showToast && showToast(this.tr('fav_sort_saved'), 'success');
                await this.loadFavorites({ silent: true });
            };
        }

        modal.classList.add('open');
        lucide.createIcons();
    },
};

window.FavoritesController = FavoritesController;

function initFavoritesButton() {
    const btnAdd = document.getElementById('btn-add-favorite');
    const btnCat = document.getElementById('btn-add-category');
    const btnSort = document.getElementById('btn-sort-categories');
    if (btnAdd) {
        btnAdd.onclick = () => FavoritesController.openFavModal();
    }
    if (btnCat) {
        btnCat.onclick = () => FavoritesController.openCategoryModal();
    }
    if (btnSort) {
        btnSort.onclick = () => FavoritesController.openCategorySortModal();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFavoritesButton);
} else {
    initFavoritesButton();
}
