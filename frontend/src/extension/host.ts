import { h } from 'preact';
import type { Favorite, ServerConnection, Tab, WidgetInstance } from '@/sdk';
import type { BoardData, Host } from '@/ui/host';
import { ConnectPanel } from './ConnectPanel';
import { defaultBoard, store } from './storage';
import { fetchServerCache, makeServer, toServerTab, uid } from './sync';
import type { ServerWidget } from './sync';
export { makeServer, normalizeBase } from './sync';
import type { Connection, LocalBoard, ServerCache } from './storage';

function flattenBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[], folder = '', out: Favorite[] = []): Favorite[] {
  for (const n of nodes) {
    if (out.length >= 400) break;
    if (n.url && /^https?:/i.test(n.url)) out.push({ id: n.id, title: n.title || n.url, url: n.url, category: folder });
    if (n.children) flattenBookmarks(n.children, n.title || folder, out);
  }
  return out;
}

const FRESH_MS = 60_000;

export function createExtensionHost(locale: string, onFresh?: () => void): Host & { reconnect(): Promise<void> } {
  const de = locale.startsWith('de');
  let conn: Connection | null = null;
  let server: (ServerConnection & { token: string }) | null = null;
  let lastServerSnapshot = '';
  const blobIcons = new Map<string, Promise<string>>();
  const hasFaviconApi = typeof chrome !== 'undefined' && !!chrome.runtime?.getManifest?.().permissions?.includes('favicon');

  const reconnect = async () => {
    conn = await store.connection();
    server = conn?.token && conn.serverUrl ? makeServer(conn) : null;
  };

  const host: Host & { reconnect(): Promise<void> } = {
    kind: 'extension',
    locale,
    reconnect,
    kv: { get: (k, f) => store.kvGet(k, f), set: (k, v) => store.kvSet(k, v) },
    caps: {
      kind: 'extension',
      bookmarks: async () => (chrome.bookmarks ? flattenBookmarks(await chrome.bookmarks.getTree()) : []),
      topSites: async () => (chrome.topSites ? (await chrome.topSites.get()).map((s, i) => ({ id: i, title: s.title || s.url, url: s.url })) : []),
      favorites: async () => (server ? server.fetchJson<Favorite[]>('/api/favorites?layout=auto') : []),
      saveFavorite: async (f) => {
        if (!server) throw new Error(de ? 'Nicht mit Homy verbunden' : 'Not connected to Homy');
        const body = { title: f.title, url: f.url, category: f.category || 'General', icon_type: f.icon_type || 'auto', icon_value: f.icon_value || '' };
        return f.id !== undefined
          ? server.fetchJson<Favorite>(`/api/favorites/${f.id}`, { method: 'PUT', json: body })
          : server.fetchJson<Favorite>('/api/favorites', { method: 'POST', json: body });
      },
      deleteFavorite: async (id) => { await server?.fetchJson(`/api/favorites/${id}`, { method: 'DELETE' }); },
      favicon: (pageUrl) => {
        if (hasFaviconApi) return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`);
        if (!server) return '';
        const s = server;
        if (!blobIcons.has(pageUrl)) {
          blobIcons.set(pageUrl, fetch(`${s.baseUrl}/api/favicon?url=${encodeURIComponent(pageUrl)}`, { headers: { Authorization: `Bearer ${s.token}` } })
            .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status))))).then((b) => URL.createObjectURL(b)).catch(() => ''));
        }
        return blobIcons.get(pageUrl)!;
      },
    },
    server: () => server,

    async load(): Promise<BoardData> {
      await reconnect();
      let board = await store.board();
      if (!board) { board = defaultBoard(de); await store.saveBoard(board); }
      let serverPart: ServerCache | null = null;
      let notice: string | null = null;
      if (server && conn) {
        const cached = await store.cache();
        const age = cached ? Date.now() - new Date(cached.savedAt).getTime() : Infinity;
        if (cached && age < FRESH_MS) {
          serverPart = cached;
        } else if (cached) {
          // Stale-while-revalidate: paint the cached board now, refresh in the background.
          serverPart = cached;
          const c = conn;
          void fetchServerCache(c).then(async (fresh) => {
            await store.saveCache(fresh);
            if (JSON.stringify({ ...fresh, savedAt: '' }) !== JSON.stringify({ ...cached, savedAt: '' })) onFresh?.();
          }).catch((err) => { if ((err as { status?: number }).status === 401) onFresh?.(); });
          if (age > 30 * 60_000) notice = `${de ? 'Stand' : 'As of'} ${new Date(cached.savedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
        } else {
          try {
            serverPart = await fetchServerCache(conn, 6000);
            await store.saveCache(serverPart);
          } catch (err) {
            const status = (err as { status?: number }).status;
            notice = status === 401 ? (de ? 'Homy-Token ungültig – neu verbinden' : 'Homy token invalid – reconnect') : (de ? 'Homy nicht erreichbar' : 'Homy unreachable');
          }
        }
      }
      const tabs = [...board.tabs, ...(serverPart?.tabs || [])];
      const order = await store.order();
      tabs.sort((a, b) => {
        const ia = order.indexOf(a.id); const ib = order.indexOf(b.id);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
      lastServerSnapshot = JSON.stringify(serverSnapshot(tabs, [...board.widgets, ...(serverPart?.widgets || [])]));
      return {
        tabs,
        widgets: [...board.widgets, ...(serverPart?.widgets || [])],
        catalog: serverPart?.catalog || [],
        favorites: serverPart?.favorites || [],
        locked: serverPart?.locked,
        user: serverPart?.user || (conn?.username ? { username: conn.username } : null),
        notice,
      };
    },

    async persistLayout(tabs, widgets) {
      const localTabs = tabs.filter((t) => t.source === 'local');
      const localIds = new Set(localTabs.map((t) => t.id));
      await store.saveBoard({ tabs: localTabs, widgets: widgets.filter((w) => localIds.has(w.tab_id)) });
      await store.saveOrder(tabs.map((t) => t.id));
      if (!server) return;
      const snap = serverSnapshot(tabs, widgets);
      const json = JSON.stringify(snap);
      if (json === lastServerSnapshot) return;
      await server.fetchJson('/api/v2/layout', { method: 'PUT', json: { layout: 'desktop', ...snap } });
      lastServerSnapshot = json;
    },

    async createWidget(w, tab, entry) {
      if (tab.source === 'local') {
        const created = { ...w, id: uid() };
        const b = (await store.board()) as LocalBoard;
        await store.saveBoard({ ...b, widgets: [...b.widgets, created] });
        return created;
      }
      if (!server) throw new Error(de ? 'Nicht mit Homy verbunden' : 'Not connected to Homy');
      const module = entry.module || (await store.cache())?.catalog.find((c) => c.type === entry.type)?.module || 'start';
      const sw = await server.fetchJson<ServerWidget>('/api/widgets', {
        method: 'POST',
        json: { module, type: w.type, title: w.title || '', col: w.col, row: w.row, size_x: w.w, size_y: w.h, config: w.config, tab_id: toServerTab(tab.id), dashboard_layout: 'desktop' },
      });
      return { id: sw.id, type: sw.type, module: sw.module, title: sw.title, col: sw.col, row: sw.row, w: sw.size_x, h: sw.size_y, tab_id: tab.id, config: maskLike(sw.config, w.config) };
    },

    async updateWidget(w, tab) {
      if (tab.source === 'local') {
        const b = (await store.board()) as LocalBoard;
        await store.saveBoard({ ...b, widgets: b.widgets.map((x) => (x.id === w.id ? w : x)) });
        return w;
      }
      if (!server) throw new Error(de ? 'Nicht mit Homy verbunden' : 'Not connected to Homy');
      const sw = await server.fetchJson<ServerWidget>(`/api/widgets/${encodeURIComponent(w.id)}`, { method: 'PUT', json: { title: w.title || '', config: w.config } });
      return { ...w, config: maskLike(sw.config, w.config) };
    },

    async deleteWidget(w, tab) {
      if (tab.source === 'local') {
        const b = (await store.board()) as LocalBoard;
        await store.saveBoard({ ...b, widgets: b.widgets.filter((x) => x.id !== w.id) });
        return;
      }
      await server?.fetchJson(`/api/widgets/${encodeURIComponent(w.id)}`, { method: 'DELETE' });
    },

    tabSources: () => (server ? ['local', 'server'] : ['local']),

    renderForeign(el, w, _entry, tick) {
      if (!server?.embedUrl) {
        el.innerHTML = '';
        const d = document.createElement('div');
        d.className = 'w-state';
        d.textContent = de ? 'Homy-Verbindung nötig' : 'Homy connection required';
        el.appendChild(d);
        return undefined;
      }
      const theme = document.documentElement.dataset.theme || 'dark';
      const frame = document.createElement('iframe');
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer';
      frame.src = `${server.embedUrl(w.id)}?r=${tick}#token=${encodeURIComponent(server.token)}&theme=${theme}&locale=${locale}`;
      el.replaceChildren(frame);
      return () => frame.remove();
    },

    backgroundUrl: (bg) => {
      if (bg.type === 'url') return bg.url || '';
      if (bg.type !== 'asset' || !bg.asset_id || !server) return '';
      const key = `asset:${bg.asset_id}`;
      if (!blobIcons.has(key)) {
        const s2 = server;
        blobIcons.set(key, fetch(`${s2.baseUrl}/api/assets/${encodeURIComponent(String(bg.asset_id))}/file`, { headers: { Authorization: `Bearer ${s2.token}` } })
          .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status))))).then((b) => URL.createObjectURL(b)).catch(() => ''));
      }
      return blobIcons.get(key)!;
    },
    async uploadBackground(file) {
      if (server) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('category', 'background');
        const res = await fetch(`${server.baseUrl}/api/assets`, { method: 'POST', body: fd, headers: { Authorization: `Bearer ${server.token}` } });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
        return { type: 'asset', asset_id: data.id };
      }
      // No server: keep the image locally as a data URL (unlimitedStorage).
      if (file.size > 8 * 1024 * 1024) throw new Error(de ? 'Bild zu groß (max. 8 MB)' : 'Image too large (max 8 MB)');
      const url = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      return { type: 'url', url };
    },
    listBackgrounds: async () => {
      if (!server) return [];
      const list = await server.fetchJson<{ id: number; original_name: string }[]>('/api/assets?category=background');
      const resolve = host.backgroundUrl!;
      return Promise.all(list.map(async (a) => ({ id: a.id, name: a.original_name, url: await resolve({ type: 'asset', asset_id: a.id }) })));
    },
    loadUiSettings: () => store.ui(),
    saveUiSettings: (s) => store.saveUi(s),
    SettingsExtra: ({ onChanged }) => h(ConnectPanel, { locale, onChanged: async () => { await reconnect(); onChanged(); } }),
  };
  return host;
}

/** Keep masked secrets masked after the server echoes resolved values. */
function maskLike(serverCfg: Record<string, unknown>, sent: Record<string, unknown>): Record<string, unknown> {
  const out = { ...serverCfg };
  for (const [k, v] of Object.entries(sent)) if (v === '********') out[k] = v;
  for (const [k, v] of Object.entries(out)) if (v === '__VAULT_SECRET__') out[k] = '********';
  return out;
}

function serverSnapshot(tabs: Tab[], widgets: WidgetInstance[]) {
  const st = tabs.filter((t) => t.source === 'server');
  const ids = new Set(st.map((t) => t.id));
  return {
    tabs: st.map((t) => ({ id: toServerTab(t.id), name: t.name, ...(t.background ? { background: t.background } : {}) })),
    positions: widgets.filter((w) => ids.has(w.tab_id) && !w.id.startsWith('tmp-'))
      .map((w) => ({ id: w.id, col: w.col, row: w.row, w: w.w, h: w.h, tab_id: toServerTab(w.tab_id) })),
  };
}
