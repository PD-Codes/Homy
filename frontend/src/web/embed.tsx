/**
 * Single-widget page for the browser add-on's iframes: /embed/widget/<id>#token=…&theme=…&locale=…
 * The token stays in the URL fragment (never sent to the server or logged) and is attached
 * as a Bearer header to every same-origin API request, including classic widget code.
 */
import { render } from 'preact';
import type { CatalogEntry, WidgetInstance } from '@/sdk';
import { getModule } from '@/sdk';
import { applyTheme } from '@/ui/theme';
import { makeT } from '@/ui/i18n';
import '@/modules';
import '@/ui/styles.css';
import { requestJson } from './http';
import { renderLegacy } from './legacy';

const params = new URLSearchParams(location.hash.slice(1));
const token = params.get('token') || '';
const locale = params.get('locale') || 'de-DE';
applyTheme(params.get('theme') || 'dark');
history.replaceState(null, '', location.pathname); // drop the token from the address

const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, location.href);
  if (token && url.origin === location.origin) {
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set('Authorization', `Bearer ${token}`);
    return nativeFetch(input, { ...init, headers, credentials: 'omit' });
  }
  return nativeFetch(input, init);
};

async function main() {
  const root = document.getElementById('app')!;
  const id = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  const t = makeT(locale);
  try {
    const { widget, entry } = await requestJson<{ widget: WidgetInstance & { w: number; h: number }; entry: CatalogEntry | null }>(`/api/v2/widgets/${encodeURIComponent(id)}`);
    const mod = getModule(widget.type);
    if (mod) {
      const Cmp = mod.component;
      render(<div class="embed-native"><Cmp config={widget.config} size={{ w: widget.w, h: widget.h }} ctx={{
        instance: widget, tabSource: 'server', locale, t, server: null, editing: false, refreshTick: 0,
        kv: { get: async (_k, f) => f, set: async () => undefined },
        setConfig: () => undefined, openUrl: (u) => window.open(u, '_top'), host: { kind: 'web' },
      }} /></div>, root);
      return;
    }
    root.className = 'embed-legacy';
    renderLegacy(root, widget, entry || undefined, locale);
    // Ask the add-on to refresh by reloading the frame; nothing else to do here.
  } catch (err) {
    const status = (err as { status?: number }).status;
    root.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'w-state w-error';
    box.textContent = status === 401 ? t('Token ungültig – im Add-on neu verbinden.', 'Token invalid – reconnect the add-on.') : (err as Error).message;
    root.appendChild(box);
  }
}

void main();
