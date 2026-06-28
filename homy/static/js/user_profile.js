/**
 * Account profile, password change, custom theme colors.
 */
(function () {
    'use strict';

    const CUSTOM_THEME_DEFAULTS = {
        bg_base: '#0b0f19',
        bg_surface: '#111827',
        bg_card: '#1f2937',
        text_primary: '#f3f4f6',
        text_secondary: '#9ca3af',
        text_muted: '#6b7280',
        primary: '#6366f1',
        border_color: 'rgba(255,255,255,0.08)',
        success: '#10b981',
        danger: '#ef4444',
    };

    function t(key, params) {
        return window.i18n?.translate(key, params) || key;
    }

    function applyCustomThemeCss(colors) {
        let el = document.getElementById('user-custom-theme-style');
        if (!el) {
            el = document.createElement('style');
            el.id = 'user-custom-theme-style';
            document.head.appendChild(el);
        }
        const c = { ...CUSTOM_THEME_DEFAULTS, ...colors };
        el.textContent = `:root {
            --bg-base: ${c.bg_base};
            --bg-surface: ${c.bg_surface};
            --bg-card: ${c.bg_card};
            --bg-card-solid: ${c.bg_card};
            --text-primary: ${c.text_primary};
            --text-secondary: ${c.text_secondary};
            --text-muted: ${c.text_muted};
            --primary: ${c.primary};
            --border-color: ${c.border_color};
            --success: ${c.success};
            --danger: ${c.danger};
        }`;
    }

    window.applyCustomThemeFromPrefs = function (prefs) {
        const colors = prefs?.custom_theme || {};
        applyCustomThemeCss(colors);
    };

    function renderCustomThemeFields(host, colors) {
        const merged = { ...CUSTOM_THEME_DEFAULTS, ...colors };
        host.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'custom-theme-grid form-grid';
        Object.keys(CUSTOM_THEME_DEFAULTS).forEach((key) => {
            const group = document.createElement('div');
            group.className = 'form-group';
            group.innerHTML = `
                <label for="custom-theme-${key}">${t(`custom_theme_${key}`)}</label>
                <input type="color" id="custom-theme-${key}" class="form-control custom-theme-color" value="${merged[key].startsWith('#') ? merged[key] : '#6366f1'}">
            `;
            grid.appendChild(group);
        });
        host.appendChild(grid);
    }

    function renderMfaSection(host, user) {
        const enabled = !!user.mfa_enabled;
        host.innerHTML = `
            <h4 style="margin:24px 0 12px;">${t('profile_mfa_title') || 'Zwei-Faktor-Authentifizierung (2FA)'}</h4>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <span class="badge ${enabled ? 'badge-success' : 'badge-secondary'}" style="padding:4px 10px;border-radius:12px;font-size:0.8rem;background:${enabled ? 'var(--success)' : 'var(--bg-card)'};color:${enabled ? '#fff' : 'var(--text-secondary)'};border:1px solid ${enabled ? 'var(--success)' : 'var(--border-color)'};">
                    ${enabled ? (t('profile_mfa_active') || '✓ Aktiv') : (t('profile_mfa_inactive') || '✗ Inaktiv')}
                </span>
                ${enabled
                    ? `<button type="button" id="btn-mfa-disable" class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger);">${t('profile_mfa_disable') || 'MFA deaktivieren'}</button>`
                    : `<button type="button" id="btn-mfa-setup" class="btn btn-outline btn-sm">${t('profile_mfa_setup') || 'MFA einrichten'}</button>`
                }
            </div>
            <div id="mfa-setup-panel" class="hidden" style="margin-top:16px;"></div>
        `;
        window.refreshLucideIcons?.(host);

        if (enabled) {
            host.querySelector('#btn-mfa-disable')?.addEventListener('click', async () => {
                const ok = await showAppConfirm(
                    t('profile_mfa_disable_confirm') || 'MFA wirklich deaktivieren?',
                    { danger: true, title: t('profile_mfa_disable') || 'MFA deaktivieren' }
                );
                if (!ok) return;
                try {
                    await API.disableMfa();
                    showToast(t('profile_mfa_disabled') || 'MFA deaktiviert', 'success');
                    renderMfaSection(host, { ...user, mfa_enabled: false });
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });
        } else {
            host.querySelector('#btn-mfa-setup')?.addEventListener('click', async () => {
                const panel = host.querySelector('#mfa-setup-panel');
                if (!panel) return;
                panel.innerHTML = '<div class="widget-loading" style="height:60px;"><div class="spinner"></div></div>';
                panel.classList.remove('hidden');
                try {
                    const data = await API.getMfaSetup();
                    panel.innerHTML = `
                        <p class="muted-text" style="font-size:0.85rem;margin-bottom:12px;">${t('profile_mfa_scan_hint') || 'Scanne den QR-Code mit deiner Authenticator-App und gib den Code zur Bestätigung ein.'}</p>
                        ${data.qr_base64 ? `<img src="data:image/png;base64,${data.qr_base64}" alt="QR Code" style="width:160px;height:160px;display:block;margin-bottom:12px;">` : ''}
                        <p style="font-size:0.78rem;margin-bottom:12px;">${t('profile_mfa_secret') || 'Manueller Schlüssel'}: <code style="user-select:all;font-size:0.85rem;">${data.secret || ''}</code></p>
                        <div class="form-group" style="max-width:220px;">
                            <label for="mfa-confirm-code">${t('profile_mfa_code_label') || 'Bestätigungscode'}</label>
                            <input type="text" id="mfa-confirm-code" class="form-control" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456">
                        </div>
                        <button type="button" id="btn-mfa-confirm" class="btn btn-primary btn-sm">${t('profile_mfa_confirm') || 'Bestätigen & aktivieren'}</button>
                        <button type="button" id="btn-mfa-cancel" class="btn btn-outline btn-sm" style="margin-left:8px;">${t('btn_cancel') || 'Abbrechen'}</button>
                    `;
                    panel.querySelector('#btn-mfa-cancel')?.addEventListener('click', () => {
                        panel.classList.add('hidden');
                        panel.innerHTML = '';
                    });
                    panel.querySelector('#btn-mfa-confirm')?.addEventListener('click', async () => {
                        const code = panel.querySelector('#mfa-confirm-code')?.value?.trim();
                        if (!code) { showToast(t('profile_mfa_code_required') || 'Code eingeben', 'error'); return; }
                        try {
                            await API.confirmMfaSetup(code);
                            showToast(t('profile_mfa_activated') || 'MFA aktiviert', 'success');
                            renderMfaSection(host, { ...user, mfa_enabled: true });
                        } catch (err) {
                            showToast(err.message, 'error');
                        }
                    });
                } catch (err) {
                    panel.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
                }
            });
        }
    }

    async function loadProfileForm() {
        const host = document.getElementById('settings-auth-status');
        if (!host || !AppState.user) return;

        try {
            const data = await API.getUserProfile();
            const user = data.user || AppState.user;
            const prefs = data.preferences || {};
            AppState.user = { ...AppState.user, ...user };
            window.SidebarUI?.updateProfileAvatar(user);

            const isLocal = (user.auth_provider || 'local') === 'local';
            host.innerHTML = `
                <form id="profile-form" class="profile-form">
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="profile-username-field">${t('profile_username')}</label>
                            <input type="text" id="profile-username-field" class="form-control" value="${user.username}" readonly>
                            <small class="muted-text">${t('profile_username_hint')}</small>
                        </div>
                        <div class="form-group">
                            <label for="profile-display-name">${t('profile_display_name')}</label>
                            <input type="text" id="profile-display-name" class="form-control" value="${user.display_name || ''}" maxlength="120">
                        </div>
                        <div class="form-group">
                            <label for="profile-email">${t('profile_email')}</label>
                            <input type="email" id="profile-email" class="form-control" value="${user.email || ''}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>${t('profile_avatar')}</label>
                        <input type="hidden" id="profile-asset-id" value="${user.profile_asset_id || ''}">
                        <div class="avatar-upload-row" style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
                            <img id="profile-avatar-preview" class="avatar-upload-preview" alt="" src="${user.profile_asset_id ? `/api/assets/${user.profile_asset_id}/file` : ''}" ${user.profile_asset_id ? '' : 'hidden'}>
                            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                <input type="file" id="profile-avatar-file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden">
                                <button type="button" id="btn-profile-avatar-upload" class="btn btn-outline btn-sm"><i data-lucide="upload"></i> ${t('profile_avatar_upload')}</button>
                                <button type="button" id="btn-profile-avatar-remove" class="btn btn-outline btn-sm text-danger" ${user.profile_asset_id ? '' : 'hidden'}><i data-lucide="trash-2"></i> ${t('profile_avatar_remove') || 'Entfernen'}</button>
                            </div>
                        </div>
                        <div id="profile-avatar-picker"></div>
                    </div>
                    <button type="submit" class="btn btn-primary"><i data-lucide="save"></i> ${t('btn_save')}</button>
                </form>
                ${isLocal ? `
                <div id="profile-password-section" class="profile-password-section">
                    <h4 style="margin:24px 0 12px;">${t('profile_change_password')}</h4>
                    <form id="profile-password-form">
                        <div class="form-group">
                            <label for="profile-current-password">${t('profile_current_password')}</label>
                            <input type="password" id="profile-current-password" class="form-control" autocomplete="current-password">
                        </div>
                        <div class="form-group">
                            <label for="profile-new-password">${t('profile_new_password')}</label>
                            <input type="password" id="profile-new-password" class="form-control" autocomplete="new-password">
                        </div>
                        <button type="submit" class="btn btn-outline">${t('profile_change_password')}</button>
                    </form>
                </div>
                <div id="profile-mfa-section"></div>` : `<p class="muted-text" style="margin-top:16px;">${t('profile_password_external')}</p>`}
            `;

            const previewImg = document.getElementById('profile-avatar-preview');
            const setPreview = (assetId) => {
                if (!previewImg) return;
                const removeBtn = document.getElementById('btn-profile-avatar-remove');
                if (assetId) {
                    previewImg.src = `/api/assets/${assetId}/file?t=${Date.now()}`;
                    previewImg.classList.remove('hidden');
                    removeBtn?.removeAttribute('hidden');
                } else {
                    previewImg.classList.add('hidden');
                    previewImg.removeAttribute('src');
                    removeBtn?.setAttribute('hidden', '');
                }
            };
            setPreview(user.profile_asset_id);

            const pickerOpts = {
                category: 'avatar',
                selectedValue: user.profile_asset_id ? String(user.profile_asset_id) : null,
                showGlobalToggle: false,
                allowUpload: false,
                onSelect: (val) => {
                    document.getElementById('profile-asset-id').value = val || '';
                    setPreview(val ? parseInt(val, 10) : null);
                    pickerOpts.selectedValue = val || null;
                },
            };

            document.getElementById('btn-profile-avatar-upload')?.addEventListener('click', () => {
                document.getElementById('profile-avatar-file')?.click();
            });

            document.getElementById('btn-profile-avatar-remove')?.addEventListener('click', () => {
                document.getElementById('profile-asset-id').value = '';
                setPreview(null);
                pickerOpts.selectedValue = null;
                AssetLibrary.renderPicker(document.getElementById('profile-avatar-picker'), pickerOpts);
                document.getElementById('btn-profile-avatar-remove')?.setAttribute('hidden', '');
            });
            document.getElementById('profile-avatar-file')?.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file || !window.AvatarCrop) return;
                AvatarCrop.open(file, async (blob) => {
                    if (!blob) return;
                    const cropped = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
                    try {
                        const asset = await AssetLibrary.uploadAsset(cropped, { category: 'avatar', isGlobal: false });
                        document.getElementById('profile-asset-id').value = String(asset.id);
                        setPreview(asset.id);
                        pickerOpts.selectedValue = String(asset.id);
                        await AssetLibrary.renderPicker(document.getElementById('profile-avatar-picker'), pickerOpts);
                    } catch (err) {
                        showToast(err.message, 'error');
                    }
                });
            });

            if (window.AssetLibrary) {
                AssetLibrary.renderPicker(document.getElementById('profile-avatar-picker'), pickerOpts);
            }

            document.getElementById('profile-form')?.addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    const res = await API.updateUserProfile({
                        display_name: document.getElementById('profile-display-name').value,
                        email: document.getElementById('profile-email').value,
                        profile_asset_id: document.getElementById('profile-asset-id').value || null,
                    });
                    AppState.user = res.user;
                    window.SidebarUI?.updateProfileAvatar(res.user);
                    showToast(t('profile_saved'), 'success');
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });

            document.getElementById('profile-password-form')?.addEventListener('submit', async (e) => {
                e.preventDefault();
                try {
                    await API.changeUserPassword({
                        current_password: document.getElementById('profile-current-password').value,
                        new_password: document.getElementById('profile-new-password').value,
                    });
                    showToast(t('profile_password_changed'), 'success');
                    e.target.reset();
                } catch (err) {
                    showToast(err.message, 'error');
                }
            });

            // MFA section
            const mfaHost = document.getElementById('profile-mfa-section');
            if (mfaHost && (user.auth_provider || 'local') === 'local') {
                renderMfaSection(mfaHost, user);
            }

            const customHost = document.getElementById('custom-theme-fields');
            if (customHost) {
                renderCustomThemeFields(customHost, prefs.custom_theme || {});
                document.getElementById('btn-save-custom-theme')?.addEventListener('click', async () => {
                    const theme = {};
                    Object.keys(CUSTOM_THEME_DEFAULTS).forEach((key) => {
                        const inp = document.getElementById(`custom-theme-${key}`);
                        if (inp) theme[key] = inp.value;
                    });
                    await API.updateUserProfile({ custom_theme: theme });
                    if (localStorage.getItem('theme') === 'custom' || AppState.theme === 'custom') {
                        applyCustomThemeCss(theme);
                    }
                    showToast(t('custom_theme_saved'), 'success');
                });
            }

            window.refreshLucideIcons?.(host);
        } catch (err) {
            host.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
        }
    }

    window.loadUserProfileSettings = loadProfileForm;

    document.addEventListener('DOMContentLoaded', () => {
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) {
            themeSelect.addEventListener('change', () => {
                if (themeSelect.value === 'custom' && AppState.user) {
                    API.getUserProfile().then((d) => {
                        applyCustomThemeFromPrefs(d.preferences);
                    }).catch(() => {});
                } else {
                    document.getElementById('user-custom-theme-style')?.remove();
                }
                document.getElementById('custom-theme-panel')?.classList.toggle(
                    'hidden',
                    themeSelect.value !== 'custom',
                );
            });
        }
    });
})();
