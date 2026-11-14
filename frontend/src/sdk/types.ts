import type { FunctionComponent } from 'preact';

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'password' | 'url' | 'color'
  | 'select' | 'toggle' | 'integration';

export interface FieldOption { value: string | number; label: string }

export interface SchemaField {
  key: string;
  type: FieldType | string;
  label: string;
  default?: unknown;
  options?: FieldOption[];
  /** toggle fields: the stored values (legacy widgets use "Ja"/"Nein"). */
  on?: unknown;
  off?: unknown;
  help?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  rows?: number;
}

export type Availability = 'web' | 'extension';
export type Category = 'essentials' | 'productivity' | 'info' | 'media' | 'system' | 'integration';

/** One addable widget type, from the native registry or the server catalog. */
export interface CatalogEntry {
  type: string;
  name: string;
  icon: string;
  description?: string;
  category: Category;
  source: 'native' | 'module' | 'integration';
  module?: string | null;
  integration_types?: string[];
  size: { w: number; h: number };
  refresh?: number;
  schema: SchemaField[];
  assets?: { js?: string; css?: string };
  /** Where the type can be added. Server types need a Homy connection. */
  needsServer?: boolean;
  only?: Availability;
}

export type TabSource = 'local' | 'server';

export interface Tab {
  id: string;
  name: string;
  icon?: string;
  source: TabSource;
}

export interface WidgetInstance {
  id: string;
  type: string;
  title?: string | null;
  col: number;
  row: number;
  w: number;
  h: number;
  tab_id: string;
  config: Record<string, unknown>;
  module?: string | null;
  owner?: 'user' | 'public';
}

export interface Favorite {
  id: number | string;
  title: string;
  url: string;
  category?: string | null;
  icon_type?: string;
  icon_value?: string | null;
  order?: number;
}

export interface ServerConnection {
  baseUrl: string;
  /** JSON request against the Homy API. Throws ApiError on HTTP errors. */
  fetchJson<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T>;
  /** URL for an embeddable single-widget page (add-on iframes). */
  embedUrl?(widgetId: string): string;
}

export interface KeyValueStore {
  get<T>(key: string, fallback: T): Promise<T>;
  set(key: string, value: unknown): Promise<void>;
}

export interface WidgetContext {
  instance: WidgetInstance;
  /** Source of the tab the widget lives on (local add-on storage or Homy server). */
  tabSource: TabSource;
  locale: string;
  t: (de: string, en: string) => string;
  server: ServerConnection | null;
  kv: KeyValueStore;
  /** Persist a config change (inline editing inside the widget). */
  setConfig: (patch: Record<string, unknown>) => void;
  openUrl: (url: string, newTab?: boolean) => void;
  editing: boolean;
  /** Increments on manual/automatic refresh. */
  refreshTick: number;
  host: HostCapabilities;
}

export interface HostCapabilities {
  kind: 'web' | 'extension';
  bookmarks?: () => Promise<Favorite[]>;
  topSites?: () => Promise<Favorite[]>;
  favorites?: () => Promise<Favorite[]>;
  saveFavorite?: (fav: Partial<Favorite>) => Promise<Favorite>;
  deleteFavorite?: (id: Favorite['id']) => Promise<void>;
  /** Icon URL for a page (sync URL or async, e.g. blob URL fetched with a token). */
  favicon?: (pageUrl: string) => string | Promise<string>;
  /** Resolve an icon stored on the server (asset id) to a usable URL. */
  assetUrl?: (assetId: string) => string | Promise<string>;
}

export interface WidgetProps {
  config: Record<string, unknown>;
  ctx: WidgetContext;
  size: { w: number; h: number };
}

export interface ModuleDef {
  type: string;
  name: { de: string; en: string };
  description: { de: string; en: string };
  icon: string;
  category: Category;
  size: { w: number; h: number };
  schema: SchemaField[];
  only?: Availability;
  needsServer?: boolean;
  /** Seconds between automatic refreshes (0 = never). */
  refresh?: number;
  /** Widget draws its own header (title is hidden). */
  chromeless?: boolean;
  component: FunctionComponent<WidgetProps>;
}
