import { getConfig, setConfig, getSession, setSession } from './storage.js';

/**
 * Keep scheme + host + optional path prefix (e.g. https://nas.local/homy).
 * @param {string} url
 */
export function normalizeBaseUrl(url) {
    const trimmed = String(url || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    if (!/^https?:\/\//i.test(trimmed)) {
        return `https://${trimmed}`;
    }
    return trimmed;
}

export async function getBaseUrl() {
    const cfg = await getConfig();
    return normalizeBaseUrl(cfg.serverUrl);
}

export function buildApiUrl(base, path) {
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
}

function stripHtmlError(text, status, requestUrl) {
    if (!text || !/<!doctype\s+html/i.test(text)) return null;
    return `HTTP ${status} — ${requestUrl} (nicht gefunden). Server-URL prüfen: Scheme, Port und ggf. Unterpfad (z. B. https://host/homy). Homy aktuell?`;
}

/**
 * @param {string} path
 * @param {RequestInit} [options]
 */
async function apiFetch(path, options = {}) {
    const base = await getBaseUrl();
    if (!base) throw new Error('Server URL not configured');
    const url = buildApiUrl(base, path);
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
    });
    let data = null;
    const text = await res.text();
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = { message: text };
        }
    }
    if (!res.ok) {
        const htmlMsg = stripHtmlError(text, res.status, url);
        const msg = htmlMsg || data?.message || data?.error || res.statusText || `HTTP ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.url = url;
        throw err;
    }
    return data;
}

/** Older Homy without /api/extension/sync — compose bundle from existing APIs. */
async function fetchExtensionSyncLegacy() {
    const [favorites, widgets, tabs] = await Promise.all([
        apiFetch('/api/favorites?layout=auto'),
        apiFetch('/api/widgets?layout=auto'),
        apiFetch('/api/tabs?layout=auto'),
    ]);
    return {
        version: '1.0',
        layout: 'desktop',
        exported_at: new Date().toISOString(),
        tabs: tabs || [],
        widgets: widgets || [],
        favorites: favorites || [],
        _legacy: true,
    };
}

export async function testServerReachable() {
    const base = await getBaseUrl();
    if (!base) throw new Error('Server URL not configured');
    return apiFetch('/api/auth/status');
}

export async function checkAuthStatus() {
    return apiFetch('/api/auth/status');
}

export async function login(username, password) {
    const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    });
    if (data.mfa_required) {
        await setSession({ loggedIn: false, mfaRequired: true, mfaPending: true });
        return data;
    }
    await setSession({ loggedIn: true, mfaRequired: false, username: data.user?.username });
    return data;
}

export async function verifyMfa(code) {
    const data = await apiFetch('/api/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
    });
    await setSession({ loggedIn: true, mfaRequired: false, username: data.user?.username });
    return data;
}

export async function logout() {
    try {
        await apiFetch('/api/auth/logout', { method: 'POST', body: '{}' });
    } catch {
        /* ignore */
    }
    await setSession({ loggedIn: false, mfaRequired: false });
}

export async function fetchExtensionSync() {
    try {
        return await apiFetch('/api/extension/sync?layout=auto');
    } catch (err) {
        if (err.status === 404) {
            return fetchExtensionSyncLegacy();
        }
        throw err;
    }
}

export async function exportLayoutBackup() {
    return apiFetch('/api/layout/export?layout=auto');
}

export async function importBrowserFavorites(items, category) {
    return apiFetch('/api/favorites/import-browser', {
        method: 'POST',
        body: JSON.stringify({ items, category }),
    });
}
