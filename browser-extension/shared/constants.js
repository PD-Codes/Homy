/** Canonical Homy category for bookmarks imported from the browser. */
export const BROWSER_SYNC_CATEGORY_DE = 'Aus Browser synchronisiert';
export const BROWSER_SYNC_CATEGORY_EN = 'Synced from browser';

export function browserSyncCategory(locale = 'de-DE') {
    return locale === 'en-US' ? BROWSER_SYNC_CATEGORY_EN : BROWSER_SYNC_CATEGORY_DE;
}

export function isBrowserSyncCategory(name) {
    const n = String(name || '').trim();
    return n === BROWSER_SYNC_CATEGORY_DE || n === BROWSER_SYNC_CATEGORY_EN;
}
