/// <reference types="chrome" />
import { store } from './storage';
import { fetchServerCache } from './sync';
/**
 * Background worker: toolbar button opens Homy; Opera (no new-tab override) gets its
 * Speed Dial redirected to the add-on page.
 */
const PAGE = chrome.runtime.getURL('newtab.html');
const hasOverride = !!(chrome.runtime.getManifest() as chrome.runtime.ManifestV3 & { chrome_url_overrides?: object }).chrome_url_overrides;

chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: PAGE });
});

function isNativeNewTab(url = ''): boolean {
  const u = url.toLowerCase();
  return u.includes('://startpage') || u.includes('://new-tab-page') || /^(chrome|opera|edge|brave|vivaldi):\/\/newtab\b/.test(u);
}

if (!hasOverride && chrome.tabs?.onCreated) {
  const redirect = (tabId?: number, url?: string, pending?: string) => {
    if (tabId == null || tabId < 0) return;
    if ((url || '').startsWith(PAGE)) return;
    if (isNativeNewTab(url) || isNativeNewTab(pending) || (!url && !pending)) {
      chrome.tabs.update(tabId, { url: PAGE }).catch(() => undefined);
    }
  };
  chrome.tabs.onCreated.addListener((tab) => redirect(tab.id, tab.url, tab.pendingUrl));
  chrome.tabs.onUpdated.addListener((tabId, change, tab) => { if (change.url) redirect(tabId, change.url, tab.pendingUrl); });
}

// ---------------------------------------------------------------- background sync
// Keeps the Homy copy fresh even when no new tab is open, so the next tab paints current data instantly.

const SYNC_ALARM = 'homy-sync';

async function syncNow(): Promise<void> {
  const conn = await store.connection();
  if (!conn?.token) return;
  try {
    await store.saveCache(await fetchServerCache(conn, 15_000));
  } catch (err) {
    console.warn('[Homy] background sync failed', err);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 10 });
  void syncNow();
});
chrome.runtime.onStartup?.addListener(() => {
  void chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 10 });
  void syncNow();
});
chrome.alarms.onAlarm.addListener((a) => { if (a.name === SYNC_ALARM) void syncNow(); });
