import { render } from 'preact';
import { App } from '@/ui/App';
import { Login } from '@/ui/Login';
import { boot } from '@/ui/store';
import { applyTheme } from '@/ui/theme';
import { detectLocale, makeT } from '@/ui/i18n';
import '@/modules';
import '@/ui/styles.css';
import { createWebHost } from './host';
import { requestJson } from './http';

interface Status { logged_in: boolean; needs_setup: boolean; default_locale?: string; site_title?: string; auth_oidc_enabled?: boolean; auth_saml_enabled?: boolean }

async function start() {
  const root = document.getElementById('app')!;
  let status: Status;
  try {
    status = await requestJson<Status>('/api/auth/status');
  } catch (err) {
    root.textContent = `Homy: ${(err as Error).message}`;
    return;
  }
  const locale = detectLocale(localStorage.getItem('locale') || status.default_locale);
  if (status.site_title) document.title = status.site_title;
  if (!status.logged_in) {
    try { applyTheme(JSON.parse(localStorage.getItem('homy.ui.web') || '{}').theme || 'dark'); } catch { applyTheme('dark'); }
    render(
      <Login t={makeT(locale)} policy={status} onDone={() => location.reload()}
        api={{ post: (path, body) => requestJson(path, { method: 'POST', json: body }), ssoUrl: (p) => `/api/auth/${p}/login` }} />,
      root,
    );
    return;
  }
  const host = createWebHost(locale);
  render(<App />, root);
  await boot(host);
}

void start();
