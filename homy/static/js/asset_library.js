/**
 * Shared asset & package upload UI (icons, backgrounds, ZIP templates/modules).
 */
window.AssetLibrary = {
    _assetsCache: {},
    _renderAssetManagerToken: 0,

    isAdmin() {
        return window.AppState && AppState.user && AppState.user.role === 'admin';
    },

    async listAssets(category, scope = 'all') {
        const key = `${category || 'all'}:${scope}`;
        const q = new URLSearchParams();
        if (category) q.set('category', category);
        if (scope) q.set('scope', scope);
        const data = await API.request(`/api/assets?${q.toString()}`);
        this._assetsCache[key] = data;
        return data;
    },

    async uploadAsset(file, { category = 'icon', isGlobal = false, onProgress = null } = {}) {
        const form = new FormData();
        form.append('file', file);
        form.append('category', category);
        form.append('is_global', isGlobal ? 'true' : 'false');

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/assets');
            xhr.withCredentials = true;

            if (onProgress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) onProgress(e.loaded / e.total);
                });
            }

            xhr.addEventListener('load', () => {
                let data = {};
                try { data = JSON.parse(xhr.responseText); } catch (_) {}
                if (xhr.status >= 200 && xhr.status < 300) {
                    this._assetsCache = {};
                    resolve(data);
                } else {
                    reject(new Error(data.message || 'Upload fehlgeschlagen'));
                }
            });

            xhr.addEventListener('error', () => reject(new Error('Upload fehlgeschlagen')));
            xhr.send(form);
        });
    },

    async deleteAsset(id) {
        await API.request(`/api/assets/${id}`, { method: 'DELETE' });
        this._assetsCache = {};
    },

    async updateAsset(id, data) {
        const result = await API.request(`/api/assets/${id}`, {
            method: 'PUT',
            body: data,
        });
        this._assetsCache = {};
        return result;
    },

    async listPackages(type, scope = 'all') {
        const q = new URLSearchParams();
        if (type) q.set('type', type);
        if (scope) q.set('scope', scope);
        return API.request(`/api/packages?${q.toString()}`);
    },

    async uploadPackage(file, { packageType = 'template', isGlobal = false } = {}) {
        const form = new FormData();
        form.append('file', file);
        form.append('package_type', packageType);
        form.append('is_global', isGlobal ? 'true' : 'false');

        const response = await fetch('/api/packages', {
            method: 'POST',
            body: form,
            credentials: 'same-origin',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.message || 'Upload fehlgeschlagen');
        }
        return data;
    },

    async deletePackage(id) {
        await API.request(`/api/packages/${id}`, { method: 'DELETE' });
    },

    async installPackage(id) {
        return API.request(`/api/packages/${id}/install`, { method: 'POST' });
    },

    faviconUrl(pageUrl) {
        if (!pageUrl) return '/static/media/fallback-icon.svg';
        return `/api/favicon?url=${encodeURIComponent(pageUrl)}`;
    },

    _ensureDetailModal() {
        return document.getElementById('asset-detail-modal');
    },

    openAssetDetail(asset, options = {}) {
        const modal = this._ensureDetailModal();
        if (!modal || !asset) return;

        const onChanged = options.onChanged || null;
        const preview = modal.querySelector('#asset-detail-preview');
        const nameInput = modal.querySelector('#asset-detail-name');
        const globalGroup = modal.querySelector('#asset-detail-global-group');
        const globalCheck = modal.querySelector('#asset-detail-global');
        const meta = modal.querySelector('#asset-detail-meta');
        const title = modal.querySelector('#asset-detail-title');
        const deleteBtn = modal.querySelector('#asset-detail-delete');
        const saveBtn = modal.querySelector('#asset-detail-save');

        title.textContent = asset.category === 'background'
            ? window.i18n.translate('asset_edit_background')
            : window.i18n.translate('asset_edit_icon');
        nameInput.value = asset.original_name || '';
        globalCheck.checked = !!asset.is_global;
        globalGroup.classList.toggle('hidden', !asset.can_global);

        preview.innerHTML = '';
        const img = document.createElement('img');
        img.src = asset.url;
        img.alt = asset.original_name || '';
        preview.appendChild(img);

        const sizeKb = Math.round((asset.size_bytes || 0) / 1024);
        meta.textContent = `${asset.mime_type || ''} · ${sizeKb} KB · ${asset.is_global ? 'Global' : 'Privat'}`;

        deleteBtn.classList.toggle('hidden', !asset.can_edit);
        saveBtn.classList.toggle('hidden', !asset.can_edit);
        nameInput.disabled = !asset.can_edit;
        globalCheck.disabled = !asset.can_global;

        const close = () => modal.classList.remove('open');

        modal.querySelectorAll('.btn-close-asset-detail').forEach(btn => {
            btn.onclick = close;
        });

        saveBtn.onclick = async () => {
            try {
                await this.updateAsset(asset.id, {
                    original_name: nameInput.value.trim(),
                    is_global: globalCheck.checked,
                });
                showToast && showToast(window.i18n.translate('asset_saved'), 'success');
                close();
                if (typeof onChanged === 'function') onChanged();
            } catch (err) {
                showToast && showToast(err.message, 'error');
            }
        };

        deleteBtn.onclick = async () => {
            const ok = await showAppConfirm(
                window.i18n.translate('asset_delete_confirm'),
                { danger: true, title: window.i18n.translate('asset_delete_title') },
            );
            if (!ok) return;
            try {
                await this.deleteAsset(asset.id);
                showToast && showToast(window.i18n.translate('asset_deleted'), 'success');
                close();
                if (typeof onChanged === 'function') onChanged();
            } catch (err) {
                showToast && showToast(err.message, 'error');
            }
        };

        modal.classList.add('open');
        window.refreshLucideIcons && window.refreshLucideIcons(modal);
    },

    renderUploadRow(container, options = {}) {
        const {
            category = 'icon',
            isGlobal = false,
            showGlobalToggle = false,
            accept = 'image/*',
            onUploaded,
        } = options;

        container.innerHTML = '';
        const row = document.createElement('div');
        row.className = 'asset-upload-row';

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.className = 'asset-upload-input hidden';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-outline btn-sm';
        btn.innerHTML = `<i data-lucide="upload"></i> ${window.i18n.translate('asset_upload_btn')}`;

        let globalWrap = null;
        if (showGlobalToggle && this.isAdmin()) {
            globalWrap = document.createElement('label');
            globalWrap.className = 'checkbox-label-container asset-global-toggle';
            globalWrap.innerHTML = `
                <input type="checkbox" class="asset-global-checkbox">
                <span>${window.i18n.translate('asset_global_toggle')}</span>
            `;
        }

        btn.addEventListener('click', () => input.click());

        input.addEventListener('change', async () => {
            const file = input.files && input.files[0];
            if (!file) return;
            btn.disabled = true;

            const progressWrap = document.createElement('div');
            progressWrap.className = 'upload-progress-wrap';
            const progressBar = document.createElement('div');
            progressBar.className = 'upload-progress-bar';
            progressBar.style.width = '0%';
            progressWrap.appendChild(progressBar);
            row.appendChild(progressWrap);

            try {
                const global = globalWrap && globalWrap.querySelector('.asset-global-checkbox').checked;
                const asset = await this.uploadAsset(file, {
                    category,
                    isGlobal: global || isGlobal,
                    onProgress: (pct) => {
                        progressBar.style.width = `${Math.round(pct * 100)}%`;
                    },
                });
                showToast && showToast(window.i18n.translate('asset_uploaded'), 'success');
                if (typeof onUploaded === 'function') onUploaded(asset);
            } catch (err) {
                showToast && showToast(err.message, 'error');
            } finally {
                btn.disabled = false;
                input.value = '';
                progressWrap.remove();
            }
        });

        row.appendChild(btn);
        if (globalWrap) row.appendChild(globalWrap);
        row.appendChild(input);
        container.appendChild(row);
        window.refreshLucideIcons && window.refreshLucideIcons(row);
    },

    async renderPicker(container, options = {}) {
        const {
            category = 'icon',
            selectedValue = null,
            onSelect,
            allowUpload = true,
            showGlobalToggle = true,
            extraOptions = [],
            mode = 'select',
        } = options;

        container.innerHTML = '<div class="asset-picker-loading muted-text">Lade Medien…</div>';

        let assets = [];
        try {
            assets = await this.listAssets(category, 'all');
        } catch (err) {
            container.innerHTML = `<div class="widget-error">${err.message}</div>`;
            return;
        }

        container.innerHTML = '';

        if (allowUpload && AppState.user) {
            const uploadHost = document.createElement('div');
            uploadHost.className = 'asset-picker-upload';
            this.renderUploadRow(uploadHost, {
                category,
                showGlobalToggle,
                onUploaded: async () => {
                    await this.renderPicker(container, options);
                },
            });
            container.appendChild(uploadHost);
        }

        const grid = document.createElement('div');
        grid.className = 'asset-picker-grid';

        extraOptions.forEach((opt) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `asset-picker-item${selectedValue === opt.value ? ' selected' : ''}`;
            btn.dataset.value = opt.value;
            btn.title = opt.label;
            btn.innerHTML = opt.html || `<span>${opt.label}</span>`;
            btn.addEventListener('click', () => {
                grid.querySelectorAll('.asset-picker-item').forEach(el => el.classList.remove('selected'));
                btn.classList.add('selected');
                if (typeof onSelect === 'function') onSelect(opt.value, opt);
            });
            grid.appendChild(btn);
        });

        if (!assets.length && !extraOptions.length) {
            const empty = document.createElement('p');
            empty.className = 'muted-text asset-picker-empty';
            empty.textContent = window.i18n.translate('asset_empty');
            container.appendChild(empty);
            return;
        }

        assets.forEach((asset) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            const val = String(asset.id);
            btn.className = `asset-picker-item${selectedValue === val ? ' selected' : ''}`;
            btn.dataset.value = val;
            btn.title = asset.original_name + (asset.is_global ? ' (global)' : '');

            const img = document.createElement('img');
            img.src = asset.url;
            img.alt = asset.original_name;
            btn.appendChild(img);

            if (asset.is_global) {
                const badge = document.createElement('span');
                badge.className = 'asset-picker-badge';
                badge.textContent = 'Global';
                btn.appendChild(badge);
            }

            btn.addEventListener('click', () => {
                if (mode === 'manage') {
                    this.openAssetDetail(asset, {
                        onChanged: () => this.renderPicker(container, options),
                    });
                    return;
                }
                grid.querySelectorAll('.asset-picker-item').forEach(el => el.classList.remove('selected'));
                btn.classList.add('selected');
                if (typeof onSelect === 'function') onSelect(val, asset);
            });
            grid.appendChild(btn);
        });

        container.appendChild(grid);
    },

    async renderPackagePanel(container, options = {}) {
        const { showInstall = true, showGlobalToggle = true } = options;
        if (!AppState.user) {
            container.innerHTML = '<p class="muted-text">Bitte anmelden.</p>';
            return;
        }

        container.innerHTML = `
            <div class="package-upload-tabs">
                <button type="button" class="btn btn-outline btn-sm package-type-btn active" data-type="template">Template</button>
                <button type="button" class="btn btn-outline btn-sm package-type-btn" data-type="module">Modul</button>
                <button type="button" class="btn btn-outline btn-sm package-type-btn" data-type="integration">Integration</button>
            </div>
            <div class="package-upload-controls"></div>
            <div class="package-list"></div>
        `;

        let currentType = 'template';
        const controls = container.querySelector('.package-upload-controls');
        const listEl = container.querySelector('.package-list');

        const renderControls = () => {
            controls.innerHTML = '';
            const row = document.createElement('div');
            row.className = 'asset-upload-row';

            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.zip';
            input.className = 'hidden';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-primary btn-sm';
            btn.innerHTML = '<i data-lucide="archive"></i> ZIP hochladen';

            let globalWrap = null;
            if (showGlobalToggle && this.isAdmin()) {
                globalWrap = document.createElement('label');
                globalWrap.className = 'checkbox-label-container asset-global-toggle';
                globalWrap.innerHTML = `<input type="checkbox" class="asset-global-checkbox"><span>Für alle nutzbar</span>`;
            }

            btn.addEventListener('click', () => input.click());
            input.addEventListener('change', async () => {
                const file = input.files && input.files[0];
                if (!file) return;
                btn.disabled = true;
                try {
                    const isGlobal = globalWrap && globalWrap.querySelector('.asset-global-checkbox').checked;
                    const pkg = await this.uploadPackage(file, { packageType: currentType, isGlobal });
                    const msg = pkg.status === 'valid' ? 'Paket gültig' : pkg.validation_message;
                    showToast && showToast(msg, pkg.status === 'valid' ? 'success' : 'error');
                    await renderList();
                } catch (err) {
                    showToast && showToast(err.message, 'error');
                } finally {
                    btn.disabled = false;
                    input.value = '';
                }
            });

            row.appendChild(btn);
            if (globalWrap) row.appendChild(globalWrap);
            row.appendChild(input);
            controls.appendChild(row);
            window.refreshLucideIcons && window.refreshLucideIcons(row);
        };

        const renderList = async () => {
            listEl.innerHTML = '<div class="spinner" style="margin:16px auto;"></div>';
            let packages = [];
            try {
                packages = await this.listPackages(currentType, 'all');
            } catch (err) {
                listEl.innerHTML = `<p class="text-danger">${err.message}</p>`;
                return;
            }

            listEl.innerHTML = '';
            if (!packages.length) {
                listEl.innerHTML = '<p class="muted-text">Keine Pakete dieses Typs.</p>';
                return;
            }

            const grid = document.createElement('div');
            grid.className = 'package-preview-grid';

            packages.forEach((pkg) => {
                const card = document.createElement('div');
                card.className = `package-preview-card glass ${pkg.status}`;

                const thumb = document.createElement('div');
                thumb.className = 'package-preview-thumb';
                if (pkg.preview_url) {
                    thumb.innerHTML = `<img src="${pkg.preview_url}" alt="">`;
                } else {
                    thumb.innerHTML = `<i data-lucide="file-archive"></i>`;
                }

                const meta = document.createElement('div');
                meta.className = 'package-preview-meta';
                const name = (pkg.manifest && pkg.manifest.name) || pkg.original_name;
                meta.innerHTML = `
                    <strong>${name}</strong>
                    <span class="muted-text">${pkg.original_name}</span>
                    <span class="package-status-badge badge-${pkg.status}">${pkg.validation_message || pkg.status}</span>
                `;

                const actions = document.createElement('div');
                actions.className = 'package-preview-actions';

                if (showInstall && this.isAdmin() && (pkg.package_type === 'module' || pkg.package_type === 'integration') && pkg.status === 'valid') {
                    const installBtn = document.createElement('button');
                    installBtn.type = 'button';
                    installBtn.className = 'btn btn-primary btn-sm';
                    installBtn.textContent = 'Installieren';
                    installBtn.addEventListener('click', async () => {
                        try {
                            const res = await this.installPackage(pkg.id);
                            const label = res.module_id || res.integration_id || 'Paket';
                            showToast && showToast(`${pkg.package_type === 'integration' ? 'Integration' : 'Modul'} "${label}" installiert`, 'success');
                            await renderList();
                        } catch (err) {
                            showToast && showToast(err.message, 'error');
                        }
                    });
                    actions.appendChild(installBtn);
                }

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'icon-btn text-danger';
                delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
                delBtn.addEventListener('click', async () => {
                    const ok = await showAppConfirm(window.i18n.translate('asset_package_delete_confirm'), { danger: true });
                    if (!ok) return;
                    try {
                        await this.deletePackage(pkg.id);
                        showToast && showToast(window.i18n.translate('asset_deleted'), 'success');
                        await renderList();
                    } catch (err) {
                        showToast && showToast(err.message, 'error');
                    }
                });
                actions.appendChild(delBtn);

                card.appendChild(thumb);
                card.appendChild(meta);
                card.appendChild(actions);
                grid.appendChild(card);
            });

            listEl.appendChild(grid);
            window.refreshLucideIcons && window.refreshLucideIcons(grid);
        };

        container.querySelectorAll('.package-type-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.package-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentType = btn.dataset.type;
                renderControls();
                renderList();
            });
        });

        renderControls();
        renderList();
    },

    async renderAssetManager(container, options = {}) {
        const { categories = ['icon', 'background'] } = options;
        const token = ++this._renderAssetManagerToken;
        const uniqueCategories = [...new Set(categories)];
        container.innerHTML = '';

        for (const cat of uniqueCategories) {
            if (token !== this._renderAssetManagerToken) return;
            const section = document.createElement('div');
            section.className = 'asset-manager-section';
            const label = cat === 'background' ? 'Hintergründe' : 'Icons';
            section.innerHTML = `<h4>${label}</h4><p class="muted-text asset-manager-hint">${window.i18n.translate('asset_manager_hint')}</p><div class="asset-manager-picker"></div>`;
            container.appendChild(section);
            await this.renderPicker(section.querySelector('.asset-manager-picker'), {
                category: cat,
                showGlobalToggle: true,
                mode: 'manage',
                onSelect: () => {},
            });
        }
    },
};
