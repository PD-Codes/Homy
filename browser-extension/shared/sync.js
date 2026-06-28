import { fetchExtensionSync, exportLayoutBackup, importBrowserFavorites } from './api.js';
import { getConfig, setConfig } from './storage.js';
import { getOfflineCacheOrLegacy, setOfflineCache } from './cache.js';
import { getSession } from './storage.js';
import { browserSyncCategory } from './constants.js';
import { flattenBrowserBookmarks } from './bookmarks.js';

/**
 * @param {import('./storage.js').HomyConfig} cfg
 * @param {object[]} favorites
 */
export function filterHomyFavoritesForExport(favorites, cfg) {
    const ids = cfg.bookmarkSyncFavoriteIds || [];
    if (ids.length) {
        return favorites.filter((f) => ids.includes(f.id));
    }
    const cats = cfg.bookmarkSyncCategories || [];
    if (cats.length) {
        return favorites.filter((f) => cats.includes(f.category || 'General'));
    }
    return [];
}

/**
 * Pull fresh data from Homy; on failure keep existing offline cache.
 */
export async function runFullSync() {
    let payload;
    let fromCache = false;
    let stale = false;

    try {
        payload = await fetchExtensionSync();
        const savedAt = await setOfflineCache(payload);
        await setConfig({
            cachedSync: payload,
            lastSyncAt: savedAt,
            cacheStale: false,
        });
    } catch (err) {
        const cached = await getOfflineCacheOrLegacy();
        if (!cached) throw err;
        payload = cached;
        fromCache = true;
        stale = true;
        await setConfig({ cacheStale: true });
    }

    const cfg = await getConfig();
    const categories = new Set();
    (payload.favorites || []).forEach((f) => {
        if (f.category) categories.add(f.category);
    });
    const bookmarkSyncCategories = cfg.bookmarkSyncCategories?.length
        ? cfg.bookmarkSyncCategories
        : [...categories];

    if (!fromCache) {
        await setConfig({ bookmarkSyncCategories });
    }

    const toExport = filterHomyFavoritesForExport(payload.favorites || [], cfg);
    await syncBookmarks({ favorites: toExport }, cfg.bookmarkFolderName);

    let browserImport = { skipped: true };
    if (!fromCache && (cfg.browserImportBookmarkIds || []).length) {
        try {
            browserImport = await importSelectedBrowserBookmarks(cfg);
        } catch (err) {
            browserImport = {
                failed: true,
                error: err.message,
                needsNewHomy: err.status === 404,
            };
        }
    }

    return { payload, fromCache, stale, browserImport };
}

export async function syncBookmarks(payload, folderName) {
    if (!chrome.bookmarks) return { skipped: true };
    const favs = payload.favorites || [];
    if (!favs.length) return { count: 0 };

    const roots = await chrome.bookmarks.getTree();
    let folder = findFolder(roots, folderName);
    if (!folder) {
        folder = await chrome.bookmarks.create({
            parentId: '1',
            title: folderName,
        });
    }
    const existing = await chrome.bookmarks.getChildren(folder.id);
    for (const node of existing) {
        if (node.url) await chrome.bookmarks.remove(node.id);
    }
    let count = 0;
    for (const fav of favs) {
        if (!fav.url) continue;
        await chrome.bookmarks.create({
            parentId: folder.id,
            title: fav.title || fav.url,
            url: fav.url,
        });
        count += 1;
    }
    return { count, folderId: folder.id };
}

export async function importSelectedBrowserBookmarks(cfg) {
    const ids = new Set(cfg.browserImportBookmarkIds || []);
    if (!ids.size) return { skipped: true };
    const flat = await flattenBrowserBookmarks();
    const items = flat
        .filter((b) => ids.has(b.id))
        .map((b) => ({ title: b.title, url: b.url }));
    if (!items.length) return { count: 0 };
    const locale = cfg.locale || 'de-DE';
    const category = browserSyncCategory(locale);
    return importBrowserFavorites(items, category);
}

function findFolder(nodes, title) {
    for (const node of nodes) {
        if (!node.url && node.title === title) return node;
        if (node.children) {
            const hit = findFolder(node.children, title);
            if (hit) return hit;
        }
    }
    return null;
}

export async function tryRefreshCache() {
    const session = await getSession();
    if (!session.loggedIn) return null;
    try {
        const { payload } = await runFullSync();
        return payload;
    } catch {
        return getOfflineCacheOrLegacy();
    }
}

export async function downloadLayoutBackup() {
    const data = await exportLayoutBackup();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({
        url,
        filename: `homy-layout-backup-${stamp}.json`,
        saveAs: true,
    });
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return data;
}
