import { getConfig, getSession } from './storage.js';
import { getBaseUrl } from './api.js';
import { t, applyI18n } from './i18n.js';

const statusEl = document.getElementById('status');

async function init() {
    const cfg = await getConfig();
    const locale = cfg.locale || 'de-DE';
    applyI18n(document.body, locale);
    const session = await getSession();
    if (session.loggedIn && cfg.cacheStale) {
        statusEl.textContent = t('sync_stale_cache', locale);
        statusEl.className = 'status-err';
    } else if (session.loggedIn && cfg.lastSyncAt) {
        statusEl.textContent = `${t('last_sync', locale)}: ${new Date(cfg.lastSyncAt).toLocaleString()}`;
        statusEl.className = 'status-ok';
    } else if (session.loggedIn) {
        statusEl.textContent = t('connected', locale);
        statusEl.className = 'status-ok';
    } else {
        statusEl.textContent = t('not_connected', locale);
    }
}

document.getElementById('btn-sync').addEventListener('click', async () => {
    const locale = (await getConfig()).locale || 'de-DE';
    statusEl.textContent = t('loading', locale);
    chrome.runtime.sendMessage({ type: 'HOMY_SYNC_NOW' }, (res) => {
        if (res?.ok) {
            statusEl.textContent = t('sync_ok', locale);
            statusEl.className = 'status-ok';
        } else {
            statusEl.textContent = res?.error || t('sync_fail', locale);
            statusEl.className = 'status-err';
        }
    });
});

document.getElementById('btn-open').addEventListener('click', async () => {
    const base = await getBaseUrl();
    if (base) chrome.tabs.create({ url: `${base}/#dashboard` });
});

document.getElementById('btn-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
});

init();
