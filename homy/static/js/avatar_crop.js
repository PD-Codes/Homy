/**
 * Circular avatar crop UI (pan + zoom) before upload.
 */
(function () {
    'use strict';

    const SIZE = 280;
    const OUTPUT = 512;

    function t(key, params) {
        return window.i18n?.translate(key, params) || key;
    }

    function ensureModal() {
        let modal = document.getElementById('avatar-crop-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'avatar-crop-modal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-card glass avatar-crop-card">
                <div class="modal-header">
                    <h3 data-i18n="avatar_crop_title">Adjust profile picture</h3>
                    <button type="button" class="icon-btn btn-close-avatar-crop"><i data-lucide="x"></i></button>
                </div>
                <div class="modal-body avatar-crop-body">
                    <div class="avatar-crop-stage">
                        <canvas id="avatar-crop-canvas" width="${SIZE}" height="${SIZE}"></canvas>
                        <div class="avatar-crop-ring" aria-hidden="true"></div>
                    </div>
                    <label class="avatar-crop-zoom-label">
                        <span data-i18n="avatar_crop_zoom">Zoom</span>
                        <input type="range" id="avatar-crop-zoom" min="100" max="300" value="100">
                    </label>
                </div>
                <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;padding:16px;">
                    <button type="button" class="btn btn-outline btn-cancel-avatar-crop" data-i18n="btn_cancel">Cancel</button>
                    <button type="button" class="btn btn-primary btn-save-avatar-crop" data-i18n="avatar_crop_apply">Apply</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        window.i18n?.translateDOM?.(modal);

        modal.querySelector('.btn-close-avatar-crop')?.addEventListener('click', () => modal.classList.remove('open'));
        modal.querySelector('.btn-cancel-avatar-crop')?.addEventListener('click', () => modal.classList.remove('open'));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('open');
        });
        return modal;
    }

    function open(file, onDone) {
        const modal = ensureModal();
        const canvas = modal.querySelector('#avatar-crop-canvas');
        const ctx = canvas.getContext('2d');
        const zoomInput = modal.querySelector('#avatar-crop-zoom');
        const img = new Image();
        const url = URL.createObjectURL(file);

        let scale = 1;
        let offsetX = 0;
        let offsetY = 0;
        let dragging = false;
        let dragStart = null;

        const draw = () => {
            ctx.clearRect(0, 0, SIZE, SIZE);
            ctx.fillStyle = '#111827';
            ctx.fillRect(0, 0, SIZE, SIZE);
            const zoom = (parseInt(zoomInput.value, 10) || 100) / 100;
            const drawScale = scale * zoom;
            const w = img.width * drawScale;
            const h = img.height * drawScale;
            const x = (SIZE - w) / 2 + offsetX;
            const y = (SIZE - h) / 2 + offsetY;
            ctx.drawImage(img, x, y, w, h);
        };

        const fit = () => {
            scale = Math.max(SIZE / img.width, SIZE / img.height);
            offsetX = 0;
            offsetY = 0;
            zoomInput.value = '100';
            draw();
        };

        img.onload = () => {
            fit();
            modal.classList.add('open');
            window.refreshLucideIcons?.(modal);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            onDone(null, new Error(t('avatar_crop_invalid')));
        };
        img.src = url;

        zoomInput.oninput = draw;

        canvas.onpointerdown = (e) => {
            dragging = true;
            dragStart = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
            canvas.setPointerCapture(e.pointerId);
        };
        canvas.onpointermove = (e) => {
            if (!dragging || !dragStart) return;
            offsetX = dragStart.ox + (e.clientX - dragStart.x);
            offsetY = dragStart.oy + (e.clientY - dragStart.y);
            draw();
        };
        canvas.onpointerup = canvas.onpointercancel = () => {
            dragging = false;
            dragStart = null;
        };

        const saveBtn = modal.querySelector('.btn-save-avatar-crop');
        saveBtn.onclick = async () => {
            saveBtn.disabled = true;
            try {
                const zoom = (parseInt(zoomInput.value, 10) || 100) / 100;
                const drawScale = scale * zoom;
                const w = img.width * drawScale;
                const h = img.height * drawScale;
                const x = (SIZE - w) / 2 + offsetX;
                const y = (SIZE - h) / 2 + offsetY;
                const ratio = OUTPUT / SIZE;

                const cropCanvas = document.createElement('canvas');
                cropCanvas.width = OUTPUT;
                cropCanvas.height = OUTPUT;
                const cctx = cropCanvas.getContext('2d');
                cctx.fillStyle = '#111827';
                cctx.fillRect(0, 0, OUTPUT, OUTPUT);
                cctx.drawImage(img, x * ratio, y * ratio, w * ratio, h * ratio);

                const blob = await new Promise((resolve) => {
                    cropCanvas.toBlob(resolve, 'image/jpeg', 0.9);
                });
                modal.classList.remove('open');
                URL.revokeObjectURL(url);
                await onDone(blob);
            } finally {
                saveBtn.disabled = false;
            }
        };
    }

    window.AvatarCrop = { open };
})();
