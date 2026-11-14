import { h } from 'preact';
import type { CatalogEntry, Favorite, ServerConnection, Tab, WidgetInstance } from '@/sdk';
import type { BoardData, Host, UiSettings } from '@/ui/host';
import { favorites as favSignal, serverCatalog } from '@/ui/store';
import { requestJson } from './http';
import { renderLegacy } from './legacy';
import { AccountPanel } from './AccountPanel';

interface Bootstrap {
  user: BoardData['user'];
  preferences: Record<string, unknown>;
  layout: { locked: boolean; tabs: { id: string; name: string }[]; widgets: WidgetInstance[] };
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
    async load() {
      const b = await requestJson<Bootstrap>('/api/v2/bootstrap?layout=desktop');
      return {
        tabs: b.layout.tabs.map((t): Tab => ({ id: t.id, name: t.name, source: 'server' })),
        widgets: b.layout.widgets,
        catalog: b.catalog,
        favorites: b.favorites,
        locked: b.layout.locked,
        user: b.user,
        preferences: b.preferences,
      };
    },
    async persistLayout(tabs, widgets) {
      await requestJson('/api/v2/layout', {
        method: 'PUT',
        json: {
          layout: 'desktop',
          tabs: tabs.map((t) => ({ id: t.id, name: t.name })),
          positions: widgets.filter((w) => !w.id.startsWith('tmp-')).map((w) => ({ id: w.id, col: w.col, row: w.row, w: w.w, h: w.h, tab_id: w.tab_id })),
        },
      });
    },
    async createWidget(w, _tab, entry) {
      const created = await requestJson<ServerWidget>('/api/widgets', {
        method: 'POST',
        json: { module: moduleFor(entry), type: w.type, title: w.title || '', col: w.col, row: w.row, size_x: w.w, size_y: w.h, config: w.config, tab_id: w.tab_id, dashboard_layout: 'desktop' },
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
    async loadUiSettings() {
      try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}') as Partial<UiSettings>; } catch { return {}; }
    },
    async saveUiSettings(s) {
      localStorage.setItem(UI_KEY, JSON.stringify(s));
      await requestJson('/api/user/preferences', { method: 'POST', json: { theme: s.theme } }).catch(() => undefined);
    },
    SettingsExtra: () => h(AccountPanel, {}),
    menuLinks: () => {
      const de = locale.startsWith('de');
      return [
        { label: de ? 'Integrationen & Verwaltung (klassisch)' : 'Integrations & admin (classic)', href: '/classic', icon: 'settings' },
      ];
    },
  };
}
