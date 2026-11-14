import { h } from 'preact';
import type { CatalogEntry, Favorite, ServerConnection, Tab, WidgetInstance } from '@/sdk';
import type { BoardData, Host } from '@/ui/host';
import { requestJson } from '@/web/http';
import { ConnectPanel } from './ConnectPanel';
import { defaultBoard, store } from './storage';
import type { Connection, LocalBoard, ServerCache } from './storage';

const S = 's:';
const toLocalTab = (id: string) => `${S}${id}`;
const toServerTab = (id: string) => (id.startsWith(S) ? id.slice(S.length) : id);
const uid = () => `l-${crypto.randomUUID().slice(0, 8)}`;

interface ServerWidget { id: string; type: string; module: string; title: string | null; col: number; row: number; size_x: number; size_y: number; tab_id: string; config: Record<string, unknown> }
interface Bootstrap {
  user: ServerCache['user'];
  layout: { locked: boolean; tabs: { id: string; name: string }[]; widgets: WidgetInstance[] };
  favorites: Favorite[];
  catalog: CatalogEntry[];
}

export function normalizeBase(url: string): string {
  const t = url.trim().replace(/\/+$/, '');
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function makeServer(conn: Connection): ServerConnection & { token: string } {
  const base = normalizeBase(conn.serverUrl);
  return {
    baseUrl: base,
    token: conn.token,
    fetchJson: (path, init = {}) => requestJson(`${base}${path}`, { ...init, credentials: 'omit' }, { Authorization: `Bearer ${conn.token}` }),
    embedUrl: (id) => `${base}/embed/widget/${encodeURIComponent(id)}`,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

function flattenBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[], folder = '', out: Favorite[] = []): Favorite[] {
  for (const n of nodes) {
    if (out.length >= 400) break;
    if (n.url && /^https?:/i.test(n.url)) out.push({ id: n.id, title: n.title || n.url, url: n.url, category: folder });
    if (n.children) flattenBookmarks(n.children, n.title || folder, out);
  }
  return out;
}

export function createExtensionHost(locale: string): Host & { reconnect(): Promise<void> } {
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
      if (server) {
        try {
          const b = await withTimeout(server.fetchJson<Bootstrap>('/api/v2/bootstrap?layout=desktop'), 6000);
          serverPart = {
            savedAt: new Date().toISOString(),
            tabs: b.layout.tabs.map((t) => ({ id: toLocalTab(t.id), name: t.name, source: 'server' as const })),
            widgets: b.layout.widgets.map((w) => ({ ...w, tab_id: toLocalTab(w.tab_id) })),
            catalog: b.catalog, favorites: b.favorites, locked: b.layout.locked, user: b.user,
          };
          await store.saveCache(serverPart);
        } catch (err) {
          serverPart = await store.cache();
          const status = (err as { status?: number }).status;
          if (status === 401) notice = de ? 'Homy-Token ungültig – neu verbinden' : 'Homy token invalid – reconnect';
          else if (serverPart) notice = `${de ? 'Offline – Stand' : 'Offline – as of'} ${new Date(serverPart.savedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
          else notice = de ? 'Homy nicht erreichbar' : 'Homy unreachable';
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
    tabs: st.map((t) => ({ id: toServerTab(t.id), name: t.name })),
    positions: widgets.filter((w) => ids.has(w.tab_id) && !w.id.startsWith('tmp-'))
      .map((w) => ({ id: w.id, col: w.col, row: w.row, w: w.w, h: w.h, tab_id: toServerTab(w.tab_id) })),
  };
}
