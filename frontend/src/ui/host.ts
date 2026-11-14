import type { FunctionComponent } from 'preact';
import type {
  CatalogEntry, Favorite, HostCapabilities, KeyValueStore, ServerConnection, Tab, WidgetInstance,
} from '@/sdk';

export interface BoardData {
  tabs: Tab[];
  widgets: WidgetInstance[];
  /** Server catalog (empty when not connected). Native modules are added by the store. */
  catalog: CatalogEntry[];
  favorites?: Favorite[];
  locked?: boolean;
  user?: { username: string; display_name?: string; role?: string } | null;
  preferences?: Record<string, unknown>;
  /** Shown as a quiet hint, e.g. "offline – Stand 10:42". */
  notice?: string | null;
}

export interface UiSettings {
  theme: string;
  fitToScreen: boolean;
  density: 'compact' | 'cozy';
  background?: string;
}

/**
 * Everything the shared UI needs from its environment. The web app talks to the
 * Homy server; the add-on keeps local tabs in browser storage and mirrors server tabs.
 */
export interface Host {
  kind: 'web' | 'extension';
  locale: string;
  caps: HostCapabilities;
  kv: KeyValueStore;
  server(): ServerConnection | null;
  load(): Promise<BoardData>;
  /** Called (debounced) after tabs or positions changed. */
  persistLayout(tabs: Tab[], widgets: WidgetInstance[]): Promise<void>;
  createWidget(widget: WidgetInstance, tab: Tab, entry: CatalogEntry): Promise<WidgetInstance>;
  updateWidget(widget: WidgetInstance, tab: Tab): Promise<WidgetInstance | void>;
  deleteWidget(widget: WidgetInstance, tab: Tab): Promise<void>;
  /** Which tab sources a new tab can be created in. */
  tabSources(): Tab['source'][];
  /** Render a widget type that has no native module (legacy JS or iframe). */
  renderForeign(el: HTMLElement, widget: WidgetInstance, entry: CatalogEntry | undefined, tick: number): (() => void) | void;
  loadUiSettings(): Promise<Partial<UiSettings>>;
  saveUiSettings(s: UiSettings): Promise<void>;
  /** Extra entries in the settings dialog (connection, admin links …). */
  SettingsExtra?: FunctionComponent<{ onChanged: () => void }>;
  menuLinks?: () => { label: string; href: string; icon: string }[];
}
