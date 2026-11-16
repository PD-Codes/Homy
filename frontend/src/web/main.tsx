import { render } from 'preact';
import { App } from '@/ui/App';
import { boot } from '@/ui/store';
import { applyTheme } from '@/ui/theme';
import { detectLocale } from '@/ui/i18n';
import '@/modules';
import '@/ui/styles.css';
import { createWebHost } from './host';
import { startGuest } from './Guest';
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
    await startGuest(root, status, locale);
    return;
  }
  const host = createWebHost(locale);
  const booting = boot(host); // sets the host synchronously before the first render
  render(<App />, root);
  await booting;
}

void start();
