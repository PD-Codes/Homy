// Integrations management UI (user + admin global)

function _t(key, params) {
    return window.i18n?.translate(key, params) ?? key;
}

function escHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

window.IntegrationsController = {
    types: [],
    items: [],
    editingId: null,
    searchQuery: '',

    async init() {
        document.getElementById('btn-add-integration')?.addEventListener('click', () => this.openModal());
        document.getElementById('integrations-search')?.addEventListener('input', (e) => {
            this.searchQuery = (e.target.value || '').trim().toLowerCase();
            this.render();
        });
        await this.load();
    },

    async load() {
        const list = document.getElementById('integrations-list');
        if (!list) return;
        list.innerHTML = '<div class="integrations-loading"><div class="spinner"></div></div>';
        try {
            this.types = await API.request('/api/integrations/types');
            this.items = await API.request('/api/integrations');
            this.render();
        } catch (err) {
            list.innerHTML = `<div class="alert alert-danger">${escHtml(err.message)}</div>`;
        }
    },

    filteredItems() {
        if (!this.searchQuery) return this.items;
        return this.items.filter((i) => {
            const hay = `${i.name} ${i.type} ${i.type_name || ''} ${i.id}`.toLowerCase();
            return hay.includes(this.searchQuery);
        });
    },

    typeIcon(typeId) {
        const t = this.types.find((x) => x.id === typeId);
        return t?.icon || 'plug';
    },

    render() {
        const list = document.getElementById('integrations-list');
        if (!list) return;

        const items = this.filteredItems();
        if (!this.items.length) {
            list.innerHTML = `
                <div class="integrations-empty glass">
                    <i data-lucide="plug"></i>
                    <h3>${_t('integrations_empty_title')}</h3>
                    <p class="muted-text">${_t('integrations_empty_desc')}</p>
                    <button type="button" class="btn btn-primary" id="btn-add-integration-empty">
                        <i data-lucide="plus"></i> ${_t('integrations_add')}
                    </button>
                </div>`;
            list.querySelector('#btn-add-integration-empty')?.addEventListener('click', () => this.openModal());
            window.refreshLucideIcons?.(list);
            return;
        }

        if (!items.length) {
            list.innerHTML = `<div class="integrations-empty muted-text">${_t('integrations_no_match')}</div>`;
            return;
        }

        list.innerHTML = items.map((i) => {
            const icon = this.typeIcon(i.type);
            const statusClass = i.enabled ? 'integration-status-active' : 'integration-status-off';
            const statusLabel = i.enabled ? _t('integrations_status_active') : _t('integrations_status_inactive');
            return `
            <article class="integration-card glass" data-id="${i.id}">
                <div class="integration-card-top">
                    <div class="integration-card-icon" aria-hidden="true">
                        <i data-lucide="${escHtml(icon)}"></i>
                    </div>
                    <div class="integration-card-main">
                        <div class="integration-card-title-row">
                            <h3 class="integration-card-title">${escHtml(i.name)}</h3>
                            <span class="integration-status-pill ${statusClass}">${statusLabel}</span>
                        </div>
                        <div class="integration-card-meta">
                            <span class="integration-type-chip">${escHtml(i.type_name || i.type)}</span>
                            ${i.is_global ? `<span class="integration-badge">${_t('integrations_global_badge')}</span>` : ''}
                        </div>
                        <div class="integration-card-id muted-text">ID ${i.id}</div>
                    </div>
                </div>
                <div class="integration-card-actions">
                    <button type="button" class="btn btn-outline btn-sm" data-test="${i.id}" title="${_t('integrations_test')}">
                        <i data-lucide="activity"></i> ${_t('integrations_test')}
                    </button>
                    <button type="button" class="btn btn-outline btn-sm" data-edit="${i.id}" title="${_t('btn_edit')}">
                        <i data-lucide="settings"></i>
                    </button>
                    <button type="button" class="btn btn-outline btn-sm text-danger" data-del="${i.id}" title="${_t('btn_delete')}">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </article>`;
        }).join('');

        list.querySelectorAll('[data-edit]').forEach((btn) => {
            btn.onclick = () => this.openModal(parseInt(btn.dataset.edit, 10));
        });
        list.querySelectorAll('[data-del]').forEach((btn) => {
            btn.onclick = () => this.delete(parseInt(btn.dataset.del, 10));
        });
        list.querySelectorAll('[data-test]').forEach((btn) => {
            btn.onclick = () => this.test(parseInt(btn.dataset.test, 10));
        });
        window.refreshLucideIcons?.(list);
    },

    openModal(id = null) {
        if (!AppState.user) {
            showToast(_t('integrations_login_required'), 'error');
            return;
        }
        this.editingId = id;
        const item = id ? this.items.find((x) => x.id === id) : null;
        let modal = document.getElementById('integration-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'integration-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-card glass">
                    <div class="modal-header">
                        <h3 id="integration-modal-title"></h3>
                        <button type="button" class="icon-btn btn-close-integration"><i data-lucide="x"></i></button>
                    </div>
                    <form id="integration-form">
                        <div class="modal-body" id="integration-form-body"></div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline btn-close-integration" data-i18n="btn_cancel">Cancel</button>
                            <button type="submit" class="btn btn-primary" data-i18n="btn_save">Save</button>
                        </div>
                    </form>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelectorAll('.btn-close-integration').forEach((b) => {
                b.onclick = () => modal.classList.remove('open');
            });
        }
        const form = modal.querySelector('#integration-form');
        const formBody = modal.querySelector('#integration-form-body');
        const title = modal.querySelector('#integration-modal-title');
        title.textContent = item ? _t('integrations_edit') : _t('integrations_new');

        const typeOptions = this.types.map((t) =>
            `<option value="${t.id}" ${item && item.type === t.id ? 'selected' : ''}>${escHtml(t.name)}</option>`
        ).join('');
        formBody.innerHTML = `
            <div class="form-group"><label>${_t('integrations_field_name')}</label><input class="form-control" id="int-name" value="${item ? escHtml(item.name) : ''}"></div>
            <div class="form-group"><label>${_t('integrations_field_type')}</label><select class="form-control" id="int-type" ${item ? 'disabled' : ''}>${typeOptions}</select></div>
            ${AppState.user.role === 'admin' ? `
            <div class="form-group"><label class="checkbox-label-container" style="display:flex;gap:8px;align-items:center;">
                <input type="checkbox" id="int-global" ${item && item.is_global ? 'checked' : ''}> ${_t('integrations_field_global')}
            </label></div>` : ''}
            <div id="int-fields"></div>
        `;

        const renderFields = () => {
            const typeId = item ? item.type : formBody.querySelector('#int-type').value;
            const tdef = this.types.find((t) => t.id === typeId);
            const fieldsEl = formBody.querySelector('#int-fields');
            fieldsEl.innerHTML = '';
            if (!tdef) return;
            Object.entries(tdef.fields || {}).forEach(([key, field]) => {
                const val = item?.config?.[key] ?? field.default ?? '';
                const group = document.createElement('div');
                group.className = 'form-group';
                const label = document.createElement('label');
                label.textContent = window.i18n.integrationLabel(typeId, key, field.label || key);
                if (field.type === 'password' && window.WidgetConfigFields) {
                    label.remove();
                    WidgetConfigFields.appendPasswordField(group, {
                        id: `int-field-${key}`,
                        label: window.i18n.integrationLabel(typeId, key, field.label || key),
                        storedValue: val,
                    });
                    if (window.IntegrationFieldHelp) {
                        IntegrationFieldHelp.append(group, typeId, key, field, formBody);
                    }
                    fieldsEl.appendChild(group);
                    return;
                }
                let input;
                if (field.type === 'textarea') {
                    input = document.createElement('textarea');
                    input.className = 'form-control';
                    input.rows = 3;
                    input.value = val;
                } else if (field.type === 'select') {
                    input = document.createElement('select');
                    input.className = 'form-control';
                    field.options.forEach((o) => {
                        const opt = document.createElement('option');
                        opt.value = o;
                        opt.textContent = o;
                        if (o === val) opt.selected = true;
                        input.appendChild(opt);
                    });
                } else {
                    input = document.createElement('input');
                    input.className = 'form-control';
                    input.type = 'text';
                    input.value = val === '********' ? '' : val;
                    if (field.placeholder) {
                        input.placeholder = window.i18n?.integrationFieldHelp(
                            typeId, key, field.placeholder,
                        ) || field.placeholder;
                    }
                }
                input.id = `int-field-${key}`;
                group.appendChild(label);
                group.appendChild(input);
                if (window.IntegrationFieldHelp) {
                    IntegrationFieldHelp.append(group, typeId, key, field, formBody);
                }
                fieldsEl.appendChild(group);
            });
        };

        renderFields();
        if (!item) {
            formBody.querySelector('#int-type').addEventListener('change', renderFields);
        }

        form.onsubmit = async (e) => {
            e.preventDefault();
            const typeId = item ? item.type : formBody.querySelector('#int-type').value;
            const tdef = this.types.find((t) => t.id === typeId);
            const config = {};
            Object.keys(tdef.fields || {}).forEach((key) => {
                const field = tdef.fields[key];
                if (field.type === 'password' && window.WidgetConfigFields) {
                    const fieldEl = formBody.querySelector(`#int-field-${key}`);
                    const pwd = WidgetConfigFields.readPasswordValue(fieldEl);
                    if (pwd !== undefined) config[key] = pwd;
                    return;
                }
                const fieldEl = formBody.querySelector(`#int-field-${key}`);
                if (fieldEl) config[key] = fieldEl.value;
            });
            const payload = {
                name: formBody.querySelector('#int-name').value.trim(),
                type: typeId,
                config,
                is_global: formBody.querySelector('#int-global')?.checked || false,
            };
            try {
                if (item) {
                    await API.request(`/api/integrations/${item.id}`, { method: 'PUT', body: payload });
                } else {
                    await API.request('/api/integrations', { method: 'POST', body: payload });
                }
                modal.classList.remove('open');
                showToast(_t('integrations_saved'), 'success');
                if (window.ApiCache) ApiCache.invalidate('/api/integrations');
                window.dispatchEvent(new CustomEvent('homy-integrations-changed'));
                await this.load();
            } catch (err) {
                showToast(err.message, 'error');
            }
        };

        window.i18n?.translateDOM?.(modal);
        window.refreshLucideIcons?.(modal);
        modal.classList.add('open');
    },

    async delete(id) {
        const ok = await showAppConfirm(_t('integrations_confirm_delete'), {
            title: _t('integrations_confirm_delete_title'),
            danger: true,
        });
        if (!ok) return;
        try {
            await API.request(`/api/integrations/${id}`, { method: 'DELETE' });
            showToast(_t('integrations_deleted'), 'success');
            if (window.ApiCache) ApiCache.invalidate('/api/integrations');
            window.dispatchEvent(new CustomEvent('homy-integrations-changed'));
            await this.load();
        } catch (err) {
            showToast(err.message, 'error');
        }
    },

    async test(id) {
        try {
            const res = await API.request(`/api/integrations/${id}/fetch`);
            showToast(
                res.ok ? _t('integrations_test_ok') : (res.message || _t('integrations_test_fail')),
                res.ok ? 'success' : 'error',
            );
        } catch (err) {
            showToast(err.message, 'error');
        }
    },
};

document.addEventListener('DOMContentLoaded', () => {
    IntegrationsController.init();
});
