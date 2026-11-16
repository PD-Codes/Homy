import { useEffect, useState } from 'preact/hooks';
import { BackgroundEditor } from '@/ui/Background';
import { Icon } from '@/ui/icons';
import {
  Card, Choice, Field, Grid2, Loading, Page, Pager, Segmented, Text, Toggle, act, fmtBytes, fmtDate, pickFile, useAsync, usePaged,
} from '@/ui/kit';
import { getHost, layoutKey, navigate, reload, saveUi, t, ui, user } from '@/ui/store';
import { THEMES, applyTheme } from '@/ui/theme';
import { AccountPanel } from '../AccountPanel';
import { api } from './api';

const SUBS = [
  { id: '', de: 'Darstellung', en: 'Appearance', icon: 'palette' },
  { id: 'account', de: 'Konto & Sicherheit', en: 'Account & security', icon: 'user' },
  { id: 'notifications', de: 'Benachrichtigungen', en: 'Notifications', icon: 'bell' },
  { id: 'media', de: 'Meine Medien', en: 'My media', icon: 'image' },
  { id: 'backup', de: 'Sicherung', en: 'Backup', icon: 'archive' },
];

export function SubNav({ page, subs, current }: { page: string; subs: { id: string; de: string; en: string; icon: string }[]; current: string }) {
  const tr = t.value;
  return (
    <>{subs.map((s) => (
      <button type="button" key={s.id} class={current === s.id ? 'on' : ''} onClick={() => navigate(page, s.id)}><Icon name={s.icon} size={14} /> {tr(s.de, s.en)}</button>
    ))}</>
  );
}

export function SettingsPage({ sub }: { sub: string }) {
  const tr = t.value;
  const cur = SUBS.find((s) => s.id === sub) ? sub : '';
  return (
    <Page title={tr('Einstellungen', 'Settings')} icon="settings" sub={<SubNav page="settings" subs={SUBS} current={cur} />}>
      {cur === '' && <Appearance />}
      {cur === 'account' && <Account />}
      {cur === 'notifications' && <Notifications />}
      {cur === 'media' && <Media scope="mine" />}
      {cur === 'backup' && <Backup />}
    </Page>
  );
}

// ------------------------------------------------------------------ appearance

const CUSTOM_FIELDS: [string, string, string][] = [
  ['bg_base', 'Hintergrund', 'Background'], ['bg_surface', 'Flächen', 'Surfaces'], ['bg_card', 'Karten', 'Cards'],
  ['text_primary', 'Text', 'Text'], ['text_secondary', 'Text sekundär', 'Secondary text'], ['text_muted', 'Text gedämpft', 'Muted text'],
  ['primary', 'Akzent', 'Accent'], ['border_color', 'Rahmen', 'Border'], ['success', 'Erfolg', 'Success'], ['danger', 'Fehler', 'Danger'],
];

