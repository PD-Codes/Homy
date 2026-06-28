/**
 * Shared password field UX: locked when a secret is already stored until "Bearbeiten".
 */
window.WidgetConfigFields = {
    isStoredSecret(value) {
        return value === '********' || value === '__VAULT_SECRET__';
    },

    hasStoredPassword(value) {
        if (this.isStoredSecret(value)) return true;
        return value != null && String(value).trim() !== '';
    },

    maskConfigPasswords(config, schema) {
        if (!config || !schema) return { ...(config || {}) };
        const out = { ...config };
        Object.keys(schema).forEach((key) => {
            if (schema[key].type === 'password' && out[key]) {
                out[key] = '********';
            }
        });
        return out;
    },

    _createUnlockButton(input, hasStored) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-secondary btn-sm widget-password-edit-btn';
        btn.textContent = window.i18n.translate('widget_config_edit');
        btn.addEventListener('click', () => {
            if (input.dataset.locked === 'true') {
                input.dataset.locked = 'false';
                input.disabled = false;
                input.value = '';
                input.placeholder = hasStored ? 'Neues Passwort eingeben' : 'Passwort eingeben';
                input.focus();
                btn.textContent = window.i18n.translate('widget_config_cancel');
            } else {
                input.dataset.locked = 'true';
                input.disabled = true;
                input.value = '';
                input.placeholder = hasStored ? '•••••••• (gespeichert)' : 'Noch nicht gesetzt';
                btn.textContent = window.i18n.translate('widget_config_edit');
            }
        });
        return btn;
    },

    applyPasswordGuard(input, { storedValue } = {}) {
        if (!input || input.dataset.passwordGuard === 'true') {
            return input;
        }

        const hasStored = this.hasStoredPassword(storedValue);
        input.type = 'password';
        input.dataset.passwordGuard = 'true';
        input.dataset.hasStored = hasStored ? 'true' : 'false';
        input.autocomplete = input.autocomplete || 'new-password';
        input.value = '';

        if (!hasStored) {
            input.disabled = false;
            input.dataset.locked = 'false';
            if (!input.placeholder) {
                input.placeholder = 'Noch nicht gesetzt';
            }
            return input;
        }

        input.disabled = true;
        input.dataset.locked = 'true';
        input.placeholder = '•••••••• (gespeichert)';

        const row = document.createElement('div');
        row.className = 'widget-password-row';
        const parent = input.parentNode;
        parent.insertBefore(row, input);
        row.appendChild(input);
        row.appendChild(this._createUnlockButton(input, true));
        return input;
    },

    clearPasswordGuard(input) {
        if (!input || input.dataset.passwordGuard !== 'true') return input;

        const row = input.closest('.widget-password-row');
        if (row && row.parentNode) {
            row.parentNode.insertBefore(input, row);
            row.remove();
        }
        input.disabled = false;
        input.dataset.locked = 'false';
        input.dataset.hasStored = 'false';
        input.value = '';
        delete input.dataset.passwordGuard;
        return input;
    },

    appendPasswordField(parent, { id, label, storedValue }) {
        const group = document.createElement('div');
        group.className = 'form-group widget-password-field';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        labelEl.setAttribute('for', id);

        const input = document.createElement('input');
        input.className = 'form-control';
        input.id = id;
        input.type = 'password';
        input.autocomplete = 'new-password';

        const hasStored = this.hasStoredPassword(storedValue);
        input.dataset.passwordGuard = 'true';
        input.dataset.hasStored = hasStored ? 'true' : 'false';
        input.value = '';

        group.appendChild(labelEl);

        if (hasStored) {
            input.disabled = true;
            input.dataset.locked = 'true';
            input.placeholder = '•••••••• (gespeichert)';
            const row = document.createElement('div');
            row.className = 'widget-password-row';
            row.appendChild(input);
            row.appendChild(this._createUnlockButton(input, true));
            group.appendChild(row);
        } else {
            input.disabled = false;
            input.dataset.locked = 'false';
            input.placeholder = 'Noch nicht gesetzt';
            group.appendChild(input);
        }

        parent.appendChild(group);
        return input;
    },

    readPasswordValue(input) {
        if (!input || input.type !== 'password') return undefined;
        if (input.dataset.locked === 'true') {
            if (input.dataset.hasStored === 'true') {
                return '********';
            }
            return '';
        }
        return input.value;
    },

    readById(id) {
        const input = document.getElementById(id);
        return this.readPasswordValue(input);
    },

    readSchemaField(schema, key, prefix = 'cfg-') {
        const field = schema[key];
        if (!field) return undefined;
        if (field.type === 'password') {
            const input = document.getElementById(`${prefix}${key}`);
            return this.readPasswordValue(input);
        }
        const input = document.getElementById(`${prefix}${key}`);
        return input ? input.value : undefined;
    },

    initPasswordGuards(root = document) {
        root.querySelectorAll('input[type="password"][data-password-guard]').forEach((input) => {
            const stored = input.dataset.storedSecret === 'true';
            this.applyPasswordGuard(input, { storedValue: stored ? '********' : '' });
        });
    },
};

document.addEventListener('DOMContentLoaded', () => {
    window.WidgetConfigFields.initPasswordGuards();
});
