import { useState } from 'preact/hooks';
import { Icon } from './icons';
import type { T } from './i18n';

export interface LoginApi {
  post<R>(path: string, body: unknown): Promise<R>;
  ssoUrl?: (provider: 'oidc' | 'saml') => string;
}

interface Policy { auth_oidc_enabled?: boolean; auth_saml_enabled?: boolean; site_title?: string; needs_setup?: boolean }

/** Username/password (+ MFA) sign-in against Homy. Used by the web app and the add-on. */
export function Login({ api, policy, t, onDone, extra }: {
  api: LoginApi; policy: Policy; t: T; onDone: () => void; extra?: preact.ComponentChildren;
}) {
  const [step, setStep] = useState<'creds' | 'mfa'>('creds');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (step === 'creds') {
        const r = await api.post<{ mfa_required?: boolean; mfa_setup_required?: boolean }>('/api/auth/login', { username: user, password: pass });
        if (r.mfa_required) { setStep('mfa'); return; }
        if (r.mfa_setup_required) { setErr(t('MFA muss zuerst in der klassischen Oberfläche eingerichtet werden.', 'MFA must be set up in the classic interface first.')); return; }
      } else {
        await api.post('/api/auth/mfa/verify', { code });
      }
      onDone();
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="login">
      <form class="login-card" onSubmit={submit}>
        <h1>{policy.site_title || 'Homy'}</h1>
        {policy.needs_setup ? (
          <p>{t('Homy ist noch nicht eingerichtet.', 'Homy is not set up yet.')} <a href="/classic">{t('Einrichtung starten', 'Start setup')}</a></p>
        ) : step === 'creds' ? (
          <>
            <input autoFocus autoComplete="username" placeholder={t('Benutzername', 'Username')} value={user} onInput={(e) => setUser((e.target as HTMLInputElement).value)} />
            <input type="password" autoComplete="current-password" placeholder={t('Passwort', 'Password')} value={pass} onInput={(e) => setPass((e.target as HTMLInputElement).value)} />
          </>
        ) : (
          <input autoFocus inputMode="numeric" autoComplete="one-time-code" placeholder={t('6-stelliger Code', '6-digit code')} value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
        )}
        {err && <div class="login-err">{err}</div>}
        {!policy.needs_setup && (
          <button type="submit" class="hb primary" disabled={busy}>{busy ? <span class="spin" /> : <Icon name="login" />} {t('Anmelden', 'Sign in')}</button>
        )}
        {api.ssoUrl && (policy.auth_oidc_enabled || policy.auth_saml_enabled) && step === 'creds' && (
          <div class="login-sso">
            {policy.auth_oidc_enabled && <a class="hb ghost" href={api.ssoUrl('oidc')}>SSO (OIDC)</a>}
            {policy.auth_saml_enabled && <a class="hb ghost" href={api.ssoUrl('saml')}>SSO (SAML)</a>}
          </div>
        )}
        {extra}
      </form>
    </div>
  );
}
