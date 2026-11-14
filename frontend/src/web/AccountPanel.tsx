import { useEffect, useState } from 'preact/hooks';
import { Icon } from '@/ui/icons';
import { t, toast, user } from '@/ui/store';
import { requestJson } from './http';

interface TokenRow { id: number; name: string; prefix: string; created_at: string; last_used_at: string | null }

/** Account section in the settings drawer: logout and add-on tokens. */
export function AccountPanel() {
  const tr = t.value;
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const load = () => requestJson<TokenRow[]>('/api/v2/tokens').then(setTokens).catch(() => setTokens([]));
  useEffect(() => { void load(); }, []);

  const create = async () => {
    const name = prompt(tr('Name für den Token (z. B. „Firefox Laptop“)', 'Token name (e.g. "Firefox laptop")'), 'Browser-Add-on');
    if (!name) return;
    const res = await requestJson<{ token: string }>('/api/v2/tokens', { method: 'POST', json: { name } });
    setFresh(res.token);
    void load();
  };

  return (
    <div class="set-group">
      <h4>{tr('Konto', 'Account')}</h4>
      <div class="row">
        <span>{user.value?.display_name || user.value?.username}</span>
        <button type="button" class="hb ghost" onClick={async () => {
          await requestJson('/api/auth/logout', { method: 'POST', json: {} }).catch(() => undefined);
          location.reload();
        }}><Icon name="logout" /> {tr('Abmelden', 'Sign out')}</button>
      </div>
      <h4>{tr('Add-on-Tokens', 'Add-on tokens')}</h4>
      <p class="muted small">{tr('Für das Browser-Add-on, besonders bei SSO-Anmeldung. Der Token wird nur einmal angezeigt.', 'For the browser add-on, especially with SSO sign-in. The token is shown once.')}</p>
      {fresh && (
        <div class="row">
          <input class="mono" readOnly value={fresh} onFocus={(e) => (e.target as HTMLInputElement).select()} style={{ flex: 1 }} />
          <button type="button" class="hb" onClick={() => { void navigator.clipboard.writeText(fresh); toast(tr('Kopiert', 'Copied')); }}><Icon name="copy" /></button>
        </div>
      )}
      <ul class="tab-list">
        {tokens.map((x) => (
          <li key={x.id}>
            <span style={{ flex: 1 }}>{x.name} <small class="muted">{x.prefix}… · {x.last_used_at ? new Date(x.last_used_at).toLocaleDateString() : tr('nie benutzt', 'never used')}</small></span>
            <button type="button" class="ico danger" title={tr('Widerrufen', 'Revoke')} onClick={async () => {
              await requestJson(`/api/v2/tokens/${x.id}`, { method: 'DELETE' });
              void load();
            }}><Icon name="trash" size={13} /></button>
          </li>
        ))}
      </ul>
      <button type="button" class="hb" onClick={create}><Icon name="plus" /> {tr('Token erstellen', 'Create token')}</button>
    </div>
  );
}
