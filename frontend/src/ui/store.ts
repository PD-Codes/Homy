import { batch, computed, signal } from '@preact/signals';
import { allModules, getModule, moduleToCatalog } from '@/sdk';
import type { CatalogEntry, Favorite, Tab, WidgetInstance } from '@/sdk';
import type { Host, UiSettings } from './host';
import { applyTheme } from './theme';
import { findFreeSpot, fixOverlaps } from './grid/layout';
import { makeT } from './i18n';

export type Drawer = null | { kind: 'add' } | { kind: 'config'; id: string } | { kind: 'settings' };

export interface Toast { id: number; text: string; action?: { label: string; run: () => void }; tone?: 'error' }

let host: Host;
export const tabs = signal<Tab[]>([]);
export const widgets = signal<WidgetInstance[]>([]);
export const serverCatalog = signal<CatalogEntry[]>([]);
export const favorites = signal<Favorite[]>([]);
export const activeTabId = signal<string>('');
export const editing = signal(false);
export const drawer = signal<Drawer>(null);
export const paletteOpen = signal(false);
export const toasts = signal<Toast[]>([]);
export const locked = signal(false);
export const loading = signal(true);
export const loadError = signal<string | null>(null);
export const notice = signal<string | null>(null);
export const refreshTick = signal(0);
export const highlightId = signal<string | null>(null);
export const user = signal<{ username: string; display_name?: string; role?: string } | null>(null);
export const ui = signal<UiSettings>({ theme: 'dark', fitToScreen: true, density: 'compact' });

export const t = computed(() => makeT(host?.locale || 'de-DE'));
export const activeTab = computed(() => tabs.value.find((x) => x.id === activeTabId.value) || tabs.value[0]);
export const tabWidgets = computed(() => widgets.value.filter((w) => w.tab_id === activeTab.value?.id));

/** Native modules win over server types with the same id (configs are compatible). */
export const catalog = computed<CatalogEntry[]>(() => {
  const locale = host?.locale || 'de-DE';
  const connected = !!host?.server();
  const native = allModules()
    .filter((m) => !m.only || m.only === host?.kind)
    .filter((m) => !m.needsServer || connected)
    .map((m) => moduleToCatalog(m, locale));
  const nativeTypes = new Set(native.map((n) => n.type));
  const server = serverCatalog.value
    .filter((e) => !nativeTypes.has(e.type))
    .map((e) => ({ ...e, category: e.source === 'integration' ? 'integration' as const : e.category || 'info' as const, needsServer: true }));
  return [...native, ...server];
});

export function catalogEntry(type: string): CatalogEntry | undefined {
  return catalog.value.find((c) => c.type === type) || serverCatalog.value.find((c) => c.type === type);
}

export function getHost(): Host { return host; }

// ------------------------------------------------------------------ boot

export async function boot(h: Host): Promise<void> {
  host = h;
  const settings = await host.loadUiSettings().catch(() => ({}));
  ui.value = { ...ui.value, ...settings };
  applyTheme(ui.value.theme);
  await reload();
}

export async function reload(): Promise<void> {
  loading.value = true;
  try {
    const data = await host.load();
    batch(() => {
      tabs.value = data.tabs;
      // Repair overlapping layouts per tab (display only; saved with the next edit).
      const byTab = new Map<string, WidgetInstance[]>();
      for (const w of data.widgets) byTab.set(w.tab_id, [...(byTab.get(w.tab_id) || []), w]);
      widgets.value = [...byTab.values()].flatMap((list) => fixOverlaps(list));
      serverCatalog.value = data.catalog;
      favorites.value = data.favorites || [];
      locked.value = !!data.locked;
      user.value = data.user || null;
      notice.value = data.notice || null;
      loadError.value = null;
      const remembered = sessionStorage.getItem(`homy.tab.${host.kind}`);
      if (!data.tabs.some((x) => x.id === activeTabId.value)) {
        activeTabId.value = data.tabs.some((x) => x.id === remembered) ? remembered! : data.tabs[0]?.id || '';
      }
    });
    const prefs = data.preferences || {};
    if (!localThemeChosen() && typeof prefs.theme === 'string') {
      applyTheme(prefs.theme, prefs.custom_theme as Record<string, string>);
    }
  } catch (err) {
    loadError.value = (err as Error).message || String(err);
  } finally {
    loading.value = false;
  }
}

