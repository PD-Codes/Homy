import type { CatalogEntry, Favorite, Tab, WidgetInstance } from '@/sdk';
import type { UiSettings } from '@/ui/host';

export interface Connection { serverUrl: string; token: string; username?: string; connectedAt?: string }
export interface LocalBoard { tabs: Tab[]; widgets: WidgetInstance[] }
export interface ServerCache {
  savedAt: string;
  tabs: Tab[];
  widgets: WidgetInstance[];
  catalog: CatalogEntry[];
  favorites: Favorite[];
  locked: boolean;
  user: { username: string; display_name?: string; role?: string } | null;
}

const KEYS = {
  board: 'homy.v2.board',
  conn: 'homy.v2.connection',
  cache: 'homy.v2.serverCache',
  ui: 'homy.v2.ui',
  order: 'homy.v2.tabOrder',
};

async function get<T>(key: string, fallback: T): Promise<T> {
  const r = await chrome.storage.local.get([key]);
  return (r[key] as T) ?? fallback;
}
async function set(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export const store = {
  board: () => get<LocalBoard | null>(KEYS.board, null),
  saveBoard: (b: LocalBoard) => set(KEYS.board, b),
  connection: () => get<Connection | null>(KEYS.conn, null),
  saveConnection: (c: Connection | null) => (c ? set(KEYS.conn, c) : chrome.storage.local.remove(KEYS.conn)),
  cache: () => get<ServerCache | null>(KEYS.cache, null),
  saveCache: (c: ServerCache | null) => (c ? set(KEYS.cache, c) : chrome.storage.local.remove(KEYS.cache)),
  ui: () => get<Partial<UiSettings>>(KEYS.ui, {}),
  saveUi: (u: UiSettings) => set(KEYS.ui, u),
  order: () => get<string[]>(KEYS.order, []),
  saveOrder: (ids: string[]) => set(KEYS.order, ids),
  kvGet: <T>(k: string, f: T) => get<T>(`homy.v2.kv.${k}`, f),
  kvSet: (k: string, v: unknown) => set(`homy.v2.kv.${k}`, v),
  /** Server URL of the previous add-on generation (pre-fills the connect form). */
  legacyServerUrl: async () => (await get<{ serverUrl?: string } | null>('homyConfig', null))?.serverUrl || '',
};

/** First run: a useful start page without any server. */
export function defaultBoard(de: boolean): LocalBoard {
  const tab = 'l-start';
  return {
    tabs: [{ id: tab, name: 'Start', source: 'local' }],
    widgets: [
      { id: 'l-search', type: 'search_bar', col: 0, row: 0, w: 24, h: 2, tab_id: tab, config: { engine: 'duckduckgo', search_favorites: 'Ja', autofocus: 'Ja' } },
      { id: 'l-clock', type: 'clock', col: 0, row: 2, w: 6, h: 4, tab_id: tab, config: { show_seconds: 'Nein', greeting: 'Ja' } },
      { id: 'l-weather', type: 'quick_weather', col: 6, row: 2, w: 6, h: 4, tab_id: tab, config: { location: de ? 'Berlin' : 'London', days: '3' } },
      { id: 'l-note', type: 'note', col: 12, row: 2, w: 12, h: 4, title: de ? 'Notizen' : 'Notes', tab_id: tab, config: { content: de ? '- [ ] Homy verbinden (⚙ → Homy-Verbindung)\n- [ ] Widgets anpassen: Taste E\n- [ ] Strg+K für Suche & Befehle' : '- [ ] Connect Homy (⚙ → Homy connection)\n- [ ] Customize widgets: press E\n- [ ] Ctrl+K for search & commands' } },
      { id: 'l-top', type: 'favorites', col: 0, row: 6, w: 12, h: 5, title: de ? 'Meistbesucht' : 'Top sites', tab_id: tab, config: { source: 'topsites', layout_mode: 'Grid', group_by_category: 'Nein' } },
      { id: 'l-bm', type: 'favorites', col: 12, row: 6, w: 12, h: 5, title: de ? 'Lesezeichen' : 'Bookmarks', tab_id: tab, config: { source: 'bookmarks', layout_mode: 'List', group_by_category: 'Ja' } },
    ],
  };
}
