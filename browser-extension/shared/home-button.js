/**
 * "Home button in the browser toolbar".
 *
 * MV3 extensions cannot add a second toolbar button, so the extension's own action
 * button is repurposed: when the option is on, clicking it goes straight to Homy
 * instead of opening the popup. Turning the option off restores the popup.
 */

import { getConfig } from './storage.js';
import { normalizeBaseUrl } from './api.js';

const POPUP_PAGE = 'popup.html';
const NEW_TAB_PAGE = 'newtab.html';

/** Where the home button should land. */
async function resolveHomeUrl() {
    const cfg = await getConfig();
    const base = normalizeBaseUrl(cfg.serverUrl);
    if (base) return `${base}/#dashboard`;
    // No server configured yet — the cached new tab page is still useful.
    return chrome.runtime.getURL(NEW_TAB_PAGE);
}

/** Point the action button at either the popup or the direct-open handler. */
export async function applyHomeButtonMode() {
    const cfg = await getConfig();
    const enabled = cfg.showHomeButton !== false;
    try {
        await chrome.action.setPopup({ popup: enabled ? '' : POPUP_PAGE });
        await chrome.action.setTitle({
            title: enabled ? 'Homy' : 'Homy Companion',
        });
    } catch (err) {
        console.warn('[Homy] could not update the toolbar button', err);
    }
}

/**
 * Open Homy in the current tab if it is a blank/new tab, otherwise in a new one, so
 * the button never destroys a page the user was looking at.
 */
async function openHome() {
    const url = await resolveHomeUrl();
    try {
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
        const current = (active?.url || active?.pendingUrl || '').trim();
        const isBlank = !current
            || current === 'about:blank'
            || current.startsWith('chrome://new-tab-page')
            || current.startsWith('chrome://startpage')
            || current.startsWith(chrome.runtime.getURL(NEW_TAB_PAGE));

        if (active?.id != null && isBlank) {
            await chrome.tabs.update(active.id, { url });
            return;
        }
    } catch (err) {
        console.warn('[Homy] could not inspect the active tab', err);
    }
    await chrome.tabs.create({ url });
}

export function registerHomeButton() {
    if (!chrome.action?.onClicked) return;

    // Only fires when no popup is set, i.e. exactly when the option is enabled.
    chrome.action.onClicked.addListener(() => {
        openHome().catch((err) => console.warn('[Homy] home button failed', err));
    });

    // Keep the button in sync when the option is toggled in the settings page.
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.homyConfig) return;
        const before = changes.homyConfig.oldValue?.showHomeButton;
        const after = changes.homyConfig.newValue?.showHomeButton;
        if (before !== after) applyHomeButtonMode();
    });

    applyHomeButtonMode();
}
