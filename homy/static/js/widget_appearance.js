/**
 * Per-widget appearance settings (header, fonts, accent color, transparency).
 */
window.WidgetAppearance = {
    FONT_TITLE: { Klein: '0.8rem', Normal: '0.95rem', Groß: '1.15rem' },
    FONT_BODY: { Klein: '0.75rem', Normal: '0.875rem', Groß: '1rem' },

    appendConfigFields(container, config = {}) {
        // Safe translate — returns the fallback if i18n isn't ready or throws.
        const tr = (k, fb) => {
            try {
                if (window.i18n && typeof window.i18n.translate === 'function') {
                    const v = window.i18n.translate(k);
                    return (v && v !== k) ? v : fb;
                }
            } catch (_) {}
            return fb;
        };

        const bgOpacity = (config.bg_opacity != null && config.bg_opacity !== '')
            ? String(config.bg_opacity) : '100';
        const titleSize = config.font_size_title || 'Normal';
        const bodySize = config.font_size_body || 'Normal';
        const accentColor = config.accent_color || '';

        // Build the whole appearance section as DOM nodes so there are no
        // innerHTML parsing surprises and every element is guaranteed to exist.
        const section = document.createElement('div');
        section.className = 'widget-appearance-section';

        const mkCheckRow = (id, checked, labelText, hint) => {
            const g = document.createElement('div');
            g.className = 'form-group';
            const lbl = document.createElement('label');
            lbl.className = 'checkbox-label-container';
            lbl.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.id = id; cb.checked = checked;
            const sp = document.createElement('span');
            sp.textContent = labelText;
            lbl.appendChild(cb); lbl.appendChild(sp);
            g.appendChild(lbl);
            if (hint) {
                const sm = document.createElement('small');
                sm.className = 'muted-text';
                sm.textContent = hint;
                g.appendChild(sm);
            }
            return g;
        };

        section.appendChild(mkCheckRow('cfg-hide_header', config.hide_header === 'Ja',
            tr('cfg_appearance_hide_header', 'Header ausblenden'),
            tr('cfg_appearance_hide_header_hint', 'Im Bearbeitungsmodus bleibt der Header sichtbar; bei Hover erscheinen Steuerungen.')));

        section.appendChild(mkCheckRow('cfg-hide_action_buttons', config.hide_action_buttons === 'Ja',
            tr('cfg_appearance_hide_action_btns', 'Aktions-Buttons ausblenden'),
            tr('cfg_appearance_hide_action_btns_hint', 'z. B. Pi-hole sperren, Proxmox Start/Stopp, Home-Assistant-Schalter')));

        section.appendChild(mkCheckRow('cfg-transparent_widget', config.transparent_widget === 'Ja',
            tr('cfg_appearance_transparent', 'Komplett transparent (ohne Hintergrund & Rand)'),
            null));

        // Opacity group
        const opacityGrp = document.createElement('div');
        opacityGrp.className = 'form-group'; opacityGrp.id = 'cfg-bg-opacity-group';
        const opLbl = document.createElement('label');
        opLbl.setAttribute('for', 'cfg-bg_opacity');
        opLbl.textContent = tr('cfg_appearance_bg_opacity', 'Hintergrund-Deckkraft');
        const opRow = document.createElement('div');
        opRow.className = 'widget-opacity-row';
        const opRange = document.createElement('input');
        opRange.type = 'range'; opRange.id = 'cfg-bg_opacity';
        opRange.className = 'form-control';
        opRange.min = '0'; opRange.max = '100'; opRange.step = '5'; opRange.value = bgOpacity;
        const opVal = document.createElement('span');
        opVal.id = 'cfg-bg_opacity_val'; opVal.className = 'widget-opacity-value';
        opVal.textContent = bgOpacity + '%';
        opRow.appendChild(opRange); opRow.appendChild(opVal);
        opacityGrp.appendChild(opLbl); opacityGrp.appendChild(opRow);
        section.appendChild(opacityGrp);

        // Font size grid
        const mkSelectGroup = (id, labelText, sizes, currentVal) => {
            const g = document.createElement('div');
            g.className = 'form-group';
            const lbl = document.createElement('label');
            lbl.setAttribute('for', id); lbl.textContent = labelText;
            const sel = document.createElement('select');
            sel.id = id; sel.className = 'form-control';
            sizes.forEach(s => {
                const o = document.createElement('option');
                o.value = s; o.textContent = s; o.selected = (s === currentVal);
                sel.appendChild(o);
            });
            g.appendChild(lbl); g.appendChild(sel);
            return g;
        };
        const fgrid = document.createElement('div');
        fgrid.className = 'form-grid';
        fgrid.appendChild(mkSelectGroup('cfg-font_size_title',
            tr('cfg_appearance_title_size', 'Header-Schriftgröße'),
            ['Klein', 'Normal', 'Groß'], titleSize));
        fgrid.appendChild(mkSelectGroup('cfg-font_size_body',
            tr('cfg_appearance_body_size', 'Inhalt-Schriftgröße'),
            ['Klein', 'Normal', 'Groß'], bodySize));
        section.appendChild(fgrid);

        // Accent color
        const accentGrp = document.createElement('div');
        accentGrp.className = 'form-group';
        const accentLbl = document.createElement('label');
        accentLbl.setAttribute('for', 'cfg-accent_color');
        accentLbl.textContent = tr('cfg_appearance_accent_color', 'Akzentfarbe');
        const accentRow = document.createElement('div');
        accentRow.style.cssText = 'display:flex;gap:8px;align-items:center;';
        const colorPicker = document.createElement('input');
        colorPicker.type = 'color'; colorPicker.id = 'cfg-accent_color';
        colorPicker.value = accentColor || '#6366f1';
        colorPicker.style.cssText = 'width:48px;height:38px;padding:2px;cursor:pointer;';
        const colorText = document.createElement('input');
        colorText.type = 'text'; colorText.id = 'cfg-accent_color_text';
        colorText.className = 'form-control'; colorText.placeholder = '#6366f1';
        colorText.value = accentColor;
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button'; clearBtn.className = 'btn btn-secondary btn-sm';
        clearBtn.textContent = tr('cfg_appearance_accent_reset', 'Zurücksetzen');
        accentRow.appendChild(colorPicker); accentRow.appendChild(colorText); accentRow.appendChild(clearBtn);
        accentGrp.appendChild(accentLbl); accentGrp.appendChild(accentRow);
        section.appendChild(accentGrp);

        container.appendChild(section);

        // Wire up interactivity — all elements are guaranteed to exist at this point.
        colorPicker.addEventListener('input', () => { colorText.value = colorPicker.value; });
        colorText.addEventListener('input', () => {
            if (/^#[0-9A-Fa-f]{6}$/.test(colorText.value.trim())) {
                colorPicker.value = colorText.value.trim();
            }
        });
        clearBtn.addEventListener('click', () => {
            colorText.value = '';
            colorPicker.value = '#6366f1';
        });

        const transparentCb = section.querySelector('#cfg-transparent_widget');
        const syncOpacityUi = () => {
            const fully = transparentCb && transparentCb.checked;
            opacityGrp.classList.toggle('disabled', fully);
            opRange.disabled = fully;
        };
        opRange.addEventListener('input', () => { opVal.textContent = `${opRange.value}%`; });
        transparentCb.addEventListener('change', syncOpacityUi);
        syncOpacityUi();
    },

    readConfig(container) {
        const hideHeader = container.querySelector('#cfg-hide_header');
        const hideActions = container.querySelector('#cfg-hide_action_buttons');
        const transparent = container.querySelector('#cfg-transparent_widget');
        const titleSel = container.querySelector('#cfg-font_size_title');
        const bodySel = container.querySelector('#cfg-font_size_body');
        const colorText = container.querySelector('#cfg-accent_color_text');
        const opacityRange = container.querySelector('#cfg-bg_opacity');

        let accent = (colorText && colorText.value.trim()) || '';
        if (accent && !accent.startsWith('#')) accent = `#${accent}`;

        let bgOpacity = opacityRange ? String(opacityRange.value) : '100';
        const n = parseInt(bgOpacity, 10);
        if (!Number.isFinite(n)) bgOpacity = '100';
        else bgOpacity = String(Math.max(0, Math.min(100, n)));

        return {
            hide_header: hideHeader && hideHeader.checked ? 'Ja' : 'Nein',
            hide_action_buttons: hideActions && hideActions.checked ? 'Ja' : 'Nein',
            transparent_widget: transparent && transparent.checked ? 'Ja' : 'Nein',
            bg_opacity: bgOpacity,
            font_size_title: titleSel ? titleSel.value : 'Normal',
            font_size_body: bodySel ? bodySel.value : 'Normal',
            accent_color: accent,
        };
    },

    apply(widgetEl, config = {}) {
        if (!widgetEl) return;
        const cfg = config || {};

        widgetEl.classList.toggle('widget-hide-header', cfg.hide_header === 'Ja');
        widgetEl.classList.toggle('widget-hide-actions', cfg.hide_action_buttons === 'Ja');
        widgetEl.classList.toggle('widget-transparent', cfg.transparent_widget === 'Ja');

        const titleSize = this.FONT_TITLE[cfg.font_size_title] || this.FONT_TITLE.Normal;
        const bodySize = this.FONT_BODY[cfg.font_size_body] || this.FONT_BODY.Normal;
        widgetEl.style.setProperty('--widget-font-title', titleSize);
        widgetEl.style.setProperty('--widget-font-body', bodySize);

        const accent = (cfg.accent_color || '').trim();
        if (accent && /^#[0-9A-Fa-f]{6}$/i.test(accent)) {
            widgetEl.style.setProperty('--widget-accent', accent);
            widgetEl.classList.add('widget-themed');
        } else {
            widgetEl.style.removeProperty('--widget-accent');
            widgetEl.classList.remove('widget-themed');
        }

        if (cfg.transparent_widget === 'Ja') {
            widgetEl.classList.remove('widget-bg-custom');
            widgetEl.style.removeProperty('--widget-bg-alpha');
            widgetEl.style.removeProperty('--widget-bg-tint');
            widgetEl.style.removeProperty('--widget-border-tint');
            widgetEl.style.removeProperty('--widget-sep-tint');
            return;
        }

        let alpha = parseInt(cfg.bg_opacity, 10);
        if (!Number.isFinite(alpha)) alpha = 100;
        alpha = Math.max(0, Math.min(100, alpha)) / 100;
        widgetEl.style.setProperty('--widget-bg-alpha', String(alpha));
        widgetEl.classList.add('widget-bg-custom');

        if (accent && /^#[0-9A-Fa-f]{6}$/i.test(accent)) {
            if (alpha >= 0.999) {
                widgetEl.style.setProperty('--widget-bg-tint', `color-mix(in srgb, ${accent} 12%, var(--bg-card-solid, var(--bg-card)))`);
                widgetEl.style.setProperty('--widget-border-tint', this._hexToRgba(accent, 0.55));
                widgetEl.style.setProperty('--widget-sep-tint', this._hexToRgba(accent, 0.35));
            } else {
                widgetEl.style.setProperty('--widget-bg-tint', this._hexToRgba(accent, 0.08 + 0.72 * alpha));
                widgetEl.style.setProperty('--widget-border-tint', this._hexToRgba(accent, 0.12 + 0.48 * alpha));
                widgetEl.style.setProperty('--widget-sep-tint', this._hexToRgba(accent, 0.08 + 0.3 * alpha));
            }
        } else {
            widgetEl.style.removeProperty('--widget-bg-tint');
            widgetEl.style.removeProperty('--widget-border-tint');
            widgetEl.style.removeProperty('--widget-sep-tint');
        }
    },

    hideActionButtons(config = {}) {
        return config.hide_action_buttons === 'Ja';
    },

    _hexToRgba(hex, alpha) {
        const h = hex.replace('#', '');
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },
};