function localThemeChosen(): boolean {
  try { return localStorage.getItem('homy.themeChosen') === '1'; } catch { return false; }
}

// ------------------------------------------------------------------ toasts

let toastSeq = 0;
export function toast(text: string, opts: Partial<Omit<Toast, 'id' | 'text'>> = {}, ms = 4500): void {
  const id = ++toastSeq;
  toasts.value = [...toasts.value, { id, text, ...opts }];
  setTimeout(() => { toasts.value = toasts.value.filter((x) => x.id !== id); }, ms);
}

function fail(err: unknown): void {
  toast((err as Error)?.message || String(err), { tone: 'error' }, 7000);
}

// ------------------------------------------------------------------ tabs

export function selectTab(id: string): void {
  activeTabId.value = id;
  try { sessionStorage.setItem(`homy.tab.${host.kind}`, id); } catch { /* ignore */ }
}

export function canEdit(tab: Tab | undefined = activeTab.value): boolean {
  if (!tab) return false;
  return !(tab.source === 'server' && locked.value);
}

export function addTab(name: string, source: Tab['source']): void {
  const prefix = source === 'local' ? 'l' : host.kind === 'extension' ? 's:t' : 't';
  const id = `${prefix}${Date.now().toString(36)}`;
  tabs.value = [...tabs.value, { id, name, source }];
  selectTab(id);
  scheduleSave();
}

export function renameTab(id: string, name: string): void {
  tabs.value = tabs.value.map((x) => (x.id === id ? { ...x, name } : x));
  scheduleSave();
}

export async function removeTab(id: string): Promise<void> {
  const tab = tabs.value.find((x) => x.id === id);
  if (!tab) return;
  const sameSource = tabs.value.filter((x) => x.source === tab.source);
  if (sameSource.length <= 1) {
    toast(t.value('Der letzte Tab kann nicht gelöscht werden.', 'The last tab cannot be deleted.'));
    return;
  }
  const doomed = widgets.value.filter((w) => w.tab_id === id);
  try {
    for (const w of doomed) await host.deleteWidget(w, tab);
  } catch (err) { fail(err); return; }
  batch(() => {
    widgets.value = widgets.value.filter((w) => w.tab_id !== id);
    tabs.value = tabs.value.filter((x) => x.id !== id);
    if (activeTabId.value === id) selectTab(tabs.value[0]?.id || '');
  });
  scheduleSave();
}

export function moveTab(id: string, dir: -1 | 1): void {
  const list = [...tabs.value];
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  tabs.value = list;
  scheduleSave();
}

// ------------------------------------------------------------------ widgets

let saveTimer: ReturnType<typeof setTimeout> | undefined;
export function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    host.persistLayout(tabs.value, widgets.value).catch(fail);
  }, 500);
}

export function setLayout(next: WidgetInstance[]): void {
  const byId = new Map(next.map((w) => [w.id, w]));
  widgets.value = widgets.value.map((w) => byId.get(w.id) || w);
  scheduleSave();
}

