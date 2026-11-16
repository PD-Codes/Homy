import { useEffect, useMemo, useState } from 'preact/hooks';
import { Icon } from '@/ui/icons';
import {
  Badge, Card, Choice, Dialog, Field, Grid2, Loading, Page, Pager, SaveBar, Text, Toggle, act, fmtBytes, fmtDate, pickFile,
  useAsync, usePaged,
} from '@/ui/kit';
import { getHost, t, user } from '@/ui/store';
import { THEMES } from '@/ui/theme';
import { api } from './api';
import { Media, SubNav } from './settings';

const SUBS = [
  { id: '', de: 'Übersicht', en: 'Overview', icon: 'activity' },
  { id: 'system', de: 'System', en: 'System', icon: 'monitor' },
  { id: 'users', de: 'Benutzer', en: 'Users', icon: 'users' },
  { id: 'auth', de: 'Anmeldung', en: 'Sign-in', icon: 'key' },
  { id: 'mail', de: 'Mail & API', en: 'Mail & API', icon: 'mail' },
  { id: 'security', de: 'Sicherheit', en: 'Security', icon: 'lock' },
  { id: 'audit', de: 'Protokoll', en: 'Activity log', icon: 'scroll-text' },
  { id: 'services', de: 'Dienste', en: 'Services', icon: 'cpu' },
  { id: 'extensions', de: 'Erweiterungen', en: 'Extensions', icon: 'puzzle' },
  { id: 'media', de: 'Medien', en: 'Media', icon: 'image' },
  { id: 'backup', de: 'Backup', en: 'Backup', icon: 'archive' },
];

export function AdminPage({ sub }: { sub: string }) {
  const tr = t.value;
  if (user.value?.role !== 'admin') return <Page title={tr('Verwaltung', 'Administration')}><p>{tr('Nur für Administratoren.', 'Administrators only.')}</p></Page>;
  const cur = SUBS.find((s) => s.id === sub) ? sub : '';
  return (
    <Page title={tr('Verwaltung', 'Administration')} icon="shield-check" sub={<SubNav page="admin" subs={SUBS} current={cur} />}>
      {cur === '' && <Overview />}
      {cur === 'system' && <SystemSettings />}
      {cur === 'users' && <Users />}
      {cur === 'auth' && <AuthSettings />}
      {cur === 'mail' && <MailApi />}
      {cur === 'security' && <Security />}
      {cur === 'audit' && <Audit />}
      {cur === 'services' && <Services />}
      {cur === 'extensions' && <Extensions />}
      {cur === 'media' && <Media scope="all" />}
      {cur === 'backup' && <BackupAdmin />}
    </Page>
  );
}

// ------------------------------------------------------------------ settings form (POST /api/admin/config)

type FieldDef = { key: string; label: string; type?: 'text' | 'number' | 'toggle' | 'select' | 'textarea' | 'password' | 'json'; options?: { value: string; label: string }[]; help?: string; wide?: boolean };

function useAdminConfig() {
  return useAsync(() => api.get<{ settings: Record<string, string> }>('/api/admin/config').then((r) => r.settings), []);
}

