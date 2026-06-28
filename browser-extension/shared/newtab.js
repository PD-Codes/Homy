import { getConfig } from './storage.js';
import { getBaseUrl } from './api.js';
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

async function paintFromCache(cfg, meta) {
    const payload = await getOfflineCacheOrLegacy();
    if (!payload) {
        renderEmpty(cfg.locale || 'de-DE');
        return null;
    }
    const locale = cfg.locale || 'de-DE';
    let baseUrl = '';
    try {
        baseUrl = await getBaseUrl();
    } catch {
        baseUrl = '';
    }
    renderNewTabPage(app, payload, {
        locale,
        mode: cfg.newTabMode || 'cached',
        baseUrl,
        offline: !!cfg.cacheStale || !navigator.onLine,
        savedAt: meta?.savedAt || cfg.lastSyncAt,
    });
    return payload;
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

    const meta = await getCacheMeta();
    await paintFromCache(cfg, meta);

    tryRefreshCache().then((fresh) => {
        if (!fresh) return;
        getCacheMeta().then((m) => {
            getConfig().then((c) => {
                renderNewTabPage(app, fresh, {
                    locale: c.locale || locale,
                    mode: c.newTabMode || mode,
                    baseUrl: c.serverUrl ? normalize(c.serverUrl) : '',
                    offline: false,
                    savedAt: m?.savedAt || c.lastSyncAt,
                });
            });
        });
    });
}

function normalize(url) {
    const trimmed = String(url || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

main();
