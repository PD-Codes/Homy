/**
 * Close modals/panels when clicking the backdrop or pressing Escape.
 * Overlays with data-no-backdrop-close="true" are excluded (e.g. first-run setup).
 */
(function () {
    'use strict';

    const OVERLAY_SELECTOR = '.modal-overlay, .panel-overlay';

    function mayClose(overlay) {
        if (!overlay?.classList.contains('open')) return false;
        if (overlay.dataset.noBackdropClose === 'true') return false;
        if (overlay.classList.contains('app-dialog-overlay')) return false;
        return true;
    }

    function closeOverlay(overlay) {
        if (!mayClose(overlay)) return;
        if (overlay.id === 'search-launcher-modal' && window.SearchLauncher?.close) {
            window.SearchLauncher.close();
            return;
        }
        overlay.classList.remove('open');
        overlay.dispatchEvent(new CustomEvent('homy-overlay-closed', { bubbles: true }));
    }

    function findCloseButton(target) {
        return target.closest(
            '.btn-close-modal, .btn-close-integration, .btn-close-asset-detail, .btn-close-tab-bg',
        );
    }

    document.addEventListener('click', (e) => {
        const closeBtn = findCloseButton(e.target);
        if (closeBtn) {
            e.preventDefault();
            const overlay = closeBtn.closest(OVERLAY_SELECTOR);
            if (overlay) overlay.classList.remove('open');
            return;
        }

        if (e.target.matches(OVERLAY_SELECTOR)) {
            closeOverlay(e.target);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const open = [...document.querySelectorAll(`${OVERLAY_SELECTOR}.open`)].filter(mayClose);
        if (!open.length) return;
        closeOverlay(open[open.length - 1]);
    });

    window.closeModalOverlay = closeOverlay;
})();
