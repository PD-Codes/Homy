import { getConfig } from './storage.js';
import { runFullSync } from './sync.js';
import { checkAuthStatus } from './api.js';
import { setSession } from './storage.js';
import { migrateLegacyCache } from './cache.js';
import { registerNewTabRedirect } from './newtab-guard.js';
import { registerHomeButton, applyHomeButtonMode } from './home-button.js';

registerNewTabRedirect();
registerHomeButton();

chrome.runtime.onInstalled.addListener(async () => {
    await migrateLegacyCache();
    await applyHomeButtonMode();
    chrome.alarms.create('homy-sync', { periodInMinutes: 60 });
});

// The service worker is torn down when idle; restore the button state on wake-up.
chrome.runtime.onStartup?.addListener(() => {
    applyHomeButtonMode();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'homy-sync') return;
    const cfg = await getConfig();
    const minutes = Math.max(15, parseInt(cfg.syncIntervalMinutes, 10) || 60);
    if (alarm.periodInMinutes !== minutes) {
        chrome.alarms.create('homy-sync', { periodInMinutes: minutes });
    }
    try {
        const status = await checkAuthStatus();
        if (!status.logged_in) return;
        await setSession({ loggedIn: true, username: status.user?.username });
        await runFullSync();
    } catch (err) {
        console.warn('[Homy] background sync failed', err);
    }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'HOMY_SYNC_NOW') {
        runFullSync()
            .then((result) => sendResponse({ ok: true, data: result.payload, stale: result.stale }))
            .catch((err) => sendResponse({ ok: false, error: err.message }));
        return true;
    }
    return false;
});
