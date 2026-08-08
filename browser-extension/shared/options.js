import { getConfig, setConfig, getSession, setSession } from './storage.js';
import {
    getBaseUrl, login, logout, verifyMfa, checkAuthStatus,
} from './api.js';
import { runFullSync, downloadLayoutBackup } from './sync.js';
import { migrateLegacyCache } from './cache.js';
import { flattenBrowserBookmarks } from './bookmarks.js';
import { isBrowserSyncCategory } from './constants.js';
import { t, applyI18n } from './i18n.js';
import { isOpera } from './browser-env.js';

const els = {
    serverUrl: document.getElementById('server-url'),
    username: document.getElementById('username'),
    password: document.getElementById('password'),
    mfaBlock: document.getElementById('mfa-block'),
    mfaCode: document.getElementById('mfa-code'),
    authStatus: document.getElementById('auth-status'),
    syncStatus: document.getElementById('sync-status'),
    newTabMode: document.getElementById('new-tab-mode'),
    syncInterval: document.getElementById('sync-interval'),
    bookmarkFolder: document.getElementById('bookmark-folder'),
    homyList: document.getElementById('homy-favorites-list'),
    browserList: document.getElementById('browser-bookmarks-list'),
    operaHint: document.getElementById('opera-newtab-hint'),
    homeButton: document.getElementById('opt-home-button'),
    liveData: document.getElementById('opt-live-data'),
    searchBar: document.getElementById('opt-search-bar'),
};

function updateOperaHint(cfg, locale) {
    if (!els.operaHint) return;
    if (isOpera()) {
        els.operaHint.textContent = t('opera_newtab_unsupported', locale);
        els.operaHint.classList.remove('hidden');
    } else {
        els.operaHint.classList.add('hidden');
    }
}

function readCheckedIds(container, attr = 'data-id') {
    return [...container.querySelectorAll('input[type=checkbox]:checked')].map((cb) => {
        const raw = cb.getAttribute(attr);
        const num = Number(raw);
        return Number.isFinite(num) ? num : raw;
    });
}

function setAllChecked(container, checked) {
    container.querySelectorAll('input[type=checkbox]').forEach((cb) => {
        cb.checked = checked;
    });
}

/** Public favicon for a URL (used as a thumbnail in the selection lists). */
function faviconFor(url) {
    try {
        const host = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
    } catch {
        return '';
    }
}

function appendFavicon(label, src) {
    if (!src) return;
    const img = document.createElement('img');
    img.className = 'cl-favicon';
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => img.remove());
    label.appendChild(img);
}

