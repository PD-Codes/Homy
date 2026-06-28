/**
 * Replace checkbox inputs with toggle switch UI (label left, switch right, hint below).
 */
window.ToggleSwitch = {
    enhance(container, selector = 'input[type="checkbox"]') {
        if (!container) return;
        container.querySelectorAll(selector).forEach((input) => {
            if (input.closest('.toggle-switch-row')) return;
            const row = document.createElement('div');
            row.className = 'toggle-switch-row';

            const labelWrap = document.createElement('div');
            labelWrap.className = 'toggle-switch-label-wrap';

            const labelEl = input.closest('label');
            const labelText = labelEl?.querySelector('span')?.textContent?.trim()
                || input.getAttribute('aria-label')
                || input.id
                || '';
            const hintEl = labelEl?.querySelector('small, .muted-text');

            if (labelText) {
                const lbl = document.createElement('span');
                lbl.className = 'toggle-switch-label';
                lbl.textContent = labelText;
                labelWrap.appendChild(lbl);
            }
            if (hintEl) {
                const hint = document.createElement('small');
                hint.className = 'toggle-switch-hint muted-text';
                hint.textContent = hintEl.textContent.trim();
                labelWrap.appendChild(hint);
            }

            const sw = document.createElement('label');
            sw.className = 'toggle-switch';
            const clone = input.cloneNode(true);
            clone.id = input.id;
            const slider = document.createElement('span');
            slider.className = 'toggle-switch-slider';
            sw.appendChild(clone);
            sw.appendChild(slider);

            row.appendChild(labelWrap);
            row.appendChild(sw);

            if (labelEl) {
                labelEl.replaceWith(row);
            } else {
                input.replaceWith(row);
            }
        });
    },
};
