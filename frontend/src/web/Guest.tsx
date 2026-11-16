/** What visitors see before signing in: the public layout (if enabled) or a start page with clock, search and login. */
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Favorite, Tab, WidgetInstance } from '@/sdk';
import { App } from '@/ui/App';
import { Icon } from '@/ui/icons';
import { Dialog } from '@/ui/kit';
import { Login } from '@/ui/Login';
import type { Host } from '@/ui/host';
import { boot } from '@/ui/store';
import { makeT } from '@/ui/i18n';
import type { T } from '@/ui/i18n';
import { searchUrl } from '@/ui/search';
import { requestJson } from './http';

interface Status { needs_setup: boolean; site_title?: string; auth_oidc_enabled?: boolean; auth_saml_enabled?: boolean }
interface PublicBoard { enabled: boolean; site_title?: string; tabs?: { id: string; name: string }[]; widgets?: WidgetInstance[]; favorites?: Favorite[] }

const loginApi = { post: <R,>(path: string, body: unknown) => requestJson<R>(path, { method: 'POST', json: body }), ssoUrl: (p: 'oidc' | 'saml') => `/api/auth/${p}/login` };

function LoginDialog({ t, status, onClose }: { t: T; status: Status; onClose: () => void }) {
  return (
    <Dialog title={t('Anmelden', 'Sign in')} onClose={onClose}>
      <div class="embed-login"><Login t={t} policy={status} api={loginApi} onDone={() => location.reload()} /></div>
    </Dialog>
  );
}

function Landing({ status, t, locale }: { status: Status; t: T; locale: string }) {
  const [now, setNow] = useState(new Date());
  const [q, setQ] = useState('');
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 10_000); return () => clearInterval(id); }, []);
  return (
    <div class="landing">
      <div class="landing-top"><span class="brand">{status.site_title || 'Homy'}</span></div>
      <div class="landing-main">
        <div class="landing-clock">{now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</div>
        <div class="landing-date">{now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <form class="m-search landing-search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) location.href = /^https?:\/\//.test(q) ? q : searchUrl(q.trim()); }}>
          <div class="m-search-box"><Icon name="search" size={17} />
            <input value={q} autoFocus placeholder={t('Im Web suchen …', 'Search the web …')} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          </div>
        </form>
        <div class="embed-login landing-login"><Login t={t} policy={status} api={loginApi} onDone={() => location.reload()} /></div>
      </div>
    </div>
  );
}

export async function startGuest(root: HTMLElement, status: Status, locale: string): Promise<void> {
  const t = makeT(locale);
  let board: PublicBoard = { enabled: false };
  try { board = await requestJson<PublicBoard>('/api/v2/public'); } catch { /* old server: landing page */ }
  if (!board.enabled || status.needs_setup) {
    render(<Landing status={status} t={t} locale={locale} />, root);
    return;
  }
  let showLogin: (v: boolean) => void = () => undefined;
  function Shell() {
    const [open, setOpen] = useState(false);
    showLogin = setOpen;
    return <>{<App />}{open && <LoginDialog t={t} status={status} onClose={() => setOpen(false)} />}</>;
  }
  const host: Host = {
    kind: 'web',
    locale,
    caps: { kind: 'web', favorites: async () => board.favorites || [], favicon: () => '' },
    kv: { get: async (_k, f) => f, set: async () => undefined },
    server: () => null,
    load: async () => ({
      tabs: (board.tabs || []).map((x): Tab => ({ ...x, source: 'server' })),
      widgets: board.widgets || [],
      catalog: [],
      favorites: board.favorites || [],
      locked: true,
    }),
    persistLayout: async () => undefined,
    createWidget: async () => { throw new Error('read-only'); },
    updateWidget: async () => undefined,
    deleteWidget: async () => undefined,
    tabSources: () => [],
    renderForeign: () => undefined,
    loadUiSettings: async () => { try { return JSON.parse(localStorage.getItem('homy.ui.web') || '{}'); } catch { return {}; } },
    saveUiSettings: async (s) => localStorage.setItem('homy.ui.web', JSON.stringify(s)),
    loginAction: () => showLogin(true),
  };
  const booting = boot(host);
  render(<Shell />, root);
  await booting;
}