function renderHomyFavorites(favorites, selectedIds, locale) {
    els.homyList.innerHTML = '';
    const list = [...(favorites || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    if (!list.length) {
        els.homyList.innerHTML = `<span class="muted">${t('homy_favs_empty', locale)}</span>`;
        return;
    }
    const selected = new Set(selectedIds || []);
    const defaultAll = !selected.size;
    list.forEach((f) => {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.setAttribute('data-id', String(f.id));
        cb.checked = defaultAll || selected.has(f.id);
        const cat = isBrowserSyncCategory(f.category)
            ? t('browser_sync_category', locale)
            : (f.category || 'General');
        label.appendChild(cb);
        appendFavicon(label, (f.icon_type === 'image' && f.icon_value) ? f.icon_value : faviconFor(f.url));
        const title = document.createElement('span');
        title.className = 'cl-title';
        title.textContent = f.title;
        label.appendChild(title);
        const chip = document.createElement('span');
        chip.className = 'cl-chip';
        chip.textContent = cat;
        label.appendChild(chip);
        els.homyList.appendChild(label);
    });
}

async function renderBrowserBookmarks(selectedIds, locale) {
    els.browserList.innerHTML = `<span class="muted">${t('loading', locale)}</span>`;
    try {
        const flat = await flattenBrowserBookmarks();
        els.browserList.innerHTML = '';
        if (!flat.length) {
            els.browserList.innerHTML = `<span class="muted">${t('browser_bookmarks_empty', locale)}</span>`;
            return;
        }
        const selected = new Set((selectedIds || []).map(String));
        const defaultNone = !selected.size;
        flat.forEach((b) => {
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.setAttribute('data-id', b.id);
            cb.checked = !defaultNone && selected.has(String(b.id));
            label.appendChild(cb);
            appendFavicon(label, faviconFor(b.url));
            const text = document.createElement('span');
            text.className = 'cl-title';
            text.textContent = b.title;
            label.appendChild(text);
            if (b.folder) {
                const chip = document.createElement('span');
                chip.className = 'cl-chip';
                chip.textContent = b.folder;
                label.appendChild(chip);
            }
            els.browserList.appendChild(label);
        });
    } catch (err) {
        els.browserList.innerHTML = `<span class="status-err">${err.message}</span>`;
    }
}

function readSyncSelection() {
    return {
        bookmarkSyncFavoriteIds: readCheckedIds(els.homyList, 'data-id').filter((id) => typeof id === 'number'),
        browserImportBookmarkIds: readCheckedIds(els.browserList, 'data-id').map(String),
    };
}

async function loadForm() {
    await migrateLegacyCache();
    const cfg = await getConfig();
    const locale = cfg.locale || 'de-DE';
    applyI18n(document.body, locale);
    els.serverUrl.value = cfg.serverUrl || '';
    els.username.value = cfg.username || '';
    els.newTabMode.value = cfg.newTabMode || 'cached';
    els.syncInterval.value = cfg.syncIntervalMinutes || 60;
    els.bookmarkFolder.value = cfg.bookmarkFolderName || 'Homy';
    if (els.homeButton) els.homeButton.checked = cfg.showHomeButton !== false;
    if (els.liveData) els.liveData.checked = !!cfg.liveData;
    if (els.searchBar) els.searchBar.checked = cfg.showSearchBar !== false;
    renderHomyFavorites(cfg.cachedSync?.favorites, cfg.bookmarkSyncFavoriteIds, locale);
    await renderBrowserBookmarks(cfg.browserImportBookmarkIds, locale);
    if (cfg.lastSyncAt) {
        els.syncStatus.textContent = `${t('last_sync', locale)}: ${new Date(cfg.lastSyncAt).toLocaleString()}`;
    }
    await refreshAuthStatus();
}

async function refreshAuthStatus() {
    const locale = (await getConfig()).locale || 'de-DE';
    try {
        const status = await checkAuthStatus();
        if (status.logged_in) {
            await setSession({ loggedIn: true, username: status.user?.username });
            els.authStatus.textContent = `${t('connected', locale)}: ${status.user?.username || ''}`;
            els.authStatus.className = 'status-ok';
        } else {
            els.authStatus.textContent = t('not_connected', locale);
            els.authStatus.className = 'muted';
        }
    } catch (err) {
        els.authStatus.textContent = err.message;
        els.authStatus.className = 'status-err';
    }
}

document.getElementById('btn-login').addEventListener('click', async () => {
    const locale = (await getConfig()).locale || 'de-DE';
    try {
        await setConfig({
            serverUrl: els.serverUrl.value,
            username: els.username.value,
        });
        const res = await login(els.username.value, els.password.value);
        if (res.mfa_required) {
            els.mfaBlock.classList.remove('hidden');
            return;
        }
        els.password.value = '';
        els.mfaBlock.classList.add('hidden');
        await refreshAuthStatus();
        els.syncStatus.textContent = t('connected', locale);
        els.syncStatus.className = 'status-ok';
    } catch (err) {
        els.authStatus.textContent = err.message;
        els.authStatus.className = 'status-err';
    }
});

document.getElementById('btn-mfa').addEventListener('click', async () => {
    try {
        await verifyMfa(els.mfaCode.value.trim());
        els.mfaBlock.classList.add('hidden');
        await refreshAuthStatus();
    } catch (err) {
        els.authStatus.textContent = err.message;
        els.authStatus.className = 'status-err';
    }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    await logout();
    await refreshAuthStatus();
});

document.getElementById('btn-save').addEventListener('click', async () => {
    const cfg = await getConfig();
    const sel = readSyncSelection();
    await setConfig({
        serverUrl: els.serverUrl.value,
        username: els.username.value,
        newTabMode: els.newTabMode.value,
        syncIntervalMinutes: parseInt(els.syncInterval.value, 10) || 60,
        bookmarkFolderName: els.bookmarkFolder.value.trim() || 'Homy',
        bookmarkSyncFavoriteIds: sel.bookmarkSyncFavoriteIds,
        browserImportBookmarkIds: sel.browserImportBookmarkIds,
        showHomeButton: els.homeButton ? els.homeButton.checked : cfg.showHomeButton,
        liveData: els.liveData ? els.liveData.checked : cfg.liveData,
        showSearchBar: els.searchBar ? els.searchBar.checked : cfg.showSearchBar,
        locale: cfg.locale,
    });
    const locale = cfg.locale || 'de-DE';
    els.syncStatus.textContent = t('save_settings', locale);
});

// Live data rides on the host permission the extension already declares. The search
// field, however, needs the optional "search" permission to reach the browser's
// configured provider — request it on enable, drop it again on disable.
els.searchBar?.addEventListener('change', async () => {
    if (!chrome.permissions?.request) return;
    const locale = (await getConfig()).locale || 'de-DE';

    if (!els.searchBar.checked) {
        try {
            await chrome.permissions.remove({ permissions: ['search'] });
        } catch (err) {
            console.warn('[Homy] could not drop the search permission', err);
        }
        return;
    }

    try {
        const granted = await chrome.permissions.request({ permissions: ['search'] });
        // Without the permission the field still works, but Enter falls back to a
        // generic web search instead of the configured provider. Say so.
        if (!granted) {
            els.syncStatus.textContent = t('search_permission_denied', locale);
        }
    } catch (err) {
        console.warn('[Homy] search permission unavailable', err);
        els.syncStatus.textContent = t('search_permission_denied', locale);
    }
});

document.getElementById('btn-sync').addEventListener('click', async () => {
    const locale = (await getConfig()).locale || 'de-DE';
    els.syncStatus.textContent = t('loading', locale);
    try {
        const sel = readSyncSelection();
        await setConfig({
            bookmarkFolderName: els.bookmarkFolder.value.trim() || 'Homy',
            bookmarkSyncFavoriteIds: sel.bookmarkSyncFavoriteIds,
            browserImportBookmarkIds: sel.browserImportBookmarkIds,
        });
        const { stale, browserImport } = await runFullSync();
        const cfg = await getConfig();
        renderHomyFavorites(cfg.cachedSync?.favorites, cfg.bookmarkSyncFavoriteIds, locale);
        let msg;
        if (stale) {
            msg = t('sync_stale_cache', locale);
            els.syncStatus.className = 'status-err';
        } else {
            msg = `${t('sync_ok', locale)} — ${new Date(cfg.lastSyncAt).toLocaleString()}`;
            if (browserImport?.created || browserImport?.updated) {
                msg += ` (${browserImport.created || 0}+ / ${browserImport.updated || 0}↻)`;
            }
            if (browserImport?.failed) {
                msg += ` — ${browserImport.error}`;
                if (browserImport.needsNewHomy) {
                    msg += ` (${t('sync_import_skipped', locale)})`;
                }
            }
            els.syncStatus.className = browserImport?.failed ? 'status-err' : 'status-ok';
        }
        els.syncStatus.textContent = msg;
    } catch (err) {
        els.syncStatus.textContent = `${t('sync_fail', locale)}: ${err.message}`;
        els.syncStatus.className = 'status-err';
    }
});

document.getElementById('btn-backup').addEventListener('click', async () => {
    try {
        await downloadLayoutBackup();
    } catch (err) {
        const locale = (await getConfig()).locale || 'de-DE';
        els.syncStatus.textContent = err.message;
        els.syncStatus.className = 'status-err';
    }
});

document.getElementById('btn-homy-all').addEventListener('click', () => setAllChecked(els.homyList, true));
document.getElementById('btn-homy-none').addEventListener('click', () => setAllChecked(els.homyList, false));
document.getElementById('btn-browser-all').addEventListener('click', () => setAllChecked(els.browserList, true));
document.getElementById('btn-browser-none').addEventListener('click', () => setAllChecked(els.browserList, false));
document.getElementById('btn-browser-reload').addEventListener('click', async () => {
    const cfg = await getConfig();
    await renderBrowserBookmarks(cfg.browserImportBookmarkIds, cfg.locale || 'de-DE');
});

els.newTabMode?.addEventListener('change', async () => {
    const cfg = await getConfig();
    updateOperaHint({ ...cfg, newTabMode: els.newTabMode.value }, cfg.locale || 'de-DE');
});

document.getElementById('btn-open-homy-newtab')?.addEventListener('click', () => {
    const url = chrome.runtime.getURL('newtab.html');
    if (chrome.tabs?.create) chrome.tabs.create({ url });
    else window.open(url, '_blank');
});

document.getElementById('btn-newtab-diag')?.addEventListener('click', async () => {
    const out = document.getElementById('newtab-diag-output');
    const locale = (await getConfig()).locale || 'de-DE';
    const store = await chrome.storage.local.get(['homyNewTabDiag']);
    const list = Array.isArray(store.homyNewTabDiag) ? store.homyNewTabDiag : [];
    out.classList.remove('hidden');
    if (!list.length) {
        out.textContent = t('newtab_diag_empty', locale);
        return;
    }
    out.textContent = list.map((e) => {
        const time = new Date(e.ts).toLocaleTimeString();
        const parts = Object.entries(e)
            .filter(([k, v]) => !['event', 'ts'].includes(k) && v !== '' && v != null)
            .map(([k, v]) => `${k}=${v}`);
        return `[${time}] ${e.event}${parts.length ? '  ' + parts.join('  ') : ''}`;
    }).join('\n');
});

loadForm();
