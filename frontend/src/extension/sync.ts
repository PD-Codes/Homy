/** Server sync helpers shared by the new-tab page and the background worker (no UI imports). */
import type { Background, CatalogEntry, Favorite, ServerConnection, WidgetInstance } from '@/sdk';
import { requestJson } from '@/web/http';
import type { Connection, ServerCache } from './storage';

export const S = 's:';
export const toLocalTab = (id: string) => `${S}${id}`;
export const toServerTab = (id: string) => (id.startsWith(S) ? id.slice(S.length) : id);
export const uid = () => `l-${crypto.randomUUID().slice(0, 8)}`;

export interface ServerWidget { id: string; type: string; module: string; title: string | null; col: number; row: number; size_x: number; size_y: number; tab_id: string; config: Record<string, unknown> }
export interface Bootstrap {
  user: ServerCache['user'];
  layout: { locked: boolean; tabs: { id: string; name: string; background?: Background }[]; widgets: WidgetInstance[] };
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

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

/** Turn a bootstrap response into the add-on's server cache (tab ids prefixed with "s:"). */
export function toCache(b: Bootstrap): ServerCache {
  return {
    savedAt: new Date().toISOString(),
    tabs: b.layout.tabs.map((t) => ({ id: toLocalTab(t.id), name: t.name, source: 'server' as const, background: t.background })),
    widgets: b.layout.widgets.map((w) => ({ ...w, tab_id: toLocalTab(w.tab_id) })),
    catalog: b.catalog, favorites: b.favorites, locked: b.layout.locked, user: b.user,
  };
}

export async function fetchServerCache(conn: Connection, timeoutMs = 8000): Promise<ServerCache> {
  const b = await withTimeout(makeServer(conn).fetchJson<Bootstrap>('/api/v2/bootstrap?layout=desktop'), timeoutMs);
  return toCache(b);
}

