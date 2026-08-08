import { getConfig } from './storage.js';
import { getBaseUrl, fetchLiveWidgetData } from './api.js';
import { getOfflineCacheOrLegacy, getCacheMeta, migrateLegacyCache } from './cache.js';
import { tryRefreshCache } from './sync.js';
import { renderNewTabPage } from './render-page.js';
import { t } from './i18n.js';
import { getNativeNewTabUrl } from './browser-env.js';

const app = document.getElementById('app');

function renderEmpty(locale) {
    app.innerHTML = `
        <div class="nt-empty-page">
            <p>${escapeHtml(t('newtab_no_data', locale))}</p>
            <button type="button" id="open-settings">${escapeHtml(t('newtab_open_settings', locale))}</button>
        </div>`;
    document.getElementById('open-settings')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

function normalize(url) {
    const trimmed = String(url || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Preserve what the user typed across a re-render triggered by fresh data. */
function captureSearchState() {
    const input = document.querySelector('.nt-search-input');
    if (!input) return null;
    return { value: input.value, focused: document.activeElement === input };
}

function restoreSearchState(state) {
    if (!state) return;
    const input = document.querySelector('.nt-search-input');
    if (!input) return;
    input.value = state.value;
    input.dispatchEvent(new Event('input'));
    if (state.focused) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    }
}

/**
 * Single render entry point so cached, live and refreshed renders cannot disagree
 * about which options they were built with.
 */
function paint(payload, cfg, { meta, live, offline }) {
    const search = captureSearchState();
    renderNewTabPage(app, payload, {
        locale: cfg.locale || 'de-DE',
        mode: cfg.newTabMode || 'cached',
        baseUrl: normalize(cfg.serverUrl),
        offline,
        savedAt: meta?.savedAt || cfg.lastSyncAt,
        live,
        liveEnabled: !!cfg.liveData,
        showSearch: cfg.showSearchBar !== false,
    });
    restoreSearchState(search);
}

async function canReachServer() {
    const base = await getBaseUrl();
    if (!base || !navigator.onLine) return false;
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(`${base}/api/auth/status`, {
            credentials: 'include',
            signal: ctrl.signal,
            headers: { Accept: 'application/json' },
        });
        clearTimeout(timer);
        if (!res.ok) return false;
        const data = await res.json();
        return !!data.logged_in;
    } catch {
        return false;
    }
}

async function main() {
    await migrateLegacyCache();
    const cfg = await getConfig();
    const locale = cfg.locale || 'de-DE';
    const mode = cfg.newTabMode || 'cached';

    if (mode === 'default') {
        window.location.replace(getNativeNewTabUrl());
        return;
    }

    if (mode === 'server') {
        const online = await canReachServer();
        if (online) {
            const base = await getBaseUrl();
            window.location.replace(`${base}/#dashboard`);
            return;
        }
    }

    // Paint the cached layout first — the page must never wait on the network.
    const meta = await getCacheMeta();
    const payload = await getOfflineCacheOrLegacy();
    if (!payload) {
        renderEmpty(locale);
        return;
    }
    paint(payload, cfg, {
        meta,
        live: null,
        offline: !!cfg.cacheStale || !navigator.onLine,
    });

    // Live values, if the user enabled them. Merged in as soon as they land.
    let live = null;
    if (cfg.liveData) {
        try {
            live = await fetchLiveWidgetData();
            if (live) {
                paint(payload, cfg, { meta, live, offline: false });
            }
        } catch (err) {
            console.warn('[Homy] live widget data unavailable', err);
        }
    }

    // Layout refresh in the background (tabs/widgets/favorites may have changed).
    try {
        const fresh = await tryRefreshCache();
        if (fresh) {
            const [freshMeta, freshCfg] = await Promise.all([getCacheMeta(), getConfig()]);
            paint(fresh, freshCfg, { meta: freshMeta, live, offline: false });
        }
    } catch (err) {
        console.warn('[Homy] cache refresh failed', err);
    }
}

main().catch((err) => {
    console.error('[Homy] new tab failed to initialise', err);
});
