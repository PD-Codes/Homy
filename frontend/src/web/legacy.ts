/**
 * Runs classic Homy widget renderers (window.WidgetRegistry plugins) inside the new UI.
 * Classic helpers are loaded once from the server; each widget type loads its own JS/CSS.
 */
import type { CatalogEntry, WidgetInstance } from '@/sdk';

/* eslint-disable @typescript-eslint/no-explicit-any */
type LegacyDef = { render: (el: HTMLElement, data: any, config: any) => unknown; onRemove?: (id: string) => void };
const w = window as any;

const CLASSIC_SCRIPTS = [
  '/static/vendor/lucide-0.469.0.min.js',
  '/static/js/translations.js',
  '/static/js/api_cache.js',
  '/static/js/api.js',
  '/static/js/perf.js',
  '/static/js/widget_data_source.js',
  '/static/js/chart_widgets.js',
  '/static/js/integration_widget_helpers.js',
  '/static/js/discord_widget.js',
];
const CLASSIC_STYLES = ['/static/css/components.css', '/static/css/dashboard.css'];

const loaded = new Map<string, Promise<void>>();
const instances = new Map<string, { el: HTMLElement; data: any; def: LegacyDef }>();

function addScript(src: string): Promise<void> {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = () => resolve();
      s.onerror = () => { console.warn('[homy] could not load', src); resolve(); };
      document.head.appendChild(s);
    }));
  }
  return loaded.get(src)!;
}

function addStyle(href: string): void {
  if (loaded.has(href)) return;
  loaded.set(href, Promise.resolve());
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

function installShims(locale: string): void {
  if (w.__homyLegacyShims) return;
  w.__homyLegacyShims = true;
  try { localStorage.setItem('locale', locale); } catch { /* ignore */ }
  w.WidgetRegistry = {
    _registry: {} as Record<string, LegacyDef>,
    register(type: string, def: LegacyDef) { this._registry[type] = def; },
    get(type: string) { return this._registry[type]; },
  };
  w.escapeHtml = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  w.formatNumber = (v: unknown, opts: Intl.NumberFormatOptions = {}) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString(locale, opts) : String(v ?? '–');
  };
  const rerender = (id: string) => {
    const inst = instances.get(id);
    if (inst) void run(inst.el, inst.data, inst.def);
  };
  w.DashboardController = {
    currentLayout: 'desktop',
    refreshWidget: (id: string) => rerender(id),
    refreshWidgetsByType: async (type: string) => { for (const [id, i] of instances) if (i.data.type === type) rerender(id); },
    renderWidgetBody: () => undefined,
  };
  w.getActiveDashboardController = () => w.DashboardController;
}

let runtime: Promise<void> | null = null;
function ensureRuntime(locale: string): Promise<void> {
  runtime ??= (async () => {
    installShims(locale);
    CLASSIC_STYLES.forEach(addStyle);
    for (const src of CLASSIC_SCRIPTS) await addScript(src);
    const i18n = w.i18n;
    if (i18n) {
      try {
        await i18n.loadCoreAppTranslations();
        i18n.setLocale?.(locale);
        const plugins = await fetch('/api/integration-plugins', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : { integrations: [] }));
        await Promise.all([
          i18n.loadAllModuleTranslations().catch(() => undefined),
          i18n.loadAllIntegrationTranslations(plugins.integrations || []).catch(() => undefined),
        ]);
      } catch (err) { console.warn('[homy] legacy translations', err); }
    }
  })();
  return runtime;
}

async function run(el: HTMLElement, data: any, def: LegacyDef): Promise<void> {
  try {
    await def.render(el, data, data.config || {});
    w.refreshLucideIcons?.(el);
  } catch (err) {
    el.innerHTML = `<div class="w-state w-error">${w.escapeHtml((err as Error)?.message || String(err))}</div>`;
  }
}

export function renderLegacy(host: HTMLElement, widget: WidgetInstance, entry: CatalogEntry | undefined, locale: string): () => void {
  let disposed = false;
  host.innerHTML = '<div class="w-state"><span class="spin"></span></div>';
  const data = {
    id: widget.id, type: widget.type, module: widget.module, title: widget.title, col: widget.col, row: widget.row,
    size_x: widget.w, size_y: widget.h, tab_id: widget.tab_id, config: widget.config, dashboard_layout: 'desktop',
  };
  void (async () => {
    await ensureRuntime(locale);
    if (entry?.assets?.css) addStyle(entry.assets.css);
    if (entry?.assets?.js) await addScript(entry.assets.js);
    if (disposed) return;
    const def: LegacyDef | undefined = w.WidgetRegistry.get(widget.type);
    if (!def) {
      host.innerHTML = `<div class="w-state">Renderer für „${w.escapeHtml(widget.type)}“ fehlt.</div>`;
      return;
    }
    const el = document.createElement('div');
    el.className = 'legacy-body widget-body';
    host.replaceChildren(el);
    instances.set(widget.id, { el, data, def });
    await run(el, data, def);
  })();
  return () => {
    disposed = true;
    const inst = instances.get(widget.id);
    instances.delete(widget.id);
    try { inst?.def.onRemove?.(widget.id); } catch { /* ignore */ }
  };
}
