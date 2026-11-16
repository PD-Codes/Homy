import { h } from 'preact';
import type { Background, CatalogEntry, Favorite, ServerConnection, Tab, WidgetInstance } from '@/sdk';
import type { BoardData, Host, LayoutKey, UiSettings } from '@/ui/host';
import { PAGES } from './pages';
import { favorites as favSignal, serverCatalog } from '@/ui/store';
import { requestJson } from './http';
import { legacyConfig, renderLegacy } from './legacy';
import { AccountPanel } from './AccountPanel';

interface Bootstrap {
  user: BoardData['user'];
  preferences: Record<string, unknown>;
  layout: { locked: boolean; tabs: { id: string; name: string; background?: Background }[]; widgets: WidgetInstance[] };
  favorites: Favorite[];
  catalog: CatalogEntry[];
}

interface ServerWidget {
  id: string; type: string; module: string; title: string | null; col: number; row: number;
  size_x: number; size_y: number; tab_id: string; config: Record<string, unknown>;
}

export const server: ServerConnection = {
  baseUrl: '',
  fetchJson: (path, init) => requestJson(path, init),
};

const fromServer = (w: ServerWidget): WidgetInstance => ({
  id: w.id, type: w.type, module: w.module, title: w.title, col: w.col, row: w.row, w: w.size_x, h: w.size_y,
  tab_id: w.tab_id || 'default', config: w.config || {},
});

function moduleFor(entry: CatalogEntry): string {
  if (entry.module) return entry.module;
  return serverCatalog.value.find((e) => e.type === entry.type)?.module || 'start';
}

const UI_KEY = 'homy.ui.web';

export function createWebHost(locale: string): Host {
  return {
    kind: 'web',
    locale,
    kv: {
      async get<T>(key: string, fallback: T) { try { const v = localStorage.getItem(`homy.kv.${key}`); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; } },
      async set(key, value) { localStorage.setItem(`homy.kv.${key}`, JSON.stringify(value)); },
    },
    caps: {
      kind: 'web',
      favorites: async () => {
        const list = await requestJson<Favorite[]>('/api/favorites?layout=auto');
        favSignal.value = list;
        return list;
      },
      saveFavorite: async (f) => {
        const body = { title: f.title, url: f.url, category: f.category || 'General', icon_type: f.icon_type || 'auto', icon_value: f.icon_value || '' };
        return f.id !== undefined
          ? requestJson<Favorite>(`/api/favorites/${f.id}`, { method: 'PUT', json: body })
          : requestJson<Favorite>('/api/favorites', { method: 'POST', json: body });
      },
      deleteFavorite: async (id) => { await requestJson(`/api/favorites/${id}`, { method: 'DELETE' }); },
      favicon: (url) => `/api/favicon?url=${encodeURIComponent(url)}`,
      assetUrl: (id) => `/api/assets/${encodeURIComponent(id)}/file`,
    },
    server: () => server,
    async load(layout: LayoutKey = 'desktop') {
      const b = await requestJson<Bootstrap>(`/api/v2/bootstrap?layout=${layout}`);
      return {
        tabs: b.layout.tabs.map((t): Tab => ({ id: t.id, name: t.name, source: 'server', background: t.background })),
        widgets: b.layout.widgets,
        catalog: b.catalog,
        favorites: b.favorites,
        locked: b.layout.locked,
        user: b.user,
        preferences: b.preferences,
      };
    },
    async persistLayout(tabs, widgets, layout = 'desktop') {
      await requestJson('/api/v2/layout', {
        method: 'PUT',
        json: {
          layout,
          tabs: tabs.map((t) => ({ id: t.id, name: t.name, ...(t.background ? { background: t.background } : {}) })),
          positions: widgets.filter((w) => !w.id.startsWith('tmp-')).map((w) => ({ id: w.id, col: w.col, row: w.row, w: w.w, h: w.h, tab_id: w.tab_id })),
        },
      });
    },
    async createWidget(w, _tab, entry, layout = 'desktop') {
      const created = await requestJson<ServerWidget>('/api/widgets', {
        method: 'POST',
        json: {
          module: moduleFor(entry), type: w.type, title: w.title || '', col: w.col, row: w.row, size_x: w.w, size_y: w.h,
          config: w.config, tab_id: w.tab_id, dashboard_layout: layout === 'mobile' ? 'mobile' : 'desktop', is_public: layout === 'public',
        },
      });
      return fromServer(created);
    },
    async updateWidget(w) {
      const saved = await requestJson<ServerWidget>(`/api/widgets/${encodeURIComponent(w.id)}`, {
        method: 'PUT', json: { title: w.title || '', config: w.config },
      });
      // Never keep resolved secrets in memory: mask what the server stored in the vault.
      const masked = { ...saved.config };
      for (const [k, v] of Object.entries(w.config)) if (v === '********') masked[k] = v;
      return { ...fromServer(saved), config: masked };
    },
    async deleteWidget(w) {
      await requestJson(`/api/widgets/${encodeURIComponent(w.id)}`, { method: 'DELETE' });
    },
    tabSources: () => ['server'],
    renderForeign: (el, w, entry) => renderLegacy(el, w, entry, locale),
    customConfig: (el, w, entry) => legacyConfig(el, w, entry, locale),
    async loadUiSettings() {
      try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') as Partial<UiSettings>; } catch { return {}; }
    },
    async saveUiSettings(s) {
      localStorage.setItem(UI_KEY, JSON.stringify(s));
      await requestJson('/api/user/preferences', { method: 'POST', json: { theme: s.theme } }).catch(() => undefined);
    },
    SettingsExtra: () => h(AccountPanel, {}),
    pages: () => PAGES,
    layouts: () => ['desktop', 'mobile', 'public'],
    backgroundUrl: (bg) => (bg.type === 'url' ? bg.url || '' : bg.type === 'asset' && bg.asset_id ? `/api/assets/${encodeURIComponent(String(bg.asset_id))}/file` : ''),
    async uploadBackground(file) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', 'background');
      const res = await fetch('/api/assets', { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      return { type: 'asset', asset_id: data.id };
    },
    async listBackgrounds() {
      const list = await requestJson<{ id: number; original_name: string; url: string }[]>('/api/assets?category=background');
      return list.map((a) => ({ id: a.id, name: a.original_name, url: a.url }));
    },
    async duplicateTab(tab, name, layout) {
      const l = layout === 'desktop' ? 'auto' : layout;
      await requestJson('/api/tabs/duplicate', { method: 'POST', json: { source_layout: l, target_layout: l, source_tab_id: tab.id, name } });
    },
  };
}
