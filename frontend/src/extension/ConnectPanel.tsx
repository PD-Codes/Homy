import { useEffect, useState } from 'preact/hooks';
import { Icon } from '@/ui/icons';
import { makeT } from '@/ui/i18n';
import { Login } from '@/ui/Login';
import { requestJson } from '@/web/http';
import { makeServer, normalizeBase } from './host';
import { store } from './storage';
import type { Connection } from './storage';

/** "Homy connection" section of the add-on settings. */
export function ConnectPanel({ locale, onChanged }: { locale: string; onChanged: () => void }) {
  const t = makeT(locale);
  const [conn, setConn] = useState<Connection | null>(null);
  const [url, setUrl] = useState('');
  const [step, setStep] = useState<'url' | 'login' | 'token'>('url');
  const [policy, setPolicy] = useState<Record<string, unknown>>({});
  const [token, setToken] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void store.connection().then(setConn);
    void store.legacyServerUrl().then((u) => setUrl((cur) => cur || u));
  }, []);

  const base = normalizeBase(url);
  const browserName = /Firefox\//.test(navigator.userAgent) ? 'Firefox' : /OPR\//.test(navigator.userAgent) ? 'Opera' : /Edg\//.test(navigator.userAgent) ? 'Edge' : 'Chrome';

  const finish = async (c: Connection) => {
    // Verify before saving.
    const me = await makeServer(c).fetchJson<{ user: { username: string } | null }>('/api/auth/status');
    const saved = { ...c, username: me.user?.username || c.username, connectedAt: new Date().toISOString() };
    await store.saveConnection(saved);
    setConn(saved);
    setStep('url');
    onChanged();
  };

  const probe = async (e: Event) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const status = await requestJson<Record<string, unknown>>(`${base}/api/auth/status`, { credentials: 'include' });
      setPolicy(status);
      if (status.logged_in) {
        // Already signed in to Homy in this browser (e.g. via SSO): mint a token right away.
        const r = await requestJson<{ token: string }>(`${base}/api/v2/tokens`, { method: 'POST', credentials: 'include', json: { name: `Homy-Add-on (${browserName})` } });
        await finish({ serverUrl: base, token: r.token });
      } else {
        setStep('login');
      }
    } catch (ex) {
      setErr(`${(ex as Error).message} – ${t('Server-URL prüfen (inkl. Unterpfad).', 'Check the server URL (incl. sub-path).')}`);
    } finally { setBusy(false); }
  };

  if (conn) {
    return (
      <div class="set-group">
        <h4>{t('Homy-Verbindung', 'Homy connection')}</h4>
        <p><Icon name="cloud" size={13} /> {conn.serverUrl}{conn.username ? ` · ${conn.username}` : ''}</p>
        <div class="row">
          <a class="hb ghost" href={conn.serverUrl} target="_blank" rel="noopener"><Icon name="external-link" /> {t('Homy öffnen', 'Open Homy')}</a>
          <button type="button" class="hb ghost danger" onClick={async () => {
            try {
              const s = makeServer(conn);
              const list = await s.fetchJson<{ id: number; prefix: string }[]>('/api/v2/tokens');
              const mine = list.find((x) => conn.token.startsWith(x.prefix));
              if (mine) await s.fetchJson(`/api/v2/tokens/${mine.id}`, { method: 'DELETE' });
            } catch { /* server unreachable: still disconnect locally */ }
            await store.saveConnection(null);
            await store.saveCache(null);
            setConn(null);
            onChanged();
          }}><Icon name="logout" /> {t('Trennen', 'Disconnect')}</button>
        </div>
        <p class="muted small">{t('Homy-Tabs erscheinen mit Wolken-Symbol neben deinen lokalen Tabs und bleiben offline als Kopie verfügbar.', 'Homy tabs appear with a cloud icon next to your local tabs and stay available offline as a copy.')}</p>
      </div>
    );
  }

  return (
    <div class="set-group">
      <h4>{t('Homy-Verbindung', 'Homy connection')}</h4>
      <p class="muted small">{t('Optional: holt Homy-Tabs, Favoriten und Integrations-Widgets dazu. Ohne Server funktioniert die Startseite trotzdem.', 'Optional: adds Homy tabs, favorites and integration widgets. The start page works without a server too.')}</p>
      {step === 'url' && (
        <form class="row" onSubmit={probe}>
          <input class="grow" placeholder="https://homy.example.lan" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
          <button type="submit" class="hb primary" disabled={!base || busy}>{busy ? <span class="spin" /> : t('Weiter', 'Next')}</button>
        </form>
      )}
      {step === 'login' && (
        <div class="embed-login">
          <Login t={t} policy={policy} onDone={async () => {
            try {
              const r = await requestJson<{ token: string }>(`${base}/api/v2/tokens`, { method: 'POST', credentials: 'include', json: { name: `Homy-Add-on (${browserName})` } });
              await finish({ serverUrl: base, token: r.token });
            } catch (ex) { setErr((ex as Error).message); }
          }} api={{
            post: (path, body) => requestJson(`${base}${path}`, { method: 'POST', credentials: 'include', json: body }),
            ssoUrl: (p) => `${base}/api/auth/${p}/login`,
          }} extra={<button type="button" class="hb ghost" onClick={() => setStep('token')}>{t('Stattdessen Token einfügen', 'Paste a token instead')}</button>} />
        </div>
      )}
      {step === 'token' && (
        <form class="row" onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          try { await finish({ serverUrl: base, token: token.trim() }); } catch (ex) { setErr((ex as Error).message); }
        }}>
          <input class="grow mono" placeholder="homy_pat_…" value={token} onInput={(e) => setToken((e.target as HTMLInputElement).value)} />
          <button type="submit" class="hb primary">{t('Verbinden', 'Connect')}</button>
        </form>
      )}
      {step === 'token' && <p class="muted small">{t('Token in Homy unter ⚙ Einstellungen → Konto → „Token erstellen“.', 'Create one in Homy under ⚙ Settings → Account → "Create token".')}</p>}
      {err && <div class="err small">{err}</div>}
      {step !== 'url' && <button type="button" class="hb ghost sm" onClick={() => setStep('url')}>{t('Zurück', 'Back')}</button>}
    </div>
  );
}
