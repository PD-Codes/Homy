/** Dedicated offline cache — never cleared on failed sync. */

const CACHE_KEY = 'homyOfflineCache';
const META_KEY = 'homyCacheMeta';

/**
 * @returns {Promise<import('./render-page.js').SyncPayload|null>}
 */
export async function getOfflineCache() {
    const data = await chrome.storage.local.get([CACHE_KEY]);
    return data[CACHE_KEY] || null;
}

export async function getCacheMeta() {
    const data = await chrome.storage.local.get([META_KEY]);
    return data[META_KEY] || null;
}

/**
 * @param {object} payload
 */
export async function setOfflineCache(payload) {
    const savedAt = new Date().toISOString();
    await chrome.storage.local.set({
        [CACHE_KEY]: payload,
        [META_KEY]: {
            savedAt,
            exportedAt: payload?.exported_at || null,
            layout: payload?.layout || 'desktop',
        },
    });
    return savedAt;
}

/** Cache blob or legacy config mirror. */
export async function getOfflineCacheOrLegacy() {
    const cached = await getOfflineCache();
    if (cached) return cached;
    const data = await chrome.storage.local.get(['homyConfig']);
    return data.homyConfig?.cachedSync || null;
}

/** One-time copy from homyConfig.cachedSync into dedicated offline store. */
export async function migrateLegacyCache() {
    if (await getOfflineCache()) return;
    const legacy = await getOfflineCacheOrLegacy();
    if (legacy) await setOfflineCache(legacy);
}
