/** @typedef {import('./api.js').HomyConfig} HomyConfig */

const DEFAULTS = {
    serverUrl: '',
    username: '',
    newTabMode: 'default', // default | cached | server | favorites
    syncIntervalMinutes: 60,
    bookmarkFolderName: 'Homy',
    bookmarkSyncCategories: [],
    /** Homy favorite ids to export to browser bookmarks (empty = use categories / none). */
    bookmarkSyncFavoriteIds: [],
    /** Browser bookmark node ids to import into Homy. */
    browserImportBookmarkIds: [],
    lastSyncAt: null,
    cachedSync: null,
    cacheStale: false,
    locale: 'de-DE',
    /** Show a Homy home button in the browser toolbar (side panel / quick open). */
    showHomeButton: true,
    /** Fetch live widget values from the server when the new tab page opens. */
    liveData: false,
    /** Show the search bar at the top of the new tab page. */
    showSearchBar: true,
};

export async function getConfig() {
    const data = await chrome.storage.local.get(['homyConfig']);
    return { ...DEFAULTS, ...(data.homyConfig || {}) };
}

export async function setConfig(patch) {
    const current = await getConfig();
    const next = { ...current, ...patch };
    await chrome.storage.local.set({ homyConfig: next });
    return next;
}

export async function getSession() {
    const data = await chrome.storage.local.get(['homySession']);
    return data.homySession || { loggedIn: false };
}

export async function setSession(session) {
    await chrome.storage.local.set({ homySession: session });
}
