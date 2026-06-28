import { getConfig } from './storage.js';
import { isNativeNewTabUrl } from './browser-env.js';

const EXT_NEW_TAB = chrome.runtime.getURL('newtab.html');
const EXT_ORIGIN = chrome.runtime.getURL('');
const DIAG_KEY = 'homyNewTabDiag';
const MAX_DIAG = 40;

async function shouldUseHomyNewTab() {
    const cfg = await getConfig();
    const mode = cfg.newTabMode || 'default';
    return mode && mode !== 'default';
}

/** Append a raw diagnostic record so we can see exactly what the browser reports. */
async function diag(event, info = {}) {
    try {
        const store = await chrome.storage.local.get([DIAG_KEY]);
        const list = Array.isArray(store[DIAG_KEY]) ? store[DIAG_KEY] : [];
        list.unshift({ event, ts: new Date().toISOString(), ...info });
        await chrome.storage.local.set({ [DIAG_KEY]: list.slice(0, MAX_DIAG) });
    } catch {
        /* ignore */
    }
}

async function redirectTabToHomy(tabId) {
    if (tabId == null || tabId < 0) return;
    try {
        await chrome.tabs.update(tabId, { url: EXT_NEW_TAB, active: true });
        await diag('redirect_ok', { tabId });
        return;
    } catch (err) {
        await diag('redirect_update_failed', { tabId, error: err.message });
    }
    try {
        const created = await chrome.tabs.create({ url: EXT_NEW_TAB, active: true });
        if (created?.id !== tabId) await chrome.tabs.remove(tabId);
        await diag('redirect_recreated', { tabId });
    } catch (err2) {
        await diag('redirect_failed', { tabId, error: err2.message });
    }
}

function looksLikeFreshNewTab(url, pendingUrl) {
    const u = (url || '').trim();
    const p = (pendingUrl || '').trim();
    if (isNativeNewTabUrl(u) || isNativeNewTabUrl(p)) return true;
    // Opera Speed Dial frequently reports an empty URL for a brand-new tab.
    if (!u && (!p || isNativeNewTabUrl(p))) return true;
    return false;
}

async function maybeRedirect(tabId, url, pendingUrl) {
    if (tabId == null) return;
    if ((url || '').startsWith(EXT_ORIGIN)) return;
    if (!looksLikeFreshNewTab(url, pendingUrl)) return;
    if (!(await shouldUseHomyNewTab())) return;
    await redirectTabToHomy(tabId);
}

/**
 * Detect the start page / Speed Dial across events and redirect to Homy's new tab.
 * Also records raw diagnostics (set newTabMode != default to activate redirects).
 */
export function registerNewTabRedirect() {
    if (!chrome.tabs?.onCreated) {
        diag('no_tabs_api');
        return;
    }
    diag('registered', {
        ua: navigator.userAgent,
        hasWebNav: !!chrome.webNavigation,
    });

    chrome.tabs.onCreated.addListener((tab) => {
        diag('created', {
            tabId: tab.id,
            url: tab.url || '',
            pendingUrl: tab.pendingUrl || '',
            title: tab.title || '',
        });
        maybeRedirect(tab.id, tab.url, tab.pendingUrl);
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status || changeInfo.url) {
            diag('updated', {
                tabId,
                status: changeInfo.status || '',
                changeUrl: changeInfo.url || '',
                url: tab.url || '',
                pendingUrl: tab.pendingUrl || '',
                title: tab.title || '',
            });
        }
        maybeRedirect(tabId, changeInfo.url || tab.url, tab.pendingUrl);
    });

    if (chrome.webNavigation?.onCommitted) {
        chrome.webNavigation.onCommitted.addListener((details) => {
            if (details.frameId !== 0) return;
            diag('webnav_committed', { tabId: details.tabId, url: details.url || '' });
            maybeRedirect(details.tabId, details.url, '');
        });
    }
}
