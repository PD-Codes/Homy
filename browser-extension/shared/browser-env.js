/** Detect browser and native new-tab URLs (Speed Dial / NTP). */

export function isOpera() {
    return /\bOPR\//.test(navigator.userAgent);
}

export function isEdge() {
    return /\bEdg\//.test(navigator.userAgent);
}

/** @returns {string} */
export function getNativeNewTabUrl() {
    if (isOpera()) return 'chrome://startpage/';
    if (isEdge()) return 'edge://newtab';
    return 'chrome://new-tab-page';
}

/**
 * Matches built-in start / Speed Dial / NTP pages across Chromium browsers.
 * Opera commonly uses chrome://startpage/ (sometimes startpageshared, with ?abfocus).
 * @param {string} [url]
 */
export function isNativeNewTabUrl(url) {
    const u = String(url || '').toLowerCase();
    if (!u) return false;
    if (u.includes('://startpage')) return true; // chrome|opera://startpage[shared][/?...]
    if (u.includes('://new-tab-page')) return true;
    if (/^(chrome|opera|edge|brave|vivaldi):\/\/newtab\b/.test(u)) return true;
    if (u === 'about:newtab' || u === 'about:home') return true;
    return false;
}