function SettingsForm({ title, icon, fields, extra, span = 3 }: { title: string; icon: string; fields: FieldDef[]; extra?: preact.ComponentChildren; span?: 1 | 3 }) {
  const tr = t.value;
  const cfg = useAdminConfig();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [jsonErr, setJsonErr] = useState<Record<string, string>>({});
  if (!cfg.data) return <Card title={title} icon={icon}><Loading error={cfg.error} retry={cfg.reload} /></Card>;
  const val = (k: string) => (k in draft ? draft[k] : cfg.data![k] ?? '');
  const set = (k: string, v: string) => {
    setDraft({ ...draft, [k]: v });
    const f = fields.find((x) => x.key === k);
    if (f?.type === 'json') {
      try { if (v.trim()) JSON.parse(v); setJsonErr((e) => { const n = { ...e }; delete n[k]; return n; }); } catch (e) { setJsonErr((x) => ({ ...x, [k]: (e as Error).message })); }
    }
  };
  const dirty = Object.keys(draft).length > 0;
  const save = async () => {
    if (Object.keys(jsonErr).length) return;
    setBusy(true);
    const ok = await act(() => api.post('/api/admin/config', draft), tr('Gespeichert', 'Saved'));
    setBusy(false);
    if (ok !== undefined) { setDraft({}); void cfg.reload(); }
  };
  return (
    <Card title={title} icon={icon} span={span === 3 ? 3 : undefined}>
      <div class="form-grid">
        {fields.map((f) => {
          const v = val(f.key);
          if (f.type === 'toggle') {
            return <div key={f.key} class={f.wide ? 'cf-field wide' : 'cf-field'}><Toggle checked={String(v) === 'true'} onChange={(b) => set(f.key, b ? 'true' : 'false')} label={f.label} hint={f.help} /></div>;
          }
          return (
            <Field key={f.key} label={f.label} hint={jsonErr[f.key] ? <span class="err">{jsonErr[f.key]}</span> : f.help} wide={f.wide || f.type === 'textarea' || f.type === 'json'}>
              {f.type === 'select' ? <Choice value={v} onChange={(x) => set(f.key, x)} options={f.options || []} />
                : f.type === 'textarea' || f.type === 'json' ? <textarea class={f.type === 'json' ? 'mono' : ''} rows={f.type === 'json' ? 8 : 3} value={v} onInput={(e) => set(f.key, (e.target as HTMLTextAreaElement).value)} />
                  : <Text type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'} autoComplete="off" value={v} onInput={(x) => set(f.key, x)} />}
            </Field>
          );
        })}
      </div>
      {extra}
      <SaveBar dirty={dirty} busy={busy} onSave={save} onReset={() => setDraft({})} />
    </Card>
  );
}

// ------------------------------------------------------------------ overview

interface Health { checked_at: string; checks: { id: string; label_key: string; status: string; latency_ms: number | null; detail?: string | null; detail_key?: string; detail_params?: Record<string, unknown> }[] }

const HEALTH_LABELS: Record<string, [string, string]> = {
  database: ['Datenbank', 'Database'], redis: ['Redis', 'Redis'], widget_cache: ['Widget-Cache', 'Widget cache'],
  background_jobs: ['Hintergrund-Jobs', 'Background jobs'], scheduler: ['Scheduler', 'Scheduler'], storage: ['Speicher', 'Storage'],
  api_calls: ['API-Aufrufe', 'API calls'], smtp: ['SMTP', 'SMTP'],
};

function Overview() {
  const tr = t.value;
  const locale = getHost().locale;
  const health = useAsync(() => api.get<Health>('/api/admin/health'), []);
  const stats = useAsync(() => api.get<Record<string, number | { active: number; entries: number }>>('/api/admin/stats'), []);
  const sys = useAsync(() => api.get<{ version: string; python: string; database: string; license: string; features: Record<string, boolean> }>('/api/admin/system'), []);
  const tone = (s: string) => (s === 'ok' ? 'ok' : s === 'warn' || s === 'warning' ? 'warn' : s === 'na' ? 'neutral' : 'err');
  return (
    <Grid2>
      <Card title={tr('Systemzustand', 'System health')} icon="activity" actions={<button type="button" class="ico" onClick={() => health.reload()}><Icon name="refresh" size={14} /></button>}>
        {!health.data ? <Loading error={health.error} /> : (
          <div class="health">
            {health.data.checks.map((c) => (
              <div key={c.id}>
                <Icon name={tone(c.status) === 'ok' ? 'ok' : tone(c.status) === 'warn' ? 'warn' : tone(c.status) === 'neutral' ? 'info' : 'fail'} size={15}
                  class={tone(c.status) === 'ok' ? 'ok-c' : tone(c.status) === 'warn' ? 'warn-c' : tone(c.status) === 'neutral' ? 'muted' : 'err-c'} />
                <span>{tr(...(HEALTH_LABELS[c.id] || [c.id, c.id]))}</span>
                <small>{c.detail || (c.detail_params && Object.entries(c.detail_params).map(([k, v]) => `${k}: ${v}`).join(', ')) || ''}{c.latency_ms != null ? ` · ${c.latency_ms} ms` : ''}</small>
              </div>
            ))}
            <small class="muted">{tr('Geprüft', 'Checked')}: {fmtDate(health.data.checked_at, locale)}</small>
          </div>
        )}
      </Card>
      <Card title={tr('Zahlen', 'Numbers')} icon="bar-chart">
        {!stats.data ? <Loading error={stats.error} /> : (
          <div class="stat-row">
            <div class="stat"><b>{String(stats.data.users)}</b><small>{tr('Benutzer', 'Users')}</small></div>
            <div class="stat"><b>{String(stats.data.widgets)}</b><small>Widgets</small></div>
            <div class="stat"><b>{String(stats.data.integrations)}</b><small>{tr('Integrationen', 'Integrations')}</small></div>
            <div class="stat"><b>{String(stats.data.modules_enabled)}/{String(stats.data.modules_total)}</b><small>{tr('Module aktiv', 'Modules on')}</small></div>
            <div class="stat"><b>{String((stats.data.cache as { entries: number })?.entries ?? 0)}</b><small>{tr('Cache-Einträge', 'Cache entries')}</small></div>
            <div class="stat"><b>{String(stats.data.audit_logs)}</b><small>{tr('Protokoll', 'Log entries')}</small></div>
          </div>
        )}
      </Card>
      <Card title="System" icon="monitor">
        {!sys.data ? <Loading error={sys.error} /> : (
          <dl class="kv">
            <dt>Homy</dt><dd>{sys.data.version}</dd>
            <dt>Python</dt><dd>{sys.data.python}</dd>
            <dt>{tr('Datenbank', 'Database')}</dt><dd>{sys.data.database}</dd>
            <dt>{tr('Funktionen', 'Features')}</dt><dd>{Object.entries(sys.data.features).map(([k, v]) => <Badge key={k} tone={v ? 'ok' : 'neutral'}>{k}</Badge>)}</dd>
            <dt>{tr('Lizenz', 'License')}</dt><dd>{sys.data.license}</dd>
          </dl>
        )}
      </Card>
    </Grid2>
  );
}

// ------------------------------------------------------------------ system

const LOCALES = [{ value: 'de-DE', label: 'Deutsch' }, { value: 'en-US', label: 'English' }];
const REFRESH = ['0', '15', '30', '60', '120', '300', '600'].map((v) => ({ value: v, label: v === '0' ? 'Aus' : `${v} s` }));

function SystemSettings() {
  const tr = t.value;
  const [logoTick, setLogoTick] = useState(0);
  return (
    <>
      <SettingsForm title={tr('Allgemein', 'General')} icon="monitor" fields={[
        { key: 'site_title', label: tr('Seitentitel', 'Site title') },
        { key: 'site_logo_url', label: tr('Logo-URL (optional)', 'Logo URL (optional)') },
        { key: 'default_locale', label: tr('Standardsprache', 'Default language'), type: 'select', options: LOCALES },
        { key: 'default_theme', label: tr('Standard-Theme', 'Default theme'), type: 'select', options: Object.entries(THEMES).map(([v, x]) => ({ value: v, label: x.label })) },
        { key: 'default_widget_refresh', label: tr('Standard-Aktualisierung (Sekunden)', 'Default refresh (seconds)'), type: 'select', options: REFRESH },
        { key: 'cache_warm_interval', label: tr('Widget-Daten vorladen (Sekunden, 0 = aus)', 'Preload widget data (seconds, 0 = off)'), type: 'number', help: tr('Holt Integrationsdaten im Hintergrund, auch wenn niemand Homy geöffnet hat.', 'Fetches integration data in the background, even when nobody has Homy open.') },
        { key: 'guest_dashboard_enabled', label: tr('Gäste sehen das öffentliche Layout', 'Guests see the public layout'), type: 'toggle' },
        { key: 'maintenance_mode', label: tr('Wartungsmodus (nur Admins können sich anmelden)', 'Maintenance mode (admins only)'), type: 'toggle' },
        { key: 'license_text', label: tr('Lizenzhinweis', 'License note'), type: 'textarea' },
      ]} extra={
        <div class="row">
          <img key={logoTick} src={`/api/branding/logo?v=${logoTick}`} alt="" width={32} height={32} style={{ borderRadius: '6px' }} onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
          <button type="button" class="hb" onClick={async () => {
            const f = await pickFile('image/png,image/jpeg,image/webp,image/gif');
            if (f) { await act(() => api.upload('/api/admin/site-logo', f), tr('Logo gespeichert', 'Logo saved')); setLogoTick((n) => n + 1); }
          }}><Icon name="upload" size={14} /> {tr('Logo hochladen', 'Upload logo')}</button>
          <button type="button" class="hb ghost" onClick={async () => { await act(() => api.del('/api/admin/site-logo'), tr('Logo entfernt', 'Logo removed')); setLogoTick((n) => n + 1); }}>{tr('Logo entfernen', 'Remove logo')}</button>
        </div>
      } />
      <SettingsForm title={tr('Uploads (max. MB)', 'Uploads (max. MB)')} icon="upload" fields={[
        { key: 'upload_max_avatar_mb', label: tr('Profilbild', 'Avatar'), type: 'number' },
        { key: 'upload_max_icon_mb', label: 'Icon', type: 'number' },
        { key: 'upload_max_background_mb', label: tr('Hintergrund', 'Background'), type: 'number' },
        { key: 'upload_max_package_mb', label: tr('ZIP-Paket', 'ZIP package'), type: 'number' },
      ]} />
    </>
  );
}

// ------------------------------------------------------------------ users & groups

interface U { id: number; username: string; display_name: string; email: string; role: string; is_locked: boolean; mfa_enabled: boolean; auth_provider: string; groups?: string[] }
interface G { id: number; name: string; description: string; default_role: string; member_count: number }

const ROLES = [{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }];

function UserDialog({ u, groups, onClose, onSaved }: { u: Partial<U>; groups: G[]; onClose: () => void; onSaved: () => void }) {
  const tr = t.value;
  const [f, setF] = useState({ username: u.username || '', password: '', role: u.role || 'user', is_locked: !!u.is_locked });
  const [gids, setGids] = useState<number[]>(groups.filter((g) => u.groups?.includes(g.name)).map((g) => g.id));
  const save = async () => {
    const saved = await act(async () => {
      const r = u.id
        ? await api.put<U>(`/api/admin/users/${u.id}`, { role: f.role, is_locked: f.is_locked, ...(f.password ? { password: f.password } : {}) })
        : await api.post<U>('/api/admin/users', { username: f.username, password: f.password, role: f.role });
      await api.put(`/api/admin/users/${r.id}/groups`, { group_ids: gids });
      return r;
    }, tr('Gespeichert', 'Saved'));
    if (saved) { onSaved(); onClose(); }
  };
  return (
    <Dialog title={u.id ? `${tr('Benutzer', 'User')}: ${u.username}` : tr('Benutzer anlegen', 'Add user')} onClose={onClose}
      footer={<><button type="button" class="hb" onClick={onClose}>{tr('Abbrechen', 'Cancel')}</button><button type="button" class="hb primary" onClick={save}>{tr('Speichern', 'Save')}</button></>}>
      <div class="form-grid">
        <Field label={tr('Benutzername', 'Username')}><Text value={f.username} disabled={!!u.id} onInput={(v) => setF({ ...f, username: v })} /></Field>
        <Field label={u.id ? tr('Neues Passwort (optional)', 'New password (optional)') : tr('Passwort', 'Password')}><Text type="password" autoComplete="new-password" value={f.password} onInput={(v) => setF({ ...f, password: v })} /></Field>
        <Field label={tr('Rolle', 'Role')}><Choice value={f.role} onChange={(v) => setF({ ...f, role: v })} options={ROLES} /></Field>
      </div>
      {u.id && <Toggle checked={f.is_locked} onChange={(v) => setF({ ...f, is_locked: v })} label={tr('Gesperrt', 'Locked')} />}
      {!!groups.length && (
        <Field label={tr('Gruppen', 'Groups')}>
          <div class="row">{groups.map((g) => (
            <Toggle key={g.id} checked={gids.includes(g.id)} label={g.name} onChange={(v) => setGids(v ? [...gids, g.id] : gids.filter((x) => x !== g.id))} />
          ))}</div>
        </Field>
      )}
    </Dialog>
  );
}

function GroupDialog({ g, onClose, onSaved }: { g: Partial<G>; onClose: () => void; onSaved: () => void }) {
  const tr = t.value;
  const [f, setF] = useState({ name: g.name || '', description: g.description || '', default_role: g.default_role || 'user' });
  return (
    <Dialog title={g.id ? `${tr('Gruppe', 'Group')}: ${g.name}` : tr('Gruppe anlegen', 'Add group')} onClose={onClose}
      footer={<><button type="button" class="hb" onClick={onClose}>{tr('Abbrechen', 'Cancel')}</button><button type="button" class="hb primary" onClick={async () => {
        const ok = await act(() => (g.id ? api.put(`/api/admin/groups/${g.id}`, f) : api.post('/api/admin/groups', f)), tr('Gespeichert', 'Saved'));
        if (ok !== undefined) { onSaved(); onClose(); }
      }}>{tr('Speichern', 'Save')}</button></>}>
      <Field label={tr('Name', 'Name')}><Text value={f.name} onInput={(v) => setF({ ...f, name: v })} /></Field>
      <Field label={tr('Beschreibung', 'Description')}><Text value={f.description} onInput={(v) => setF({ ...f, description: v })} /></Field>
      <Field label={tr('Standardrolle (z. B. bei LDAP/OIDC-Zuordnung)', 'Default role (e.g. for LDAP/OIDC mapping)')}><Choice value={f.default_role} onChange={(v) => setF({ ...f, default_role: v })} options={ROLES} /></Field>
    </Dialog>
  );
}

function Users() {
  const tr = t.value;
  const users = useAsync(() => api.get<U[]>('/api/admin/users'), []);
  const groups = useAsync(() => api.get<G[]>('/api/admin/groups'), []);
  const [q, setQ] = useState('');
  const [editU, setEditU] = useState<Partial<U> | null>(null);
  const [editG, setEditG] = useState<Partial<G> | null>(null);
  const filtered = useMemo(() => (users.data || []).filter((u) => !q || `${u.username} ${u.display_name} ${u.email}`.toLowerCase().includes(q.toLowerCase())), [users.data, q]);
  const paged = usePaged(filtered);
  const me = user.value?.username;
  return (
    <>
      <Card title={tr('Benutzer', 'Users')} icon="users" span={3} actions={<button type="button" class="hb primary sm" onClick={() => setEditU({})}><Icon name="plus" size={14} /> {tr('Benutzer', 'User')}</button>}>
        <div class="toolbar"><input class="grow" placeholder={tr('Suchen …', 'Search …')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} /></div>
        {!users.data ? <Loading error={users.error} retry={users.reload} /> : (
          <>
            <table class="tbl">
              <thead><tr><th>{tr('Benutzer', 'User')}</th><th>{tr('Rolle', 'Role')}</th><th>{tr('Anmeldung', 'Sign-in')}</th><th>{tr('Gruppen', 'Groups')}</th><th>Status</th><th /></tr></thead>
              <tbody>
                {paged.slice.map((u) => (
                  <tr key={u.id}>
                    <td><span class="cell-main"><b>{u.username}</b> <small>{u.display_name || u.email}</small></span></td>
                    <td><Badge tone={u.role === 'admin' ? 'primary' : 'neutral'}>{u.role}</Badge></td>
                    <td>{u.auth_provider}{u.mfa_enabled && <> · <Badge tone="ok">MFA</Badge></>}</td>
                    <td>{(u.groups || []).join(', ') || <span class="muted">–</span>}</td>
                    <td>{u.is_locked ? <Badge tone="err">{tr('gesperrt', 'locked')}</Badge> : <Badge tone="ok">{tr('aktiv', 'active')}</Badge>}</td>
                    <td class="acts">
                      <button type="button" class="ico" onClick={() => setEditU(u)} title={tr('Bearbeiten', 'Edit')}><Icon name="pencil" size={13} /></button>
                      <button type="button" class="ico danger" disabled={u.username === me} title={tr('Löschen', 'Delete')} onClick={async () => {
                        if (!confirm(tr(`Benutzer „${u.username}“ inkl. Layout löschen?`, `Delete user "${u.username}" incl. layout?`))) return;
                        await act(() => api.del(`/api/admin/users/${u.id}`), tr('Gelöscht', 'Deleted')); void users.reload();
                      }}><Icon name="trash" size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager {...paged} />
          </>
        )}
      </Card>
      <Grid2>
        <Card title={tr('Gruppen', 'Groups')} icon="users" actions={<button type="button" class="hb sm" onClick={() => setEditG({})}><Icon name="plus" size={14} /> {tr('Gruppe', 'Group')}</button>}>
          {!groups.data ? <Loading error={groups.error} /> : (
            <table class="tbl"><tbody>
              {groups.data.map((g) => (
                <tr key={g.id}>
                  <td><b>{g.name}</b> <small class="muted">{g.description}</small></td>
                  <td>{g.member_count} {tr('Mitglieder', 'members')}</td>
                  <td><Badge>{g.default_role}</Badge></td>
                  <td class="acts">
                    <button type="button" class="ico" onClick={() => setEditG(g)}><Icon name="pencil" size={13} /></button>
                    <button type="button" class="ico danger" onClick={async () => { if (confirm(tr(`Gruppe „${g.name}“ löschen?`, `Delete group "${g.name}"?`))) { await act(() => api.del(`/api/admin/groups/${g.id}`)); void groups.reload(); } }}><Icon name="trash" size={13} /></button>
                  </td>
                </tr>
              ))}
              {!groups.data.length && <tr><td class="muted">{tr('Keine Gruppen.', 'No groups.')}</td></tr>}
            </tbody></table>
          )}
        </Card>
        <SettingsForm span={1} title={tr('Registrierung', 'Registration')} icon="user" fields={[
          { key: 'registration_enabled', label: tr('Selbstregistrierung erlauben', 'Allow self-registration'), type: 'toggle', wide: true },
          { key: 'default_user_role', label: tr('Rolle für neue Benutzer', 'Role for new users'), type: 'select', options: ROLES },
        ]} />
      </Grid2>
      {editU && <UserDialog u={editU} groups={groups.data || []} onClose={() => setEditU(null)} onSaved={() => users.reload()} />}
      {editG && <GroupDialog g={editG} onClose={() => setEditG(null)} onSaved={() => { void groups.reload(); void users.reload(); }} />}
    </>
  );
}

// ------------------------------------------------------------------ auth / mail / security

function AuthSettings() {
  const tr = t.value;
  return (
    <>
      <SettingsForm title={tr('Allgemein', 'General')} icon="key" fields={[
        { key: 'session_cookie_days', label: tr('Angemeldet bleiben (Tage)', 'Stay signed in (days)'), type: 'select', options: ['1', '7', '14', '30', '90', '365'].map((v) => ({ value: v, label: v })) },
        { key: 'password_min_length', label: tr('Mindestlänge Passwort', 'Minimum password length'), type: 'number' },
        { key: 'password_require_upper', label: tr('Großbuchstaben erforderlich', 'Require uppercase'), type: 'toggle' },
        { key: 'auth_mfa_required', label: tr('Zwei-Faktor für alle erzwingen', 'Enforce two-factor for everyone'), type: 'toggle' },
      ]} />
      <SettingsForm title="LDAP / Active Directory" icon="network" fields={[
        { key: 'auth_ldap_enabled', label: tr('LDAP aktivieren', 'Enable LDAP'), type: 'toggle', wide: true },
        { key: 'auth_ldap_config', label: tr('Konfiguration (JSON)', 'Configuration (JSON)'), type: 'json', help: '{"server": "ldaps://dc.example.local", "base_dn": "…", "bind_dn": "…", "bind_password": "…", "user_filter": "(sAMAccountName={username})"}' },
      ]} />
      <SettingsForm title="OIDC" icon="cloud" fields={[
        { key: 'auth_oidc_enabled', label: tr('OIDC aktivieren', 'Enable OIDC'), type: 'toggle', wide: true },
        { key: 'auth_oidc_config', label: tr('Konfiguration (JSON)', 'Configuration (JSON)'), type: 'json', help: '{"issuer": "https://login.microsoftonline.com/<tenant>/v2.0", "client_id": "…", "client_secret": "…"}' },
      ]} />
      <SettingsForm title="SAML" icon="key" fields={[
        { key: 'auth_saml_enabled', label: tr('SAML aktivieren', 'Enable SAML'), type: 'toggle', wide: true },
        { key: 'auth_saml_config', label: tr('Konfiguration (JSON)', 'Configuration (JSON)'), type: 'json' },
      ]} />
    </>
  );
}

function MailApi() {
  const tr = t.value;
  return (
    <>
      <SettingsForm title="SMTP" icon="mail" fields={[
        { key: 'smtp_host', label: 'Host' }, { key: 'smtp_port', label: 'Port', type: 'number' },
        { key: 'smtp_user', label: tr('Benutzer', 'User') }, { key: 'smtp_password', label: tr('Passwort', 'Password'), type: 'password' },
        { key: 'smtp_from', label: tr('Absender', 'From') }, { key: 'smtp_tls', label: 'STARTTLS', type: 'toggle' },
      ]} extra={<div><button type="button" class="hb" onClick={() => act(async () => {
        const r = await api.post<{ ok: boolean; message: string }>('/api/admin/test/smtp', {});
        if (!r.ok) throw new Error(r.message);
        return r;
      }, tr('SMTP-Verbindung erfolgreich', 'SMTP connection OK'))}><Icon name="zap" size={14} /> {tr('Verbindung testen (gespeicherte Werte)', 'Test connection (saved values)')}</button></div>} />
      <SettingsForm title="API" icon="plug" fields={[
        { key: 'global_weather_key', label: tr('OpenWeather-API-Key (global)', 'OpenWeather API key (global)'), type: 'password' },
        { key: 'custom_dns_servers', label: tr('Eigene DNS-Server (Komma)', 'Custom DNS servers (comma)'), help: '8.8.8.8, 1.1.1.1' },
      ]} />
    </>
  );
}

function Security() {
  const tr = t.value;
  return (
    <SettingsForm title={tr('Sicherheit', 'Security')} icon="lock" fields={[
      { key: 'security_ip_whitelist', label: tr('IP-Allowlist für /api (Komma, CIDR erlaubt)', 'IP allow-list for /api (comma, CIDR ok)'), wide: true },
      { key: 'security_trusted_proxies', label: tr('Vertrauenswürdige Proxys', 'Trusted proxies'), wide: true },
      { key: 'security_cors_origins', label: tr('CORS-Origins (Komma)', 'CORS origins (comma)'), wide: true, help: tr('Browser-Add-ons brauchen keinen Eintrag – sie nutzen Tokens.', 'Browser add-ons need no entry – they use tokens.') },
      { key: 'security_csp', label: 'Content-Security-Policy', type: 'textarea' },
      { key: 'global_layout_locked', label: tr('Layouts für Nicht-Admins sperren', 'Lock layouts for non-admins'), type: 'toggle', wide: true },
    ]} />
  );
}

// ------------------------------------------------------------------ audit

interface Log { id: number; timestamp: string; username: string | null; event_type: string; message: string }

function Audit() {
  const tr = t.value;
  const locale = getHost().locale;
  const [who, setWho] = useState('');
  const [ev, setEv] = useState('');
  const [q, setQ] = useState('');
  const logs = useAsync(() => api.get<{ logs: Log[]; event_types: string[]; usernames: string[] }>(`/api/admin/audit-logs?limit=1000${who ? `&username=${encodeURIComponent(who)}` : ''}${ev ? `&event_type=${encodeURIComponent(ev)}` : ''}`), [who, ev]);
  const filtered = useMemo(() => (logs.data?.logs || []).filter((l) => !q || l.message.toLowerCase().includes(q.toLowerCase())), [logs.data, q]);
  const paged = usePaged(filtered);
  return (
    <Card title={tr('Aktivitätsprotokoll', 'Activity log')} icon="scroll-text" span={3} actions={
      <button type="button" class="hb sm" onClick={async () => { const d = await act(() => api.get('/api/admin/backup/audit')); if (d) api.downloadJson(d, `homy-audit-${new Date().toISOString().slice(0, 10)}.json`); }}>
        <Icon name="download" size={14} /> {tr('Exportieren', 'Export')}</button>}>
      <div class="toolbar">
        <input class="grow" placeholder={tr('Nachricht durchsuchen …', 'Search messages …')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <Choice value={who} onChange={setWho} options={[{ value: '', label: tr('Alle Benutzer', 'All users') }, ...(logs.data?.usernames || []).map((u) => ({ value: u, label: u }))]} />
        <Choice value={ev} onChange={setEv} options={[{ value: '', label: tr('Alle Ereignisse', 'All events') }, ...(logs.data?.event_types || []).map((u) => ({ value: u, label: u }))]} />
      </div>
      {!logs.data ? <Loading error={logs.error} retry={logs.reload} /> : (
        <>
          <table class="tbl">
            <thead><tr><th>{tr('Zeit', 'Time')}</th><th>{tr('Benutzer', 'User')}</th><th>{tr('Ereignis', 'Event')}</th><th>{tr('Nachricht', 'Message')}</th></tr></thead>
            <tbody>
              {paged.slice.map((l) => (
                <tr key={l.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDate(l.timestamp, locale)}</td><td>{l.username || '–'}</td><td><Badge>{l.event_type}</Badge></td><td>{l.message}</td></tr>
              ))}
            </tbody>
          </table>
          <Pager {...paged} />
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ services

function Services() {
  const tr = t.value;
  const locale = getHost().locale;
  const cache = useAsync(() => api.get<{ active: number; entries: number }>('/api/admin/cache/stats'), []);
  const jobs = useAsync(() => api.get<{ jobs: { id: number; job_type: string; status: string; created_at: string; error_message: string | null }[]; scheduler: { running: boolean; jobs: { id: string; next_run: string }[] } }>('/api/admin/jobs'), []);
  const th = useAsync(() => api.get<{ schema: Record<string, Record<string, number | string>>; thresholds: Record<string, Record<string, number | string>> }>('/api/admin/health/thresholds'), []);
  const [draft, setDraft] = useState<Record<string, Record<string, number | string>> | null>(null);
  useEffect(() => { if (th.data) setDraft(JSON.parse(JSON.stringify(th.data.thresholds))); }, [th.data]);
  const jp = usePaged(jobs.data?.jobs || []);
  return (
    <Grid2>
      <Card title={tr('Widget-Cache', 'Widget cache')} icon="database">
        {!cache.data ? <Loading error={cache.error} /> : <p>{cache.data.entries} {tr('Einträge', 'entries')}, {cache.data.active} {tr('aktiv', 'active')}</p>}
        <div><button type="button" class="hb" onClick={async () => { await act(() => api.post('/api/admin/cache/clear'), tr('Cache geleert', 'Cache cleared')); void cache.reload(); }}><Icon name="trash" size={14} /> {tr('Cache leeren', 'Clear cache')}</button></div>
      </Card>
      <Card title={tr('Scheduler & Jobs', 'Scheduler & jobs')} icon="timer" actions={<button type="button" class="ico" onClick={() => jobs.reload()}><Icon name="refresh" size={14} /></button>}>
        {!jobs.data ? <Loading error={jobs.error} /> : (
          <>
            <p>{jobs.data.scheduler.running ? <span class="ok-c"><Icon name="ok" size={14} /> {tr('läuft', 'running')}</span> : <span class="err-c"><Icon name="fail" size={14} /> {tr('gestoppt', 'stopped')}</span>}
              {' · '}{jobs.data.scheduler.jobs.map((j) => `${j.id} → ${fmtDate(j.next_run, locale)}`).join(', ')}</p>
            <table class="tbl"><tbody>
              {jp.slice.map((j) => (
                <tr key={j.id}><td>{j.job_type}</td><td><Badge tone={j.status === 'done' ? 'ok' : j.status === 'failed' ? 'err' : 'neutral'}>{j.status}</Badge></td><td>{fmtDate(j.created_at, locale)}</td><td class="muted small">{j.error_message}</td></tr>
              ))}
              {!jp.total && <tr><td class="muted">{tr('Keine Jobs.', 'No jobs.')}</td></tr>}
            </tbody></table>
            <Pager {...jp} />
          </>
        )}
      </Card>
      <Card title={tr('Schwellwerte Systemzustand', 'Health thresholds')} icon="sliders">
        {!th.data || !draft ? <Loading error={th.error} /> : (
          <>
            {Object.entries(draft).map(([key, vals]) => (
              <div key={key} class="form-grid">
                {Object.entries(vals).filter(([k]) => !['label_key', 'unit'].includes(k)).map(([k, v]) => (
                  <Field key={k} label={`${key} · ${k}`}><Text type="number" value={String(v)} onInput={(x) => setDraft({ ...draft, [key]: { ...vals, [k]: Number(x) } })} /></Field>
                ))}
              </div>
            ))}
            <div><button type="button" class="hb primary" onClick={() => act(() => api.post('/api/admin/health/thresholds', { thresholds: draft }), tr('Gespeichert', 'Saved'))}><Icon name="save" size={14} /> {tr('Speichern', 'Save')}</button></div>
          </>
        )}
      </Card>
    </Grid2>
  );
}

// ------------------------------------------------------------------ extensions

interface Mod { id: string; name: string; description: string; version: string; author: string; enabled: boolean; widgets?: unknown[] }
interface Pkg { id: number; package_type: string; original_name: string; status: string; validation_message: string | null; manifest: { name?: string; version?: string }; size_bytes: number; is_global: boolean; created_at?: string }

function Extensions() {
  const tr = t.value;
  const mods = useAsync(() => api.get<Mod[]>('/api/admin/modules'), []);
  const ints = useAsync(() => api.get<Mod[]>('/api/admin/integrations'), []);
  const pkgs = useAsync(() => api.get<Pkg[]>('/api/packages'), []);
  const [ptype, setPtype] = useState('module');
  const mp = usePaged(mods.data || []);
  const ip = usePaged(ints.data || []);
  const toggle = async (kind: 'modules' | 'integrations', id: string, enabled: boolean) => {
    await act(() => api.post(`/api/admin/${kind}/toggle`, kind === 'modules' ? { module_id: id, enabled } : { integration_id: id, enabled }),
      tr('Gespeichert – Neustart von Homy übernimmt Routen vollständig.', 'Saved – restart Homy to fully apply routes.'));
    void (kind === 'modules' ? mods.reload() : ints.reload());
  };
  const listOf = (p: ReturnType<typeof usePaged<Mod>>, kind: 'modules' | 'integrations') => (
    <>
      <table class="tbl"><tbody>
        {p.slice.map((m) => (
          <tr key={m.id}>
            <td style={{ width: '50px' }}><Toggle label="" checked={m.enabled} onChange={(v) => toggle(kind, m.id, v)} /></td>
            <td><b>{m.name}</b> <small class="muted">v{m.version}</small><br /><small class="muted">{m.description}</small></td>
          </tr>
        ))}
      </tbody></table>
      <Pager {...p} />
    </>
  );
  return (
    <>
      <Grid2>
        <Card title={tr('Module', 'Modules')} icon="layers">{!mods.data ? <Loading error={mods.error} /> : listOf(mp, 'modules')}</Card>
        <Card title={tr('Integrationstypen', 'Integration types')} icon="plug">{!ints.data ? <Loading error={ints.error} /> : listOf(ip, 'integrations')}</Card>
      </Grid2>
      <Card title={tr('ZIP-Pakete', 'ZIP packages')} icon="package" span={3} actions={<>
        <Choice value={ptype} onChange={setPtype} options={[{ value: 'module', label: tr('Modul', 'Module') }, { value: 'integration', label: 'Integration' }, { value: 'template', label: tr('Vorlage', 'Template') }]} />
        <button type="button" class="hb primary sm" onClick={async () => {
          const f = await pickFile('.zip,application/zip');
          if (f) { await act(() => api.upload('/api/packages', f, { package_type: ptype, is_global: 'true' }), tr('Hochgeladen und geprüft', 'Uploaded and validated')); void pkgs.reload(); }
        }}><Icon name="upload" size={14} /> {tr('ZIP hochladen', 'Upload ZIP')}</button>
      </>}>
        {!pkgs.data ? <Loading error={pkgs.error} /> : (
          <table class="tbl">
            <thead><tr><th>{tr('Paket', 'Package')}</th><th>{tr('Typ', 'Type')}</th><th>Status</th><th class="num">{tr('Größe', 'Size')}</th><th /></tr></thead>
            <tbody>
              {pkgs.data.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.manifest?.name || p.original_name}</b> <small class="muted">{p.manifest?.version}</small></td>
                  <td>{p.package_type}</td>
                  <td><Badge tone={p.status === 'installed' ? 'ok' : p.status === 'valid' ? 'primary' : p.status === 'invalid' ? 'err' : 'neutral'}>{p.status}</Badge> <small class="muted">{p.validation_message}</small></td>
                  <td class="num">{fmtBytes(p.size_bytes)}</td>
                  <td class="acts">
                    {p.status !== 'installed' && p.status !== 'invalid' && <button type="button" class="hb sm" onClick={async () => { await act(() => api.post(`/api/packages/${p.id}/install`), tr('Installiert – Neustart nötig', 'Installed – restart required')); void pkgs.reload(); }}>{tr('Installieren', 'Install')}</button>}
                    <button type="button" class="ico danger" onClick={async () => { if (confirm(tr('Paket löschen?', 'Delete package?'))) { await act(() => api.del(`/api/packages/${p.id}`)); void pkgs.reload(); } }}><Icon name="trash" size={13} /></button>
                  </td>
                </tr>
              ))}
              {!pkgs.data.length && <tr><td colSpan={5} class="muted">{tr('Keine Pakete hochgeladen.', 'No packages uploaded.')}</td></tr>}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ backup

function BackupAdmin() {
  const tr = t.value;
  return (
    <Grid2>
      <Card title={tr('Komplettsicherung', 'Full backup')} icon="archive">
        <p class="muted small">{tr('Datenbank, Einstellungen, Medien und Pakete als ZIP.', 'Database, settings, media and packages as a ZIP.')}</p>
        <div class="row">
          <button type="button" class="hb primary" onClick={() => api.download('/api/admin/backup/full')}><Icon name="download" size={14} /> {tr('Backup herunterladen', 'Download backup')}</button>
          <button type="button" class="hb danger" onClick={async () => {
            const f = await pickFile('.zip,application/zip');
            if (!f || !confirm(tr('Alle Daten durch das Backup ersetzen? Das kann nicht rückgängig gemacht werden.', 'Replace all data with the backup? This cannot be undone.'))) return;
            const ok = await act(() => api.upload('/api/admin/backup/restore', f), tr('Wiederhergestellt – Seite wird neu geladen', 'Restored – reloading'));
            if (ok !== undefined) setTimeout(() => location.reload(), 1200);
          }}><Icon name="upload" size={14} /> {tr('Wiederherstellen', 'Restore')}</button>
        </div>
      </Card>
      <Card title={tr('Einstellungen', 'Settings')} icon="sliders">
        <p class="muted small">{tr('Nur die Admin-Einstellungen als JSON (ohne Geheimnisse).', 'Admin settings only, as JSON (no secrets).')}</p>
        <div class="row">
          <button type="button" class="hb" onClick={async () => { const d = await act(() => api.get('/api/admin/backup/settings')); if (d) api.downloadJson(d, `homy-settings-${new Date().toISOString().slice(0, 10)}.json`); }}><Icon name="download" size={14} /> {tr('Exportieren', 'Export')}</button>
          <button type="button" class="hb" onClick={async () => {
            const f = await pickFile('application/json,.json');
            if (!f) return;
            try {
              const d = JSON.parse(await f.text()) as { settings?: Record<string, string> };
              await act(() => api.post('/api/admin/config', d.settings || d), tr('Importiert', 'Imported'));
            } catch { alert(tr('Keine gültige JSON-Datei.', 'Not a valid JSON file.')); }
          }}><Icon name="upload" size={14} /> {tr('Importieren', 'Import')}</button>
        </div>
      </Card>
    </Grid2>
  );
}