function Appearance() {
  const tr = t.value;
  const [custom, setCustom] = useState<Record<string, string>>(ui.value.customTheme || {});
  const css = getComputedStyle(document.documentElement);
  const current = (k: string) => custom[k] || css.getPropertyValue(`--${k.replace(/_/g, '-')}`).trim();
  const locale = getHost().locale;
  return (
    <Grid2>
      <Card title={tr('Farbschema', 'Color scheme')} icon="palette">
        <div class="swatches">
          {[...Object.entries(THEMES), ['custom', { label: tr('Eigenes', 'Custom'), vars: { '--bg-base': current('bg_base'), '--text-primary': current('text_primary'), '--primary': current('primary') } }] as const].map(([id, th]) => (
            <button type="button" key={id} class={ui.value.theme === id ? 'swatch on' : 'swatch'} onClick={() => saveUi({ theme: id, customTheme: custom })}
              style={{ background: th.vars['--bg-base'], color: th.vars['--text-primary'] }}>
              <i style={{ background: th.vars['--primary'] }} />{th.label}
            </button>
          ))}
        </div>
        {ui.value.theme === 'custom' && (
          <>
            <div class="form-grid">
              {CUSTOM_FIELDS.map(([k, de, en]) => (
                <label class="cf-field" key={k}><span>{tr(de, en)}</span>
                  <input type="color" value={/^#[0-9a-f]{6}$/i.test(current(k)) ? current(k) : '#000000'}
                    onInput={(e) => { const next = { ...custom, [k]: (e.target as HTMLInputElement).value }; setCustom(next); applyTheme('custom', next); }} />
                </label>
              ))}
            </div>
            <div class="row">
              <button type="button" class="hb primary" onClick={async () => {
                await saveUi({ theme: 'custom', customTheme: custom });
                await act(() => api.post('/api/user/preferences', { theme: 'custom', custom_theme: custom }), tr('Gespeichert', 'Saved'));
              }}><Icon name="save" size={14} /> {tr('Farben speichern', 'Save colors')}</button>
              <button type="button" class="hb ghost" onClick={() => { setCustom({}); applyTheme('custom', {}); }}>{tr('Zurücksetzen', 'Reset')}</button>
            </div>
          </>
        )}
      </Card>
      <Card title={tr('Dashboard', 'Dashboard')} icon="grid">
        <Toggle checked={ui.value.fitToScreen} onChange={(v) => saveUi({ fitToScreen: v })} label={tr('An Bildschirmhöhe anpassen (kein Scrollen)', 'Fit to screen height (no scrolling)')} />
        <Toggle checked={ui.value.preloadTabs !== false} onChange={(v) => saveUi({ preloadTabs: v })} label={tr('Alle Tabs im Hintergrund vorladen', 'Preload all tabs in the background')} />
        <Toggle checked={ui.value.autoMobile !== false} onChange={(v) => saveUi({ autoMobile: v })} label={tr('Mobil-Layout auf schmalen Bildschirmen', 'Mobile layout on narrow screens')} />
        <div class="form-grid">
          <Field label={tr('Dichte', 'Density')}>
            <Choice value={ui.value.density} onChange={(v) => saveUi({ density: v as 'compact' | 'cozy' })} options={[{ value: 'compact', label: tr('Kompakt', 'Compact') }, { value: 'cozy', label: tr('Luftig', 'Cozy') }]} />
          </Field>
          <Field label={tr('Sprache', 'Language')}>
            <Choice value={locale.startsWith('de') ? 'de-DE' : 'en-US'} onChange={(v) => { localStorage.setItem('locale', v); location.reload(); }}
              options={[{ value: 'de-DE', label: 'Deutsch' }, { value: 'en-US', label: 'English' }]} />
          </Field>
        </div>
        <Field label={tr('Layout bearbeiten', 'Edit layout')}>
          <Segmented value={layoutKey.value} onChange={(v) => { layoutKey.value = v; void reload(); navigate('dashboard'); }}
            options={[{ value: 'desktop', label: 'Desktop', icon: 'monitor' }, { value: 'mobile', label: tr('Mobil', 'Mobile'), icon: 'smartphone' },
              ...(user.value?.role === 'admin' ? [{ value: 'public' as const, label: tr('Öffentlich', 'Public'), icon: 'globe' }] : [])]} />
        </Field>
      </Card>
      <Card title={tr('Hintergrundbild', 'Wallpaper')} icon="wallpaper">
        <BackgroundEditor allowFixed value={ui.value.wallpaper || (ui.value.background ? { type: 'url', url: ui.value.background } : undefined)}
          onChange={(bg) => saveUi({ wallpaper: bg, background: '' })} />
        <p class="muted small">{tr('Gilt für alle Tabs. Einzelne Tabs bekommen eigene Hintergründe über die Tab-Einstellungen (Bearbeiten-Modus → Doppelklick auf den Tab).', 'Applies to all tabs. Individual tabs get their own background in the tab settings (edit mode → double-click the tab).')}</p>
      </Card>
    </Grid2>
  );
}

// ------------------------------------------------------------------ account

interface Profile { user: { username: string; display_name: string; email: string; mfa_enabled: boolean; profile_asset_id: number | null; auth_provider: string } }

function Account() {
  const tr = t.value;
  const prof = useAsync(() => api.get<Profile>('/api/user/profile'), []);
  const [form, setForm] = useState({ display_name: '', email: '' });
  const [pw, setPw] = useState({ current_password: '', new_password: '', repeat: '' });
  const [mfa, setMfa] = useState<{ qr_base64: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  useEffect(() => { if (prof.data) setForm({ display_name: prof.data.user.display_name || '', email: prof.data.user.email || '' }); }, [prof.data]);
  if (!prof.data) return <Loading error={prof.error} retry={prof.reload} />;
  const u = prof.data.user;
  const local = (u.auth_provider || 'local') === 'local';
  return (
    <Grid2>
      <Card title={tr('Profil', 'Profile')} icon="user">
        <div class="row">
          <span class="avatar">{u.profile_asset_id ? <img src={`/api/assets/${u.profile_asset_id}/file`} alt="" /> : <Icon name="user" size={22} />}</span>
          <div style={{ flex: 1 }}><b>{u.username}</b><br /><small class="muted">{u.auth_provider}</small></div>
          <button type="button" class="hb" onClick={async () => {
            const f = await pickFile('image/png,image/jpeg,image/webp,image/gif');
            if (!f) return;
            const a = await act(() => api.upload<{ id: number }>('/api/assets', f, { category: 'avatar' }));
            if (a) { await act(() => api.put('/api/user/profile', { profile_asset_id: a.id }), tr('Profilbild gesetzt', 'Avatar updated')); void prof.reload(); }
          }}><Icon name="upload" size={14} /> {tr('Profilbild', 'Avatar')}</button>
        </div>
        <div class="form-grid">
          <Field label={tr('Anzeigename', 'Display name')}><Text value={form.display_name} onInput={(v) => setForm({ ...form, display_name: v })} /></Field>
          <Field label="E-Mail"><Text type="email" value={form.email} onInput={(v) => setForm({ ...form, email: v })} /></Field>
        </div>
        <div><button type="button" class="hb primary" onClick={async () => { await act(() => api.put('/api/user/profile', form), tr('Gespeichert', 'Saved')); void prof.reload(); }}><Icon name="save" size={14} /> {tr('Speichern', 'Save')}</button></div>
      </Card>
      {local && (
        <Card title={tr('Passwort ändern', 'Change password')} icon="key">
          <Field label={tr('Aktuelles Passwort', 'Current password')}><Text type="password" autoComplete="current-password" value={pw.current_password} onInput={(v) => setPw({ ...pw, current_password: v })} /></Field>
          <div class="form-grid">
            <Field label={tr('Neues Passwort', 'New password')}><Text type="password" autoComplete="new-password" value={pw.new_password} onInput={(v) => setPw({ ...pw, new_password: v })} /></Field>
            <Field label={tr('Wiederholen', 'Repeat')}><Text type="password" autoComplete="new-password" value={pw.repeat} onInput={(v) => setPw({ ...pw, repeat: v })} /></Field>
          </div>
          {pw.repeat && pw.repeat !== pw.new_password && <small class="err">{tr('Passwörter stimmen nicht überein.', 'Passwords do not match.')}</small>}
          <div><button type="button" class="hb primary" disabled={!pw.new_password || pw.new_password !== pw.repeat} onClick={async () => {
            const ok = await act(() => api.put('/api/user/password', { current_password: pw.current_password, new_password: pw.new_password }), tr('Passwort geändert', 'Password changed'));
            if (ok !== undefined) setPw({ current_password: '', new_password: '', repeat: '' });
          }}>{tr('Passwort ändern', 'Change password')}</button></div>
        </Card>
      )}
      <Card title={tr('Zwei-Faktor-Anmeldung', 'Two-factor sign-in')} icon="shield-check">
        {u.mfa_enabled ? (
          <>
            <p><span class="ok-c"><Icon name="ok" size={14} /> {tr('Aktiv', 'Enabled')}</span></p>
            <div><button type="button" class="hb danger" onClick={async () => {
              if (!confirm(tr('Zwei-Faktor-Anmeldung wirklich deaktivieren?', 'Really disable two-factor sign-in?'))) return;
              await act(() => api.post('/api/auth/mfa/disable'), tr('Deaktiviert', 'Disabled')); void prof.reload();
            }}>{tr('Deaktivieren', 'Disable')}</button></div>
          </>
        ) : mfa ? (
          <>
            <div class="row" style={{ alignItems: 'flex-start' }}>
              <img src={`data:image/png;base64,${mfa.qr_base64}`} alt="QR" width={150} height={150} style={{ background: '#fff', borderRadius: '6px', padding: '4px' }} />
              <div style={{ flex: 1 }}>
                <p class="small">{tr('QR-Code mit einer Authenticator-App scannen oder den Schlüssel eingeben:', 'Scan with an authenticator app or enter the key:')}</p>
                <code class="mono" style={{ wordBreak: 'break-all' }}>{mfa.secret}</code>
              </div>
            </div>
            <div class="row">
              <input inputMode="numeric" placeholder="123456" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} style={{ width: '120px' }} class="grow" />
              <button type="button" class="hb primary" onClick={async () => {
                const ok = await act(() => api.post('/api/auth/mfa/setup', { code }), tr('Aktiviert', 'Enabled'));
                if (ok !== undefined) { setMfa(null); setCode(''); void prof.reload(); }
              }}>{tr('Bestätigen', 'Confirm')}</button>
            </div>
          </>
        ) : (
          <>
            <p class="muted small">{tr('Schützt dein Konto mit einem zusätzlichen Code aus einer Authenticator-App.', 'Protects your account with an extra code from an authenticator app.')}</p>
            <div><button type="button" class="hb primary" onClick={async () => { const d = await act(() => api.get<{ qr_base64: string; secret: string }>('/api/auth/mfa/setup')); if (d) setMfa(d); }}>{tr('Einrichten', 'Set up')}</button></div>
          </>
        )}
      </Card>
      <Card title={tr('Add-on & Abmelden', 'Add-on & sign out')} icon="key"><AccountPanel /></Card>
    </Grid2>
  );
}

// ------------------------------------------------------------------ notifications

const CHANNELS: { id: string; label: string; hint: string }[] = [
  { id: 'smtp', label: 'E-Mail', hint: 'name@example.org' },
  { id: 'discord', label: 'Discord', hint: 'Webhook-URL' },
  { id: 'teams', label: 'Microsoft Teams', hint: 'Webhook-URL' },
  { id: 'telegram', label: 'Telegram', hint: 'BOT_TOKEN:CHAT_ID' },
  { id: 'ntfy', label: 'ntfy', hint: 'https://ntfy.sh/topic' },
  { id: 'pushover', label: 'Pushover', hint: 'User-Key' },
];

function Notifications() {
  const tr = t.value;
  const data = useAsync(() => api.get<Record<string, { enabled?: string | boolean; url?: string }>>('/api/user/notifications'), []);
  const [cfg, setCfg] = useState<Record<string, { enabled: boolean; url: string }>>({});
  useEffect(() => {
    if (!data.data) return;
    const next: Record<string, { enabled: boolean; url: string }> = {};
    for (const c of CHANNELS) {
      const v = data.data[c.id];
      next[c.id] = { enabled: !!v && String(v.enabled) !== 'False' && String(v.enabled) !== 'false', url: v?.url || '' };
    }
    setCfg(next);
  }, [data.data]);
  if (!data.data) return <Loading error={data.error} retry={data.reload} />;
  return (
    <Card title={tr('Kanäle', 'Channels')} icon="bell" actions={
      <button type="button" class="hb primary sm" onClick={() => act(() => api.post('/api/user/notifications', Object.fromEntries(Object.entries(cfg).filter(([, v]) => v.url).map(([k, v]) => [k, { enabled: v.enabled ? 'true' : 'false', url: v.url }]))), tr('Gespeichert', 'Saved'))}>
        <Icon name="save" size={14} /> {tr('Speichern', 'Save')}</button>}>
      <p class="muted small">{tr('Wohin Homy Meldungen schickt (z. B. Widget-Alarme, Jobs).', 'Where Homy sends alerts (e.g. widget alarms, jobs).')}</p>
      <table class="tbl">
        <tbody>
          {CHANNELS.map((c) => (
            <tr key={c.id}>
              <td style={{ width: '60px' }}><Toggle label="" checked={!!cfg[c.id]?.enabled} onChange={(v) => setCfg({ ...cfg, [c.id]: { ...cfg[c.id], enabled: v } })} /></td>
              <td style={{ width: '140px' }}>{c.label}</td>
              <td><input class="grow" style={{ width: '100%' }} placeholder={c.hint} value={cfg[c.id]?.url || ''} onInput={(e) => setCfg({ ...cfg, [c.id]: { ...cfg[c.id], url: (e.target as HTMLInputElement).value } })} /></td>
              <td class="acts"><button type="button" class="hb sm" disabled={!cfg[c.id]?.url} onClick={() => act(async () => {
                const r = await api.post<{ ok: boolean; message: string }>('/api/user/notifications/test', { channel: c.id, config: { url: cfg[c.id].url, enabled: 'true' } });
                if (!r.ok) throw new Error(r.message);
                return r;
              }, tr('Testnachricht gesendet', 'Test sent'))}>{tr('Test', 'Test')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ------------------------------------------------------------------ media

interface Asset { id: number; category: string; original_name: string; mime_type: string; size_bytes: number; url: string; is_global: boolean; created_at: string; can_edit?: boolean; user_id?: number | null }

export function Media({ scope }: { scope: 'mine' | 'all' }) {
  const tr = t.value;
  const [cat, setCat] = useState('');
  const list = useAsync(() => api.get<Asset[]>(`/api/assets?scope=${scope === 'all' ? 'global' : 'mine'}${cat ? `&category=${cat}` : ''}`), [cat, scope]);
  const paged = usePaged(list.data || []);
  const isAdmin = user.value?.role === 'admin';
  const [upCat, setUpCat] = useState('background');
  const upload = async (file: File | null | undefined) => {
    if (!file) return;
    await act(() => api.upload('/api/assets', file, { category: upCat, is_global: scope === 'all' ? 'true' : 'false' }), tr('Hochgeladen', 'Uploaded'));
    void list.reload();
  };
  const cats = [{ value: '', label: tr('Alle', 'All') }, { value: 'background', label: tr('Hintergründe', 'Backgrounds') }, { value: 'icon', label: 'Icons' }, { value: 'avatar', label: tr('Profilbilder', 'Avatars') }];
  return (
    <Card title={scope === 'all' ? tr('Globale Medien (für alle)', 'Global media (for everyone)') : tr('Meine Medien', 'My media')} icon="image" actions={<>
      <Choice value={upCat} onChange={setUpCat} options={cats.slice(1)} />
      <button type="button" class="hb primary sm" onClick={async () => upload(await pickFile('image/*'))}><Icon name="upload" size={14} /> {tr('Hochladen', 'Upload')}</button>
    </>}>
      <div class="toolbar"><Choice value={cat} onChange={setCat} options={cats} /></div>
      {!list.data ? <Loading error={list.error} retry={list.reload} /> : (
        <>
          <div class="thumbs" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer?.files?.[0]); }}>
            {paged.slice.map((a) => (
              <div key={a.id} class="thumb" title={`${a.original_name} · ${fmtBytes(a.size_bytes)} · ${fmtDate(a.created_at, getHost().locale)}`}>
                <img src={a.url} alt="" loading="lazy" />
                <span>{a.original_name} {a.is_global && <small>(global)</small>}</span>
                {(a.can_edit || isAdmin) && (
                  <button type="button" class="ico" title={tr('Löschen', 'Delete')} onClick={async () => {
                    if (!confirm(tr(`„${a.original_name}“ löschen?`, `Delete "${a.original_name}"?`))) return;
                    await act(() => api.del(`/api/assets/${a.id}`), tr('Gelöscht', 'Deleted'));
                    void list.reload();
                  }}><Icon name="trash" size={12} /></button>
                )}
              </div>
            ))}
          </div>
          {!paged.total && <p class="muted">{tr('Noch keine Medien. Datei hierher ziehen oder „Hochladen“.', 'No media yet. Drop a file here or use "Upload".')}</p>}
          <Pager {...paged} />
        </>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ backup

function Backup() {
  const tr = t.value;
  const [layout, setLayout] = useState<'auto' | 'mobile' | 'public'>('auto');
  return (
    <Grid2>
      <Card title={tr('Layout sichern & wiederherstellen', 'Back up & restore layout')} icon="archive">
        <p class="muted small">{tr('Tabs, Widgets und Favoriten als JSON-Datei. Beim Import wird das gewählte Layout ersetzt.', 'Tabs, widgets and favorites as a JSON file. Importing replaces the selected layout.')}</p>
        <Segmented value={layout} onChange={setLayout} options={[{ value: 'auto', label: 'Desktop' }, { value: 'mobile', label: tr('Mobil', 'Mobile') },
          ...(user.value?.role === 'admin' ? [{ value: 'public' as const, label: tr('Öffentlich', 'Public') }] : [])]} />
        <div class="row">
          <button type="button" class="hb" onClick={async () => {
            const d = await act(() => api.get(`/api/layout/export?layout=${layout}`));
            if (d) api.downloadJson(d, `homy-layout-${layout}-${new Date().toISOString().slice(0, 10)}.json`);
          }}><Icon name="download" size={14} /> {tr('Exportieren', 'Export')}</button>
          <button type="button" class="hb" onClick={async () => {
            const f = await pickFile('application/json,.json');
            if (!f) return;
            let data: unknown;
            try { data = JSON.parse(await f.text()); } catch { alert(tr('Keine gültige JSON-Datei.', 'Not a valid JSON file.')); return; }
            if (!confirm(tr('Aktuelles Layout durch die Datei ersetzen?', 'Replace the current layout with the file?'))) return;
            const ok = await act(() => api.post(`/api/layout/import?layout=${layout}`, data), tr('Importiert', 'Imported'));
            if (ok !== undefined) void reload();
          }}><Icon name="upload" size={14} /> {tr('Importieren', 'Import')}</button>
        </div>
      </Card>
    </Grid2>
  );
}