export async function addWidget(entry: CatalogEntry): Promise<void> {
  const tab = activeTab.value;
  if (!tab) return;
  if (entry.needsServer && tab.source !== 'server') {
    toast(t.value('Dieses Widget braucht einen Homy-Tab.', 'This widget needs a Homy tab.'));
    return;
  }
  const spot = findFreeSpot(tabWidgets.value, entry.size.w, entry.size.h);
  const config: Record<string, unknown> = {};
  for (const f of entry.schema) if (f.default !== undefined && f.default !== null) config[f.key] = f.default;
  const draft: WidgetInstance = {
    id: `tmp-${Date.now().toString(36)}`, type: entry.type, module: entry.module ?? 'start',
    title: '', col: spot.col, row: spot.row, w: entry.size.w, h: entry.size.h, tab_id: tab.id, config,
  };
  try {
    const created = await host.createWidget(draft, tab, entry);
    widgets.value = [...widgets.value, created];
    flash(created.id);
    const needsConfig = entry.schema.some((f) => f.type === 'integration' || (f.key === 'location' && !config[f.key]));
    drawer.value = needsConfig || entry.schema.length ? { kind: 'config', id: created.id } : null;
  } catch (err) { fail(err); }
}

export async function updateWidget(id: string, patch: Partial<WidgetInstance>): Promise<void> {
  const current = widgets.value.find((w) => w.id === id);
  const tab = tabs.value.find((x) => x.id === current?.tab_id);
  if (!current || !tab) return;
  const next = { ...current, ...patch, config: { ...current.config, ...(patch.config || {}) } };
  widgets.value = widgets.value.map((w) => (w.id === id ? next : w));
  try {
    const saved = await host.updateWidget(next, tab);
    if (saved) widgets.value = widgets.value.map((w) => (w.id === id ? { ...next, config: saved.config } : w));
  } catch (err) {
    widgets.value = widgets.value.map((w) => (w.id === id ? current : w));
    fail(err);
  }
}

export async function duplicateWidget(id: string): Promise<void> {
  const src = widgets.value.find((w) => w.id === id);
  const tab = tabs.value.find((x) => x.id === src?.tab_id);
  const entry = src && catalogEntry(src.type);
  if (!src || !tab || !entry) return;
  const spot = findFreeSpot(widgets.value.filter((w) => w.tab_id === tab.id), src.w, src.h);
  try {
    const copy = await host.createWidget({ ...src, id: `tmp-${Date.now().toString(36)}`, ...spot }, tab, entry);
    widgets.value = [...widgets.value, copy];
    flash(copy.id);
  } catch (err) { fail(err); }
}

export async function removeWidget(id: string): Promise<void> {
  const w = widgets.value.find((x) => x.id === id);
  const tab = tabs.value.find((x) => x.id === w?.tab_id);
  if (!w || !tab) return;
  widgets.value = widgets.value.filter((x) => x.id !== id);
  if (drawer.value?.kind === 'config' && drawer.value.id === id) drawer.value = null;
  // Deleting is deferred so "Undo" costs nothing (server/local delete happens after the toast).
  let undone = false;
  toast(t.value('Widget entfernt', 'Widget removed'), {
    action: {
      label: t.value('Rückgängig', 'Undo'),
      run: () => { undone = true; widgets.value = [...widgets.value, w]; },
    },
  }, 5000);
  setTimeout(() => {
    if (undone) return;
    host.deleteWidget(w, tab).catch((err) => { widgets.value = [...widgets.value, w]; fail(err); });
  }, 5200);
}

export function flash(id: string): void {
  highlightId.value = id;
  setTimeout(() => { if (highlightId.value === id) highlightId.value = null; }, 1600);
}

export function focusWidget(id: string): void {
  const w = widgets.value.find((x) => x.id === id);
  if (!w) return;
  selectTab(w.tab_id);
  flash(id);
  requestAnimationFrame(() => document.querySelector(`[data-wid="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}

export function refreshAll(): void { refreshTick.value += 1; }

// ------------------------------------------------------------------ settings

export async function saveUi(patch: Partial<UiSettings>): Promise<void> {
  ui.value = { ...ui.value, ...patch };
  if (patch.theme) {
    applyTheme(patch.theme);
    try { localStorage.setItem('homy.themeChosen', '1'); } catch { /* ignore */ }
  }
  await host.saveUiSettings(ui.value).catch(fail);
}

export function moduleFor(type: string) { return getModule(type); }
