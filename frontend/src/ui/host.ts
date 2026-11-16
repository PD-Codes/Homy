import type { FunctionComponent } from 'preact';
import type {
  Background, CatalogEntry, Favorite, HostCapabilities, KeyValueStore, ServerConnection, Tab, WidgetInstance,
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
  /** Legacy: plain wallpaper URL (pre-0.2.1). */
  background?: string;
  wallpaper?: Background;
  /** Render all tabs in the background so switching is instant. */
  preloadTabs?: boolean;
  /** Use the mobile layout automatically on narrow screens (web). */
  autoMobile?: boolean;
  customTheme?: Record<string, string>;
}

export type LayoutKey = 'desktop' | 'mobile' | 'public';

export interface PageDef {
  id: string;
  label: { de: string; en: string };
  icon: string;
  adminOnly?: boolean;
  component: FunctionComponent<{ sub: string }>;
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
  load(layout?: LayoutKey): Promise<BoardData>;
  /** Called (debounced) after tabs or positions changed. */
  persistLayout(tabs: Tab[], widgets: WidgetInstance[], layout?: LayoutKey): Promise<void>;
  createWidget(widget: WidgetInstance, tab: Tab, entry: CatalogEntry, layout?: LayoutKey): Promise<WidgetInstance>;
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
  /** Management pages (web app). */
  pages?: () => PageDef[];
  /** Layouts the user can switch between (web app). */
  layouts?: () => LayoutKey[];
  /** Resolve a background to a CSS url (assets may need auth → blob URL). */
  backgroundUrl?: (bg: Background) => string | Promise<string>;
  /** Upload an image for backgrounds; returns a Background (asset or data URL). */
  uploadBackground?: (file: File) => Promise<Background>;
  /** Pick from previously uploaded backgrounds. */
  listBackgrounds?: () => Promise<{ id: number | string; name: string; url: string }[]>;
  /** Classic widgets with their own config editor (renderConfig/readConfig). Resolves null if none. */
  customConfig?: (el: HTMLElement, widget: WidgetInstance, entry: CatalogEntry | undefined) => Promise<{ read: () => Record<string, unknown> } | null>;
  /** Shown as a sign-in button in the top bar (guest mode). */
  loginAction?: () => void;
  /** Duplicate a tab server-side (copies widgets). */
  duplicateTab?: (tab: Tab, name: string, layout: LayoutKey) => Promise<void>;
}
