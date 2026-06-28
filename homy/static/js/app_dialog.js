/**
 * Internal dialogs — replaces window.alert / confirm / prompt.
 */
(function () {
    let overlay = null;
    let finishCallback = null;

    function defaultTitle(type) {
        const t = (key) => (window.i18n ? window.i18n.translate(key) : key);
        const titles = {
            info: t('dialog_info'),
            error: t('dialog_error'),
            warning: t('dialog_warning'),
            confirm: t('dialog_confirm'),
            prompt: t('dialog_prompt'),
            select: t('dialog_select'),
        };
        return titles[type] || titles.info;
    }

    function refreshDialogChrome() {
        if (!overlay) return;
        const t = (key) => window.i18n.translate(key);
        overlay.querySelector('#app-dialog-close')?.setAttribute('aria-label', t('dialog_close'));
        const cancelBtn = overlay.querySelector('#app-dialog-cancel');
        const confirmBtn = overlay.querySelector('#app-dialog-confirm');
        if (cancelBtn) cancelBtn.textContent = t('btn_cancel');
        if (confirmBtn && confirmBtn.dataset.baseLabel === 'ok') {
            confirmBtn.textContent = t('btn_ok');
        }
    }

    function ensureDialog() {
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = 'app-dialog-overlay';
        overlay.className = 'modal-overlay app-dialog-overlay';
        overlay.innerHTML = `
            <div class="modal-card glass app-dialog-card" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
                <div class="modal-header">
                    <h3 id="app-dialog-title"></h3>
                    <button type="button" class="icon-btn" id="app-dialog-close" aria-label="">
                        <i data-lucide="x"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p id="app-dialog-message" class="app-dialog-message"></p>
                    <div id="app-dialog-field-wrap" class="app-dialog-field hidden">
                        <label id="app-dialog-field-label" class="hidden" for="app-dialog-input"></label>
                        <input type="text" id="app-dialog-input" class="form-control hidden" autocomplete="off">
                        <select id="app-dialog-select" class="form-control hidden"></select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline" id="app-dialog-cancel"></button>
                    <button type="button" class="btn btn-primary" id="app-dialog-confirm" data-base-label="ok"></button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        refreshDialogChrome();
        window.addEventListener('localeChanged', refreshDialogChrome);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeDialog(null);
            }
        });

        overlay.querySelector('#app-dialog-close').addEventListener('click', () => closeDialog(null));
        overlay.querySelector('#app-dialog-cancel').addEventListener('click', () => closeDialog(null));
        overlay.querySelector('#app-dialog-confirm').addEventListener('click', () => submitDialog());

        overlay.querySelector('#app-dialog-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitDialog();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (!overlay.classList.contains('open')) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                closeDialog(null);
            }
        });

        return overlay;
    }

    function closeDialog(result) {
        if (!finishCallback) return;
        const done = finishCallback;
        finishCallback = null;
        overlay.classList.remove('open');
        done(result);
    }

    function submitDialog() {
        const mode = overlay.dataset.mode;
        const input = overlay.querySelector('#app-dialog-input');
        const select = overlay.querySelector('#app-dialog-select');

        if (mode === 'alert') {
            closeDialog(true);
            return;
        }

        if (mode === 'confirm') {
            closeDialog(true);
            return;
        }

        if (mode === 'prompt') {
            const value = input.value.trim();
            if (overlay.dataset.required === 'true' && !value) {
                input.focus();
                input.classList.add('input-invalid');
                return;
            }
            closeDialog(value || null);
            return;
        }

        if (mode === 'select') {
            const value = select.value;
            if (!value) {
                select.focus();
                return;
            }
            closeDialog(value);
        }
    }

    function openDialog(config) {
        ensureDialog();

        return new Promise((resolve) => {
            const mode = config.mode || 'alert';
            const type = config.type || (mode === 'alert' ? 'info' : mode);
            const titleEl = overlay.querySelector('#app-dialog-title');
            const messageEl = overlay.querySelector('#app-dialog-message');
            const fieldWrap = overlay.querySelector('#app-dialog-field-wrap');
            const fieldLabel = overlay.querySelector('#app-dialog-field-label');
            const input = overlay.querySelector('#app-dialog-input');
            const select = overlay.querySelector('#app-dialog-select');
            const cancelBtn = overlay.querySelector('#app-dialog-cancel');
            const confirmBtn = overlay.querySelector('#app-dialog-confirm');
            const closeBtn = overlay.querySelector('#app-dialog-close');

            overlay.dataset.mode = mode;
            overlay.dataset.required = config.required === false ? 'false' : 'true';

            refreshDialogChrome();
            titleEl.textContent = config.title || defaultTitle(type);
            messageEl.textContent = config.message || '';
            messageEl.classList.toggle('hidden', !config.message);

            input.classList.add('hidden');
            select.classList.add('hidden');
            fieldWrap.classList.add('hidden');
            fieldLabel.classList.add('hidden');
            input.classList.remove('input-invalid');

            if (mode === 'prompt') {
                fieldWrap.classList.remove('hidden');
                input.classList.remove('hidden');
                input.value = config.defaultValue || '';
                input.placeholder = config.placeholder || '';
                if (config.label) {
                    fieldLabel.textContent = config.label;
                    fieldLabel.classList.remove('hidden');
                }
            } else if (mode === 'select') {
                fieldWrap.classList.remove('hidden');
                select.classList.remove('hidden');
                select.innerHTML = '';
                (config.options || []).forEach((opt) => {
                    const option = document.createElement('option');
                    const value = typeof opt === 'string' ? opt : opt.value;
                    const label = typeof opt === 'string' ? opt : opt.label;
                    option.value = String(value);
                    option.textContent = label;
                    select.appendChild(option);
                });
            }

            const isAlert = mode === 'alert';
            cancelBtn.classList.toggle('hidden', isAlert);
            closeBtn.classList.toggle('hidden', isAlert);

            confirmBtn.textContent = config.confirmLabel || (mode === 'confirm' && config.danger ? 'Löschen' : 'OK');
            cancelBtn.textContent = config.cancelLabel || 'Abbrechen';

            confirmBtn.className = `btn ${config.danger ? 'btn-danger' : 'btn-primary'}`;

            finishCallback = (result) => {
                if (mode === 'confirm') {
                    resolve(result === true);
                } else if (mode === 'alert') {
                    resolve(undefined);
                } else {
                    resolve(result);
                }
            };

            overlay.classList.add('open');
            if (window.refreshLucideIcons) {
                window.refreshLucideIcons(overlay);
            } else if (window.lucide) {
                window.lucide.createIcons({ nodes: overlay.querySelectorAll('[data-lucide]') });
            }

            requestAnimationFrame(() => {
                if (mode === 'prompt') {
                    input.focus();
                    input.select();
                } else if (mode === 'select') {
                    select.focus();
                } else {
                    confirmBtn.focus();
                }
            });
        });
    }

    window.showAppAlert = function (message, options = {}) {
        return openDialog({
            mode: 'alert',
            message,
            type: options.type || 'info',
            title: options.title,
            confirmLabel: options.confirmLabel || 'OK',
        });
    };

    window.showAppConfirm = function (message, options = {}) {
        return openDialog({
            mode: 'confirm',
            message,
            type: 'confirm',
            title: options.title,
            confirmLabel: options.confirmLabel,
            cancelLabel: options.cancelLabel,
            danger: options.danger === true,
        });
    };

    window.showAppPrompt = function (message, options = {}) {
        return openDialog({
            mode: 'prompt',
            message,
            type: 'prompt',
            title: options.title,
            defaultValue: options.defaultValue,
            placeholder: options.placeholder,
            label: options.label,
            required: options.required !== false,
            confirmLabel: options.confirmLabel || 'OK',
            cancelLabel: options.cancelLabel,
        });
    };

    window.showAppSelect = function (message, options = {}) {
        return openDialog({
            mode: 'select',
            message,
            type: 'select',
            title: options.title,
            options: options.options || [],
            confirmLabel: options.confirmLabel || 'OK',
            cancelLabel: options.cancelLabel,
        });
    };
})();
