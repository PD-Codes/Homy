/**
 * Admin panel: tabbed settings, users, audit, backup, stats.
 */
(function () {
    'use strict';

    function bindEllipsisTitles(root) {
        const scope = root && root.querySelectorAll ? root : document;
        scope.querySelectorAll(
            '.admin-health-detail, .admin-module-name, .admin-module-desc, .profile-name, .audit-log-message',
        ).forEach((el) => {
            const text = (el.textContent || '').trim();
            if (!text) return;
            requestAnimationFrame(() => {
                if (el.scrollWidth > el.clientWidth + 2) {
                    el.title = text;
                }
            });
        });
    }

    window.AdminEllipsisTitles = bindEllipsisTitles;

    const FIELD_MAP = {
        'admin-site-title': 'site_title',
        'admin-site-logo-url': 'site_logo_url',
        'admin-default-locale': 'default_locale',
        'admin-maintenance-mode': 'maintenance_mode',
        'admin-license-text': 'license_text',
        'admin-default-user-role': 'default_user_role',
        'admin-registration-enabled': 'registration_enabled',
        'admin-session-cookie-days': 'session_cookie_days',
        'admin-password-min-length': 'password_min_length',
        'admin-password-require-upper': 'password_require_upper',
        'admin-auth-mfa': 'auth_mfa_required',
        'admin-auth-ldap': 'auth_ldap_enabled',
        'admin-auth-oidc': 'auth_oidc_enabled',
        'admin-auth-saml': 'auth_saml_enabled',
        'admin-auth-ldap-config': 'auth_ldap_config',
        'admin-auth-oidc-config': 'auth_oidc_config',
        'admin-auth-saml-config': 'auth_saml_config',
        'admin-weather-key': 'global_weather_key',
        'admin-custom-dns': 'custom_dns_servers',
        'admin-default-theme': 'default_theme',
        'admin-default-refresh': 'default_widget_refresh',
        'admin-smtp-host': 'smtp_host',
        'admin-smtp-port': 'smtp_port',
        'admin-smtp-user': 'smtp_user',
        'admin-smtp-password': 'smtp_password',
        'admin-smtp-from': 'smtp_from',
        'admin-smtp-tls': 'smtp_tls',
        'admin-ip-whitelist': 'security_ip_whitelist',
        'admin-trusted-proxies': 'security_trusted_proxies',
        'admin-csp': 'security_csp',
        'admin-cors': 'security_cors_origins',
        'admin-layout-lock': 'global_layout_locked',
        'admin-audit-log-limit': 'audit_log_limit',
        'admin-upload-max-avatar': 'upload_max_avatar_mb',
        'admin-upload-max-icon': 'upload_max_icon_mb',
        'admin-upload-max-background': 'upload_max_background_mb',
        'admin-upload-max-package': 'upload_max_package_mb',
    };

    const GROUP_FIELDS = {
        system: [
            'site_title', 'site_logo_url', 'default_locale', 'maintenance_mode', 'audit_log_limit',
            'upload_max_avatar_mb', 'upload_max_icon_mb', 'upload_max_background_mb', 'upload_max_package_mb',
        ],
        users: ['default_user_role', 'registration_enabled'],
        auth: [
            'session_cookie_days', 'password_min_length', 'password_require_upper',
            'auth_ldap_enabled', 'auth_oidc_enabled', 'auth_saml_enabled', 'auth_mfa_required',
            'auth_ldap_config', 'auth_oidc_config', 'auth_saml_config',
        ],
        api: ['global_weather_key', 'custom_dns_servers', 'default_theme', 'default_widget_refresh'],
        notify: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from', 'smtp_tls'],
        security: ['security_ip_whitelist', 'security_trusted_proxies', 'security_csp', 'security_cors_origins', 'global_layout_locked'],
    };

    function boolToSetting(checked) {
        return checked ? 'true' : 'false';
    }

    function settingToBool(value) {
        if (value === undefined || value === null) return false;
        const v = String(value).trim().toLowerCase();
        return v === '1' || v === 'true' || v === 'yes' || v === 'on' || v === 'ja';
    }

    function el(id) {
        return document.getElementById(id);
    }

    function _t(key, params) {
        return window.i18n?.translate(key, params) ?? key;
    }

    function healthDetailText(item) {
        if (item.detail_key) {
            return _t(item.detail_key, item.detail_params);
        }
        return item.detail || '';
    }

    function buildAdminToggleSwitch(checked, onChange) {
        const switchLabel = document.createElement('label');
        switchLabel.className = 'switch';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.style.cssText = 'opacity:0;width:0;height:0;';
        const slider = document.createElement('span');
        slider.style.cssText = 'position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;border-radius:20px;transition:.3s;';
        const knob = document.createElement('span');
        knob.style.cssText = 'position:absolute;height:14px;width:14px;bottom:3px;background:#fff;border-radius:50%;transition:.3s;';
        const sync = () => {
            slider.style.backgroundColor = input.checked ? 'var(--success)' : '#4b5563';
            knob.style.left = input.checked ? '22px' : '3px';
        };
        sync();
        slider.appendChild(knob);
        switchLabel.appendChild(input);
        switchLabel.appendChild(slider);
        input.onchange = async () => {
            input.disabled = true;
            try {
                await onChange(input.checked);
                sync();
            } catch (err) {
                input.checked = !input.checked;
                sync();
                throw err;
            } finally {
                input.disabled = false;
            }
        };
        return switchLabel;
    }

    const AdminPanel = {
        settings: {},
        _lastSystemInfo: null,
        _lastHealthData: null,

        init() {
            document.addEventListener('localeChanged', () => {
                window.i18n?.translateDOM?.();
                if (this._lastSystemInfo) this.renderSystemInfo(this._lastSystemInfo);
                if (this._lastHealthData) this.renderHealth(this._lastHealthData);
                this.loadJobs();
            });
            this.bindTabs();
            this.bindSaveButtons();
            this.bindModals();
            this.bindTests();
            this.bindBackup();
            this.bindUserForm();
            this.bindUserNotifications();
            this.bindHealth();
            this.bindGroups();
            this.bindJobs();
            this.bindFullBackup();
            this.bindHealthThresholds();
            this.bindAuthSubTabs();
            this.bindSiteLogoUpload();
            const licenseField = el('admin-license-text');
            if (licenseField) licenseField.readOnly = true;
        },

        bindSiteLogoUpload() {
            const fileInput = el('admin-site-logo-file');
            const pickBtn = el('btn-admin-site-logo-pick');
            const clearBtn = el('btn-admin-site-logo-clear');
            const preview = el('admin-site-logo-preview');
            if (!fileInput || !pickBtn) return;

            const refreshPreview = () => {
                const url = AppState.authPolicy?.siteLogoUrl || '';
                const isUpload = url && url.startsWith('/api/branding/');
                if (preview && isUpload) {
                    preview.src = `${url}?t=${Date.now()}`;
                    preview.classList.remove('hidden');
                    clearBtn?.classList.remove('hidden');
                } else if (preview) {
                    preview.classList.add('hidden');
                    clearBtn?.classList.add('hidden');
                }
            };

            pickBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async () => {
                const file = fileInput.files?.[0];
                fileInput.value = '';
                if (!file) return;
                const form = new FormData();
                form.append('file', file);
                try {
                    const res = await fetch('/api/admin/site-logo', {
                        method: 'POST',
                        body: form,
                        credentials: 'same-origin',
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) throw new Error(data.message || 'Upload failed');
                    AppState.authPolicy.siteLogoUrl = data.site_logo_url || '/api/branding/logo';
                    window.applySiteBranding?.(AppState.authPolicy);
                    refreshPreview();
                    showToast(_t('admin_site_logo_uploaded'), 'success');
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });
            clearBtn?.addEventListener('click', async () => {
                try {
                    await API.request('/api/admin/site-logo', { method: 'DELETE' });
                    const extUrl = el('admin-site-logo-url')?.value?.trim();
                    AppState.authPolicy.siteLogoUrl = extUrl || '';
                    window.applySiteBranding?.(AppState.authPolicy);
                    refreshPreview();
                    showToast(_t('admin_site_logo_cleared'), 'success');
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });

            this._refreshSiteLogoPreview = refreshPreview;
        },

        bindAuthSubTabs() {
            const nav = el('admin-auth-subtab-nav');
            if (!nav) return;
            nav.querySelectorAll('.admin-subtab').forEach((tab) => {
                tab.addEventListener('click', () => {
                    const id = tab.getAttribute('data-auth-tab');
                    nav.querySelectorAll('.admin-subtab').forEach((t) => t.classList.toggle('active', t === tab));
                    document.querySelectorAll('[data-auth-panel]').forEach((p) => {
                        p.classList.toggle('active', p.getAttribute('data-auth-panel') === id);
                    });
                    window.refreshLucideIcons?.();
                });
            });
        },

        bindHealth() {
            el('btn-admin-health-refresh')?.addEventListener('click', () => this.loadHealth());
        },

        statusLabel(status) {
            return _t(`health_status_${status}`) || status;
        },

        renderHealth(data) {
            const grid = el('admin-health-grid');
            const overall = el('admin-health-overall');
            const footer = el('admin-health-footer');
            if (!grid || !data) return;

            if (overall) {
                overall.textContent = this.statusLabel(data.overall);
                overall.setAttribute('data-status', data.overall || 'ok');
            }
            if (footer && data.checked_at) {
                try {
                    footer.textContent = _t('admin_health_checked', {
                        time: new Date(data.checked_at).toLocaleString(),
                    });
                } catch {
                    footer.textContent = '';
                }
            }

            grid.innerHTML = '';
            (data.checks || []).forEach((item) => {
                const row = document.createElement('div');
                row.className = 'admin-health-row';
                const label = document.createElement('span');
                label.className = 'admin-health-label';
                label.textContent = _t(item.label_key || item.label);

                const badge = document.createElement('span');
                badge.className = `admin-health-badge status-${item.status || 'ok'}`;
                badge.textContent = this.statusLabel(item.status);

                const detail = document.createElement('span');
                detail.className = 'admin-health-detail muted-text';
                let detailText = healthDetailText(item);
                if (item.latency_ms != null && item.status === 'ok') {
                    detailText = detailText
                        ? _t('health_latency_suffix', { detail: detailText, ms: item.latency_ms })
                        : _t('health_latency_ms', { ms: item.latency_ms });
                }
                detail.textContent = detailText;

                row.appendChild(label);
                row.appendChild(badge);
                row.appendChild(detail);
                grid.appendChild(row);
            });
            bindEllipsisTitles(grid);
            window.refreshLucideIcons?.();
        },

        async loadHealth() {
            const grid = el('admin-health-grid');
            if (!grid) return;

            try {
                const data = await API.adminGetHealth();
                this._lastHealthData = data;
                this.renderHealth(data);
            } catch (err) {
                grid.innerHTML = `<div class="admin-health-loading text-danger">${_t('health_load_error', { message: err.message })}</div>`;
            }
        },

        bindTabs() {
            const nav = el('admin-tab-nav');
            if (!nav) return;
            nav.querySelectorAll('.admin-tab').forEach((tab) => {
                tab.addEventListener('click', () => {
                    const id = tab.getAttribute('data-admin-tab');
                    nav.querySelectorAll('.admin-tab').forEach((t) => t.classList.toggle('active', t === tab));
                    document.querySelectorAll('.admin-tab-panel').forEach((p) => {
                        p.classList.toggle('active', p.getAttribute('data-admin-panel') === id);
                    });
                    window.refreshLucideIcons?.();
                });
            });
        },

        bindSaveButtons() {
            document.querySelectorAll('.btn-save-admin-group').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const group = btn.getAttribute('data-admin-group');
                    this.saveGroup(group);
                });
            });
        },

        readFieldValue(elementId, settings) {
            const node = el(elementId);
            const key = FIELD_MAP[elementId];
            if (!node || !key) return;
            if (node.type === 'checkbox') {
                settings[key] = boolToSetting(node.checked);
            } else if (node.type === 'password' && window.WidgetConfigFields) {
                const val = WidgetConfigFields.readPasswordValue(node);
                if (val && val !== '********') settings[key] = val;
            } else {
                settings[key] = node.value;
            }
        },

        collectGroup(group) {
            const keys = GROUP_FIELDS[group] || [];
            const payload = {};
            Object.entries(FIELD_MAP).forEach(([elementId, key]) => {
                if (keys.includes(key)) this.readFieldValue(elementId, payload);
            });
            return payload;
        },

        async saveGroup(group) {
            try {
                const payload = this.collectGroup(group);
                if (group === 'security' && 'global_layout_locked' in payload) {
                    await API.request('/api/admin/layout-lock', {
                        method: 'POST',
                        body: { locked: settingToBool(payload.global_layout_locked) },
                    });
                }
                const res = await API.adminSaveConfig(payload);
                Object.assign(this.settings, payload);
                this.applySettingsToForm(this.settings);
                if (group === 'api' && payload.default_widget_refresh) {
                    AppState.defaultWidgetRefresh = parseInt(payload.default_widget_refresh, 10) || 30;
                }
                if (payload.default_locale && window.i18n) {
                    window.i18n.setLocale(payload.default_locale);
                    const langSel = el('language-select');
                    if (langSel) langSel.value = payload.default_locale;
                }
                AppState.authPolicy = AppState.authPolicy || {};
                if ('registration_enabled' in payload) {
                    AppState.authPolicy.registrationEnabled = settingToBool(payload.registration_enabled);
                }
                if ('maintenance_mode' in payload) {
                    AppState.authPolicy.maintenanceMode = settingToBool(payload.maintenance_mode);
                }
                if ('site_title' in payload) {
                    AppState.authPolicy.siteTitle = payload.site_title;
                    document.title = payload.site_title;
                }
                window.updateAuthToggleVisibility?.();
                showToast(_t('admin_settings_saved'), 'success');
            } catch (err) {
                showToast(_t('admin_error', { message: err.message }), 'error');
            }
        },

        applySettingsToForm(settings) {
            this.settings = { ...this.settings, ...settings };
            Object.entries(FIELD_MAP).forEach(([elementId, key]) => {
                const node = el(elementId);
                if (!node || settings[key] === undefined) return;
                if (node.type === 'checkbox') {
                    node.checked = settingToBool(settings[key]);
                } else if (node.type === 'password' && window.WidgetConfigFields) {
                    WidgetConfigFields.clearPasswordGuard(node);
                    const has = WidgetConfigFields.hasStoredPassword(settings[key]);
                    WidgetConfigFields.applyPasswordGuard(node, { storedValue: has ? '********' : '' });
                } else {
                    node.value = settings[key] ?? '';
                }
            });

            const banner = el('admin-maintenance-banner');
            if (banner) {
                banner.classList.toggle('hidden', !settingToBool(settings.maintenance_mode));
            }
        },

        async loadAll() {
            if (!AppState.user || AppState.user.role !== 'admin') return;
            try {
                const [configRes, systemRes] = await Promise.all([
                    API.adminGetConfig(),
                    API.adminGetSystem(),
                ]);
                this.applySettingsToForm(configRes.settings || {});
                this._refreshSiteLogoPreview?.();
                this.renderSystemInfo(systemRes);
                await Promise.all([this.loadStats(), this.loadHealth(), this.loadJobs()]);

                const lockRes = await API.request('/api/admin/layout-lock');
                const lockCb = el('admin-layout-lock');
                if (lockCb) lockCb.checked = !!lockRes.locked;

                window.AdminRegistry?.renderAll();

                if (typeof window.loadAdminModules === 'function') {
                    window.loadAdminModules();
                }
                await this.loadAdminIntegrations();
                await this.loadHealthThresholds();

                const assetHost = el('admin-asset-manager');
                const pkgHost = el('admin-package-manager');
                if (assetHost && window.AssetLibrary) {
                    await AssetLibrary.renderAssetManager(assetHost, { categories: ['icon', 'background'] });
                }
                if (pkgHost && window.AssetLibrary) {
                    await AssetLibrary.renderPackagePanel(pkgHost, { showInstall: true, showGlobalToggle: true });
                }
                const adminSection = el('section-admin');
                window.i18n?.translateDOM?.(adminSection || document);
            } catch (err) {
                console.error('Admin load failed:', err);
            }
        },

        renderSystemInfo(info) {
            const box = el('admin-system-info-box');
            if (!box || !info) return;
            this._lastSystemInfo = info;
            const c = info.counts || {};
            box.innerHTML = `
                ${_t('admin_system_version', { version: info.version || '—', python: info.python || '—' })}<br>
                ${_t('admin_system_counts', { users: c.users ?? 0, widgets: c.widgets ?? 0, integrations: c.integrations ?? 0 })}<br>
                ${_t('admin_system_cache', { active: info.cache?.active ?? 0, entries: info.cache?.entries ?? 0 })}
            `;
        },

        async loadStats() {
            try {
                const stats = await API.adminGetStats();
                const set = (id, val) => {
                    const node = el(id);
                    if (node) node.textContent = val ?? '—';
                };
                set('admin-stat-users', stats.users);
                set('admin-stat-widgets', stats.widgets);
                set('admin-stat-integrations', stats.integrations);
                set('admin-stat-modules', `${stats.modules_enabled}/${stats.modules_total}`);
                const cache = stats.cache || {};
                set('admin-stat-cache', cache.active ?? cache.entries ?? 0);
                const detail = el('admin-cache-detail');
                if (detail) {
                    detail.textContent = _t('admin_system_cache', {
                        active: cache.active ?? 0,
                        entries: cache.entries ?? 0,
                    });
                }
            } catch (err) {
                console.error('Admin stats failed:', err);
            }
        },

        bindModals() {
            const openUsers = () => {
                el('admin-users-mgmt-modal')?.classList.add('open');
                this.loadUsers();
                window.refreshLucideIcons?.();
            };
            el('btn-open-admin-users')?.addEventListener('click', openUsers);

            el('btn-open-admin-audit')?.addEventListener('click', () => {
                el('admin-audit-modal')?.classList.add('open');
                this.loadAuditLogs();
                window.refreshLucideIcons?.();
            });

            el('btn-admin-add-user')?.addEventListener('click', () => this.openUserModal());
            el('btn-admin-audit-refresh')?.addEventListener('click', () => this.loadAuditLogs());
            el('admin-audit-filter-user')?.addEventListener('change', () => this.loadAuditLogs());
            el('admin-audit-filter-event')?.addEventListener('change', () => this.loadAuditLogs());
            el('admin-audit-filter-category')?.addEventListener('change', () => this.loadAuditLogs());
            el('btn-admin-clear-cache')?.addEventListener('click', () => this.clearWidgetCache());
        },

        bindTests() {
            el('btn-test-smtp')?.addEventListener('click', async () => {
                try {
                    const res = await API.adminTestSmtp({
                        host: el('admin-smtp-host')?.value,
                        port: el('admin-smtp-port')?.value,
                        user: el('admin-smtp-user')?.value,
                        password: window.WidgetConfigFields
                            ? WidgetConfigFields.readPasswordValue(el('admin-smtp-password'))
                            : el('admin-smtp-password')?.value,
                        tls: el('admin-smtp-tls')?.checked,
                    });
                    showToast(res.message || 'OK', res.ok ? 'success' : 'error');
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });

            el('btn-test-weather')?.addEventListener('click', async () => {
                try {
                    const key = window.WidgetConfigFields
                        ? WidgetConfigFields.readPasswordValue(el('admin-weather-key'))
                        : el('admin-weather-key')?.value;
                    const res = await API.adminTestWeather({ api_key: key });
                    showToast(res.message || 'OK', res.ok ? 'success' : 'error');
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });
        },

        bindBackup() {
            const download = (data, name) => {
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = name;
                a.click();
                URL.revokeObjectURL(a.href);
            };

            el('btn-export-settings')?.addEventListener('click', async () => {
                const data = await API.adminExportSettings();
                download(data, `homy_settings_${new Date().toISOString().slice(0, 10)}.json`);
            });

            const exportAudit = async () => {
                const data = await API.adminExportAudit();
                download(data, `homy_audit_${new Date().toISOString().slice(0, 10)}.json`);
            };
            el('btn-export-audit')?.addEventListener('click', exportAudit);
            el('btn-export-audit-backup')?.addEventListener('click', exportAudit);

            el('btn-export-layout-admin')?.addEventListener('click', () => el('btn-export-layout')?.click());
            el('btn-import-layout-admin')?.addEventListener('click', () => {
                const input = el('admin-import-file-input');
                if (!input) return;
                input.click();
                input.onchange = () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                        try {
                            const data = JSON.parse(reader.result);
                            const mainInput = el('import-file-input');
                            if (mainInput) {
                                const dt = new DataTransfer();
                                dt.items.add(file);
                                mainInput.files = dt.files;
                                el('btn-import-trigger')?.click();
                            }
                        } catch {
                            showToast(_t('admin_invalid_json'), 'error');
                        }
                    };
                    reader.readAsText(file);
                    input.value = '';
                };
            });
        },

        async clearWidgetCache() {
            const ok = await showAppConfirm(_t('admin_confirm_clear_cache'), {
                title: _t('admin_confirm_clear_cache_title'),
            });
            if (!ok) return;
            try {
                await API.adminClearCache();
                showToast(_t('admin_cache_cleared'), 'success');
                await this.loadStats();
            } catch (err) {
                showToast(err.message, 'error');
            }
        },

        async loadUsers() {
            const tableBody = document.querySelector('#admin-users-table tbody');
            if (!tableBody) return;
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;"><div class="spinner" style="margin:auto;"></div></td></tr>';
            try {
                const users = await API.adminGetUsers();
                tableBody.innerHTML = '';
                if (!users.length) {
                    tableBody.innerHTML = `<tr><td colspan="5" class="muted-text" style="text-align:center;">${_t('admin_no_users')}</td></tr>`;
                    return;
                }
                users.forEach((u) => {
                    const tr = document.createElement('tr');
                    const avatarTd = document.createElement('td');
                    if (u.profile_asset_id) {
                        const img = document.createElement('img');
                        img.src = `/api/assets/${u.profile_asset_id}/file`;
                        img.alt = '';
                        img.className = 'admin-user-avatar';
                        avatarTd.appendChild(img);
                    } else {
                        avatarTd.innerHTML = '<span class="admin-user-avatar-placeholder"><i data-lucide="user"></i></span>';
                    }
                    const nameTd = document.createElement('td');
                    nameTd.textContent = u.username;
                    if (u.is_locked) {
                        nameTd.innerHTML += ` <span class="custom-json-badge badge-neutral" style="font-size:0.65rem;">${_t('admin_user_locked_badge')}</span>`;
                    }
                    const roleTd = document.createElement('td');
                    roleTd.innerHTML = u.role === 'admin'
                        ? `<span class="custom-json-badge badge-neutral" style="font-size:0.7rem;">${_t('role_admin')}</span>`
                        : `<span class="custom-json-badge" style="font-size:0.7rem;">${_t('role_user_short')}</span>`;
                    const actionsTd = document.createElement('td');
                    actionsTd.style.textAlign = 'right';
                    actionsTd.colSpan = 1;
                    const editBtn = document.createElement('button');
                    editBtn.type = 'button';
                    editBtn.className = 'icon-btn';
                    editBtn.innerHTML = '<i data-lucide="edit"></i>';
                    editBtn.onclick = () => this.openUserModal(u);
                    const deleteBtn = document.createElement('button');
                    deleteBtn.type = 'button';
                    deleteBtn.className = 'icon-btn text-danger';
                    deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
                    if (AppState.user && u.id === AppState.user.id) {
                        deleteBtn.disabled = true;
                    } else {
                        deleteBtn.onclick = async () => {
                            if (!await showAppConfirm(_t('admin_confirm_delete_user', { name: u.username }), { danger: true })) return;
                            await API.adminDeleteUser(u.id);
                            showToast(_t('admin_user_deleted'), 'success');
                            this.loadUsers();
                            this.loadStats();
                        };
                    }
                    actionsTd.appendChild(editBtn);
                    actionsTd.appendChild(deleteBtn);
                    tr.appendChild(avatarTd);
                    tr.appendChild(nameTd);
                    tr.appendChild(roleTd);
                    tr.appendChild(actionsTd);
                    tableBody.appendChild(tr);
                });
                lucide.createIcons({ nodes: tableBody.querySelectorAll('[data-lucide]') });
            } catch (err) {
                tableBody.innerHTML = `<tr><td colspan="4" class="text-danger">${err.message}</td></tr>`;
            }
        },

        openUserModal(u = null) {
            const modal = el('admin-user-modal');
            const form = el('admin-user-form');
            if (!modal || !form) return;
            form.reset();
            const pwd = el('admin-user-password');
            if (pwd && window.WidgetConfigFields) WidgetConfigFields.clearPasswordGuard(pwd);
            const lockedCb = el('admin-user-locked');
            if (u) {
                el('admin-user-modal-title').textContent = _t('admin_user_edit');
                el('admin-user-id-input').value = u.id;
                el('admin-user-username').value = u.username;
                el('admin-user-username').disabled = true;
                el('admin-user-password').required = false;
                el('admin-user-role').value = u.role;
                if (lockedCb) lockedCb.checked = !!u.is_locked;
                if (pwd && window.WidgetConfigFields) {
                    WidgetConfigFields.applyPasswordGuard(pwd, { storedValue: '********' });
                }
            } else {
                el('admin-user-modal-title').textContent = _t('admin_user_add');
                el('admin-user-id-input').value = '';
                el('admin-user-username').disabled = false;
                el('admin-user-password').required = true;
                el('admin-user-role').value = 'user';
                if (lockedCb) lockedCb.checked = false;
            }
            modal.classList.add('open');
        },

        bindUserForm() {
            el('admin-user-form')?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const id = el('admin-user-id-input').value;
                const username = el('admin-user-username').value.trim();
                const password = window.WidgetConfigFields
                    ? WidgetConfigFields.readPasswordValue(el('admin-user-password'))
                    : el('admin-user-password').value;
                const role = el('admin-user-role').value;
                const is_locked = el('admin-user-locked')?.checked || false;
                const payload = { role, is_locked };
                if (password && password !== '********') payload.password = password;
                if (!id) payload.username = username;
                try {
                    if (id) await API.adminUpdateUser(id, payload);
                    else await API.adminCreateUser({ ...payload, password });
                    showToast(_t('admin_user_saved'), 'success');
                    el('admin-user-modal').classList.remove('open');
                    await this.loadUsers();
                    await this.loadStats();
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });
        },

        populateAuditFilters(data) {
            const userSel = el('admin-audit-filter-user');
            const eventSel = el('admin-audit-filter-event');
            if (!userSel || !eventSel) return;
            const pu = userSel.value;
            const pe = eventSel.value;
            userSel.innerHTML = `<option value="__all__">${_t('admin_audit_all_users')}</option>`;
            (data.usernames || []).forEach((name) => {
                const o = document.createElement('option');
                o.value = name;
                o.textContent = name;
                userSel.appendChild(o);
            });
            eventSel.innerHTML = `<option value="__all__">${_t('admin_audit_all_actions')}</option>`;
            (data.event_types || []).forEach((ev) => {
                const o = document.createElement('option');
                o.value = ev;
                o.textContent = ev;
                eventSel.appendChild(o);
            });
            if ([...userSel.options].some((o) => o.value === pu)) userSel.value = pu;
            if ([...eventSel.options].some((o) => o.value === pe)) eventSel.value = pe;
        },

        async loadAuditLogs() {
            const tbody = el('admin-audit-logs-body');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;"><div class="spinner" style="margin:20px auto;"></div></td></tr>';
            const params = {};
            const u = el('admin-audit-filter-user')?.value;
            const ev = el('admin-audit-filter-event')?.value;
            const cat = el('admin-audit-filter-category')?.value;
            if (u && u !== '__all__') params.username = u;
            if (ev && ev !== '__all__') params.event_type = ev;
            if (cat && cat !== '__all__') params.category = cat;
            try {
                const data = await API.adminGetAuditLogs(params);
                this.populateAuditFilters(data);
                const logs = data.logs || [];
                tbody.innerHTML = '';
                if (!logs.length) {
                    tbody.innerHTML = `<tr><td colspan="4" class="muted-text" style="text-align:center;padding:20px;">${_t('admin_audit_empty')}</td></tr>`;
                    return;
                }
                logs.forEach((log) => {
                    const tr = document.createElement('tr');
                    const d = document.createElement('td');
                    try { d.textContent = new Date(log.timestamp).toLocaleString(); } catch { d.textContent = log.timestamp; }
                    const uTd = document.createElement('td');
                    uTd.innerHTML = `<strong>${log.username || '—'}</strong>`;
                    const a = document.createElement('td');
                    a.innerHTML = `<span class="search-launcher-item-badge">${log.event_type}</span>`;
                    const m = document.createElement('td');
                    m.textContent = log.message;
                    tr.append(d, uTd, a, m);
                    tbody.appendChild(tr);
                });
            } catch (err) {
                tbody.innerHTML = `<tr><td colspan="4" class="text-danger">${err.message}</td></tr>`;
            }
        },

        bindUserNotifications() {
            const card = el('user-notifications-card');
            const btn = el('btn-save-user-notifications');
            if (!btn) return;
            btn.addEventListener('click', async () => {
                const payload = {};
                document.querySelectorAll('.user-notify-input').forEach((input) => {
                    const ch = input.getAttribute('data-notify-channel');
                    const field = input.getAttribute('data-notify-field') || 'url';
                    const val = input.value.trim();
                    if (!ch || !val) return;
                    payload[ch] = payload[ch] || {};
                    payload[ch][field] = val;
                    payload[ch].enabled = true;
                });
                try {
                    await API.saveUserNotifications(payload);
                    showToast(_t('admin_notify_saved'), 'success');
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });
            const guestCard = el('user-notifications-guest');
            const loginBtn = el('btn-notifications-login');
            if (loginBtn && !loginBtn.dataset.bound) {
                loginBtn.dataset.bound = '1';
                loginBtn.addEventListener('click', () => {
                    window.showLoginModal?.();
                });
            }
            window.loadUserNotifications = async () => {
                if (!AppState.user) {
                    card?.classList.add('hidden');
                    guestCard?.classList.remove('hidden');
                    return;
                }
                guestCard?.classList.add('hidden');
                card?.classList.remove('hidden');
                try {
                    const data = await API.getUserNotifications();
                    document.querySelectorAll('.user-notify-input').forEach((input) => {
                        const ch = input.getAttribute('data-notify-channel');
                        const field = input.getAttribute('data-notify-field') || 'url';
                        input.value = data[ch]?.[field] || '';
                    });
                } catch (e) {
                    console.warn(e);
                }
            };
            document.querySelectorAll('.user-notify-test').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const ch = btn.getAttribute('data-channel');
                    const input = document.querySelector(`.user-notify-input[data-notify-channel="${ch}"]`);
                    const url = input?.value?.trim();
                    if (!url) {
                        showToast(_t('admin_notify_enter_url'), 'error');
                        return;
                    }
                    try {
                        const res = await API.testUserNotification(ch, { url, enabled: true });
                        showToast(res.message || _t('admin_notify_sent'), res.ok ? 'success' : 'error');
                    } catch (err) {
                        showToast(err.message, 'error');
                    }
                });
            });
        },

        bindGroups() {
            el('btn-open-admin-groups')?.addEventListener('click', () => {
                el('admin-groups-modal')?.classList.add('open');
                this.loadGroups();
            });
            el('btn-admin-create-group')?.addEventListener('click', async () => {
                const name = el('admin-new-group-name')?.value?.trim();
                if (!name) return;
                await API.adminCreateGroup({ name });
                el('admin-new-group-name').value = '';
                this.loadGroups();
            });
        },

        async loadGroups() {
            const tbody = document.querySelector('#admin-groups-table tbody');
            if (!tbody) return;
            try {
                const groups = await API.adminGetGroups();
                tbody.innerHTML = '';
                groups.forEach((g) => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `<td>${g.name}</td><td>${g.default_role}</td><td>${g.member_count}</td>
                        <td style="text-align:right;"><button type="button" class="icon-btn text-danger btn-del-group" data-id="${g.id}"><i data-lucide="trash-2"></i></button></td>`;
                    tbody.appendChild(tr);
                });
                tbody.querySelectorAll('.btn-del-group').forEach((btn) => {
                    btn.onclick = async () => {
                        if (!await showAppConfirm(_t('admin_confirm_delete_group'), { danger: true })) return;
                        await API.adminDeleteGroup(btn.getAttribute('data-id'));
                        this.loadGroups();
                    };
                });
                lucide.createIcons({ nodes: tbody.querySelectorAll('[data-lucide]') });
            } catch (err) {
                tbody.innerHTML = `<tr><td colspan="4">${err.message}</td></tr>`;
            }
        },

        bindJobs() {
            el('btn-refresh-jobs')?.addEventListener('click', () => this.loadJobs());
            el('btn-enqueue-cache-job')?.addEventListener('click', async () => {
                await API.adminEnqueueJob('clear_widget_cache');
                showToast(_t('admin_job_queued'), 'success');
                this.loadJobs();
            });
            el('btn-enqueue-backup-job')?.addEventListener('click', async () => {
                await API.adminEnqueueJob('full_backup');
                showToast(_t('admin_job_queued'), 'success');
                this.loadJobs();
            });
        },

        async loadJobs() {
            const host = el('admin-jobs-list');
            const sched = el('admin-scheduler-status');
            if (!host) return;
            try {
                const data = await API.adminGetJobs();
                if (sched) {
                    sched.textContent = data.scheduler?.running
                        ? _t('admin_scheduler', {
                            status: _t('admin_scheduler_active', {
                                count: data.scheduler.jobs?.length || 0,
                            }),
                        })
                        : _t('admin_scheduler', { status: _t('admin_scheduler_stopped') });
                }
                host.innerHTML = (data.jobs || []).map((j) =>
                    `<div>[${j.status}] #${j.id} ${j.job_type} — ${j.created_at || ''}</div>`
                ).join('') || _t('admin_no_jobs');
            } catch (err) {
                host.textContent = err.message;
            }
        },

        bindHealthThresholds() {
            el('btn-save-health-thresholds')?.addEventListener('click', () => this.saveHealthThresholds());
        },

        async loadHealthThresholds() {
            const form = el('admin-health-thresholds-form');
            if (!form) return;
            try {
                const data = await API.adminGetHealthThresholds();
                const t = data.thresholds || {};
                form.innerHTML = '';
                const blocks = [
                    {
                        key: 'storage',
                        fields: [
                            { id: 'storage-warn', label: _t('health_threshold_warn'), prop: 'warn', val: t.storage?.warn },
                            { id: 'storage-error', label: _t('health_threshold_error'), prop: 'error', val: t.storage?.error },
                        ],
                    },
                    {
                        key: 'api_calls',
                        fields: [
                            { id: 'api-warn', label: _t('health_threshold_warn'), prop: 'warn', val: t.api_calls?.warn },
                            { id: 'api-error', label: _t('health_threshold_error'), prop: 'error', val: t.api_calls?.error },
                        ],
                    },
                    {
                        key: 'database',
                        fields: [
                            { id: 'db-warn', label: _t('health_threshold_warn_ms'), prop: 'warn_latency_ms', val: t.database?.warn_latency_ms },
                            { id: 'db-error', label: _t('health_threshold_error_ms'), prop: 'error_latency_ms', val: t.database?.error_latency_ms },
                        ],
                    },
                ];
                blocks.forEach((block) => {
                    const card = document.createElement('div');
                    card.className = 'admin-health-threshold-block';
                    card.dataset.thresholdKey = block.key;
                    const title = document.createElement('h4');
                    title.textContent = _t(`health_threshold_${block.key}`);
                    card.appendChild(title);
                    const grid = document.createElement('div');
                    grid.className = 'admin-health-threshold-fields';
                    block.fields.forEach((f) => {
                        const wrap = document.createElement('div');
                        wrap.className = 'setting-item';
                        wrap.innerHTML = `<label for="${f.id}">${f.label}</label>`;
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.className = 'form-control';
                        input.id = f.id;
                        input.dataset.prop = f.prop;
                        input.value = f.val ?? '';
                        input.min = '0';
                        wrap.appendChild(input);
                        grid.appendChild(wrap);
                    });
                    card.appendChild(grid);
                    form.appendChild(card);
                });
            } catch (err) {
                form.innerHTML = `<div class="text-danger">${_t('admin_error', { message: err.message })}</div>`;
            }
        },

        collectHealthThresholds() {
            const form = el('admin-health-thresholds-form');
            if (!form) return {};
            const out = {};
            form.querySelectorAll('.admin-health-threshold-block').forEach((block) => {
                const key = block.dataset.thresholdKey;
                out[key] = {};
                block.querySelectorAll('input[data-prop]').forEach((input) => {
                    const v = parseInt(input.value, 10);
                    if (!Number.isNaN(v)) out[key][input.dataset.prop] = v;
                });
            });
            return out;
        },

        async saveHealthThresholds() {
            try {
                const thresholds = this.collectHealthThresholds();
                await API.adminSaveHealthThresholds(thresholds);
                showToast(_t('admin_health_thresholds_saved'), 'success');
                await this.loadHealth();
            } catch (err) {
                showToast(_t('admin_error', { message: err.message }), 'error');
            }
        },

        async loadAdminIntegrations() {
            const container = el('admin-integrations-list');
            if (!container) return;
            container.innerHTML = '<div class="spinner"></div>';
            try {
                const items = await API.adminGetIntegrations();
                container.innerHTML = '';
                if (!items.length) {
                    container.innerHTML = `<div class="muted-text">${_t('admin_no_integrations')}</div>`;
                    return;
                }
                items.forEach((m) => {
                    const row = document.createElement('div');
                    row.className = 'admin-module-row';
                    const meta = document.createElement('div');
                    meta.className = 'admin-module-meta';
                    meta.innerHTML = `
                        <div class="admin-module-name">${m.name} <span class="muted-text">v${m.version || '—'}</span></div>
                        <div class="admin-module-desc">${m.description || m.id}</div>
                    `;
                    const toggle = buildAdminToggleSwitch(m.enabled, async (enabled) => {
                        await API.adminToggleIntegration(m.id, enabled);
                    });
                    row.appendChild(meta);
                    row.appendChild(toggle);
                    container.appendChild(row);
                });
                bindEllipsisTitles(container);
            } catch (err) {
                container.innerHTML = `<div class="alert alert-danger">${_t('admin_error', { message: err.message })}</div>`;
            }
        },

        bindFullBackup() {
            el('btn-restore-full-backup')?.addEventListener('click', () => el('admin-restore-backup-input')?.click());
            el('admin-restore-backup-input')?.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const ok = await showAppConfirm(_t('admin_confirm_restore_backup'), { danger: true });
                if (!ok) return;
                try {
                    const res = await API.adminRestoreBackup(file);
                    showToast(_t('admin_backup_restored'), 'success');
                    console.log(res);
                } catch (err) {
                    showToast(err.message, 'error');
                }
                e.target.value = '';
            });
        },
    };

    window.AdminPanel = AdminPanel;
    window.updateAuthToggleVisibility = function () {
        const btn = el('btn-auth-toggle');
        if (!btn) return;
        const reg = AppState.authPolicy?.registrationEnabled === true;
        btn.classList.toggle('hidden', !reg);
    };

    document.addEventListener('DOMContentLoaded', () => AdminPanel.init());
})();
