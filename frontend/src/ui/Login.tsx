import { useState } from 'preact/hooks';
import { Icon } from './icons';
import type { T } from './i18n';

export interface LoginApi {
  post<R>(path: string, body: unknown): Promise<R>;
  ssoUrl?: (provider: 'oidc' | 'saml') => string;
}

interface Policy { auth_oidc_enabled?: boolean; auth_saml_enabled?: boolean; site_title?: string; needs_setup?: boolean; registration_enabled?: boolean }

type Step = 'creds' | 'mfa' | 'setup' | 'register' | 'reset' | 'reset2';

/** Sign-in (+ MFA), first-run setup, registration and password reset. Used by the web app and the add-on. */
export function Login({ api, policy, t, onDone, extra }: {
  api: LoginApi; policy: Policy; t: T; onDone: () => void; extra?: preact.ComponentChildren;
}) {
  const [step, setStep] = useState<Step>(policy.needs_setup ? 'setup' : 'creds');
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
  };

  const signIn = async () => {
    const r = await api.post<{ mfa_required?: boolean; mfa_setup_required?: boolean }>('/api/auth/login', { username: user, password: pass });
    if (r.mfa_required) { setStep('mfa'); return; }
    onDone();
  };

  const submit = (e: Event) => {
    e.preventDefault();
    if ((step === 'setup' || step === 'register' || step === 'reset2') && pass !== pass2) { setErr(t('Passwörter stimmen nicht überein.', 'Passwords do not match.')); return; }
    void run(async () => {
      if (step === 'creds') await signIn();
      else if (step === 'mfa') { await api.post('/api/auth/mfa/verify', { code }); onDone(); }
      else if (step === 'setup') { await api.post('/api/setup/init', { username: user, password: pass }); await signIn(); }
      else if (step === 'register') { await api.post('/api/auth/register', { username: user, password: pass }); await signIn(); }
      else if (step === 'reset') {
        await api.post('/api/auth/password-reset/request', { username: user });
        setInfo(t('Falls das Konto eine E-Mail-Adresse hat, wurde ein 6-stelliger Code gesendet.', 'If the account has an e-mail address, a 6-digit code was sent.'));
        setStep('reset2');
      } else if (step === 'reset2') {
        await api.post('/api/auth/password-reset/confirm', { username: user, code, password: pass });
        setInfo(t('Passwort geändert. Bitte anmelden.', 'Password changed. Please sign in.'));
        setPass(''); setPass2(''); setStep('creds');
      }
    });
  };

  const title = step === 'setup' ? t('Homy einrichten', 'Set up Homy') : step === 'register' ? t('Konto erstellen', 'Create account')
    : step === 'reset' || step === 'reset2' ? t('Passwort zurücksetzen', 'Reset password') : policy.site_title || 'Homy';
  const btn = step === 'setup' ? t('Admin-Konto anlegen', 'Create admin account') : step === 'register' ? t('Registrieren', 'Register')
    : step === 'reset' ? t('Code anfordern', 'Request code') : step === 'reset2' ? t('Passwort setzen', 'Set password') : t('Anmelden', 'Sign in');

  return (
    <div class="login">
      <form class="login-card" onSubmit={submit}>
        <h1>{title}</h1>
        {step === 'setup' && <p class="muted small">{t('Erster Start: lege das Administrator-Konto an.', 'First start: create the administrator account.')}</p>}
        {info && <div class="small ok-c">{info}</div>}
        {step !== 'mfa' && (
          <input autoFocus autoComplete="username" placeholder={t('Benutzername', 'Username')} value={user} onInput={(e) => setUser((e.target as HTMLInputElement).value)} />
        )}
        {(step === 'creds' || step === 'setup' || step === 'register' || step === 'reset2') && (
          <input type="password" autoComplete={step === 'creds' ? 'current-password' : 'new-password'} placeholder={step === 'reset2' ? t('Neues Passwort', 'New password') : t('Passwort', 'Password')} value={pass} onInput={(e) => setPass((e.target as HTMLInputElement).value)} />
        )}
        {(step === 'setup' || step === 'register' || step === 'reset2') && (
          <input type="password" autoComplete="new-password" placeholder={t('Passwort wiederholen', 'Repeat password')} value={pass2} onInput={(e) => setPass2((e.target as HTMLInputElement).value)} />
        )}
        {(step === 'mfa' || step === 'reset2') && (
          <input autoFocus={step === 'mfa'} inputMode="numeric" autoComplete="one-time-code" placeholder={t('6-stelliger Code', '6-digit code')} value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
        )}
        {err && <div class="login-err">{err}</div>}
        <button type="submit" class="hb primary" disabled={busy}>{busy ? <span class="spin" /> : <Icon name="login" />} {btn}</button>
        {step === 'creds' && api.ssoUrl && (policy.auth_oidc_enabled || policy.auth_saml_enabled) && (
          <div class="login-sso">
            {policy.auth_oidc_enabled && <a class="hb ghost" href={api.ssoUrl('oidc')}>SSO (OIDC)</a>}
            {policy.auth_saml_enabled && <a class="hb ghost" href={api.ssoUrl('saml')}>SSO (SAML)</a>}
          </div>
        )}
        {step === 'creds' && (
          <div class="login-links">
            <button type="button" class="linkish" onClick={() => { setStep('reset'); setErr(null); }}>{t('Passwort vergessen?', 'Forgot password?')}</button>
            {policy.registration_enabled && <button type="button" class="linkish" onClick={() => { setStep('register'); setErr(null); }}>{t('Konto erstellen', 'Create account')}</button>}
          </div>
        )}
        {(step === 'register' || step === 'reset' || step === 'reset2' || step === 'mfa') && (
          <button type="button" class="linkish" onClick={() => { setStep('creds'); setErr(null); }}>{t('Zurück zur Anmeldung', 'Back to sign-in')}</button>
        )}
        {extra}
      </form>
    </div>
  );
}
