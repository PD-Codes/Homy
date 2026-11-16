import { useMemo, useState } from 'preact/hooks';
import { Icon } from '@/ui/icons';
import { Badge, Card, Choice, Dialog, Field, Loading, Page, Pager, Text, Toggle, act, useAsync, usePaged } from '@/ui/kit';
import { t, user } from '@/ui/store';
import { api } from './api';

interface TypeField { type: string; label: string; default?: unknown; options?: (string | { value: string; label: string })[]; help?: string; placeholder?: string }
interface IType { id: string; name: string; icon?: string; fields: Record<string, TypeField> }
interface Integ { id: number; name: string; type: string; type_name?: string; config: Record<string, unknown>; enabled: boolean; is_global: boolean }

const YES_NO = new Set(['Ja', 'Nein']);

function FieldInput({ name, f, value, onChange }: { name: string; f: TypeField; value: unknown; onChange: (v: unknown) => void }) {
  const str = value === undefined || value === null ? '' : String(value);
  const opts = (f.options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  if (f.type === 'select' && opts.length && opts.every((o) => YES_NO.has(String(o.value)))) {
    return <Toggle checked={(str || String(f.default ?? '')) === 'Ja'} onChange={(v) => onChange(v ? 'Ja' : 'Nein')} label={f.label} />;
  }
  if (f.type === 'select') {
    return <Field label={f.label} hint={f.help}><Choice value={str || String(f.default ?? '')} onChange={onChange} options={opts.map((o) => ({ value: String(o.value), label: o.label }))} /></Field>;
  }
  if (f.type === 'textarea') {
    return <Field label={f.label} hint={f.help}><textarea rows={4} value={str} onInput={(e) => onChange((e.target as HTMLTextAreaElement).value)} /></Field>;
  }
  return (
    <Field label={f.label} hint={f.help}>
      <Text type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : 'text'} name={name}
        autoComplete={f.type === 'password' ? 'new-password' : 'off'} placeholder={f.placeholder || (f.default ? String(f.default) : '')}
        value={str} onInput={onChange} />
    </Field>
  );
}

function Editor({ types, item, onClose, onSaved }: { types: IType[]; item: Partial<Integ>; onClose: () => void; onSaved: () => void }) {
  const tr = t.value;
  const isAdmin = user.value?.role === 'admin';
  const [type, setType] = useState(item.type || types[0]?.id || '');
  const [name, setName] = useState(item.name || '');
  const [global, setGlobal] = useState(!!item.is_global);
  const def = types.find((x) => x.id === type);
  const [config, setConfig] = useState<Record<string, unknown>>(() => {
    const base: Record<string, unknown> = {};
    for (const [k, f] of Object.entries(def?.fields || {})) if (f.default !== undefined) base[k] = f.default;
    return { ...base, ...(item.config || {}) };
  });
  const [test, setTest] = useState<{ ok: boolean; message?: string } | null>(null);

  const save = async (andTest = false) => {
    const body = { name: name.trim() || def?.name || type, type, config, is_global: global };
    const saved = await act(() => (item.id ? api.put<Integ>(`/api/integrations/${item.id}`, body) : api.post<Integ>('/api/integrations', body)), andTest ? undefined : tr('Gespeichert', 'Saved'));
    if (!saved) return;
    onSaved();
    if (andTest) {
      try {
        const r = await api.get<{ ok?: boolean; message?: string }>(`/api/integrations/${saved.id}/fetch`);
        setTest({ ok: r.ok !== false, message: r.message || tr('Verbindung erfolgreich', 'Connection OK') });
      } catch (e) { setTest({ ok: false, message: (e as Error).message }); }
      if (!item.id) item.id = saved.id;
      return;
    }
    onClose();
  };

  return (
    <Dialog wide title={item.id ? tr('Integration bearbeiten', 'Edit integration') : tr('Integration hinzufügen', 'Add integration')} onClose={onClose}
      footer={<>
        {test && <span class={test.ok ? 'ok-c' : 'err-c'} style={{ marginRight: 'auto', fontSize: '13px' }}><Icon name={test.ok ? 'ok' : 'fail'} size={14} /> {test.message}</span>}
        <button type="button" class="hb" onClick={onClose}>{tr('Schließen', 'Close')}</button>
        <button type="button" class="hb" onClick={() => save(true)}><Icon name="zap" size={14} /> {tr('Speichern & testen', 'Save & test')}</button>
        <button type="button" class="hb primary" onClick={() => save(false)}>{tr('Speichern', 'Save')}</button>
      </>}>
      <div class="form-grid">
        <Field label={tr('Typ', 'Type')}>
          <select value={type} disabled={!!item.id} onChange={(e) => { setType((e.target as HTMLSelectElement).value); setTest(null); }}>
            {types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </Field>
        <Field label={tr('Name', 'Name')}><Text value={name} onInput={setName} placeholder={def?.name} /></Field>
      </div>
      {isAdmin && <Toggle checked={global} onChange={setGlobal} label={tr('Global (für alle Benutzer nutzbar)', 'Global (usable by all users)')} />}
      <div class="form-grid">
        {Object.entries(def?.fields || {}).map(([k, f]) => (
          <FieldInput key={`${type}-${k}`} name={k} f={f} value={config[k]} onChange={(v) => setConfig({ ...config, [k]: v })} />
        ))}
      </div>
      {item.id && <p class="muted small">{tr('Passwörter bleiben unverändert, solange ******** stehen bleibt.', 'Passwords stay unchanged while ******** is kept.')}</p>}
    </Dialog>
  );
}

export function IntegrationsPage() {
  const tr = t.value;
  const types = useAsync(() => api.get<IType[]>('/api/integrations/types'), []);
  const list = useAsync(() => api.get<Integ[]>('/api/integrations'), []);
  const [edit, setEdit] = useState<Partial<Integ> | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Record<number, { ok: boolean; message?: string } | 'busy'>>({});
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (list.data || []).filter((i) => !n || `${i.name} ${i.type} ${i.type_name}`.toLowerCase().includes(n));
  }, [list.data, q]);
  const paged = usePaged(filtered);
  const typeOf = (id: string) => types.data?.find((x) => x.id === id);

  const testOne = async (i: Integ) => {
    setStatus((s) => ({ ...s, [i.id]: 'busy' }));
    try {
      const r = await api.get<{ ok?: boolean; message?: string }>(`/api/integrations/${i.id}/fetch`);
      setStatus((s) => ({ ...s, [i.id]: { ok: r.ok !== false, message: r.message } }));
    } catch (e) { setStatus((s) => ({ ...s, [i.id]: { ok: false, message: (e as Error).message } })); }
  };
  const testAll = () => { for (const i of filtered) void testOne(i); };

  return (
    <Page title={tr('Integrationen', 'Integrations')} icon="plug" actions={<>
      <button type="button" class="hb" onClick={testAll} disabled={!filtered.length}><Icon name="zap" size={14} /> {tr('Alle testen', 'Test all')}</button>
      <button type="button" class="hb primary" disabled={!types.data} onClick={() => setEdit({})}><Icon name="plus" size={14} /> {tr('Integration', 'Integration')}</button>
    </>}>
      <Card>
        <div class="toolbar"><input class="grow" placeholder={tr('Suchen …', 'Search …')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} /></div>
        {!list.data ? <Loading error={list.error} retry={list.reload} /> : (
          <>
            <table class="tbl">
              <thead><tr><th>{tr('Name', 'Name')}</th><th>{tr('Typ', 'Type')}</th><th>{tr('Status', 'Status')}</th><th>{tr('Aktiv', 'Enabled')}</th><th /></tr></thead>
              <tbody>
                {paged.slice.map((i) => {
                  const st = status[i.id];
                  return (
                    <tr key={i.id}>
                      <td><span class="cell-main"><span class="fav-ico"><Icon name={typeOf(i.type)?.icon || 'plug'} size={16} /></span> {i.name} {i.is_global && <Badge tone="primary">global</Badge>}</span></td>
                      <td>{i.type_name || i.type}</td>
                      <td>{st === 'busy' ? <span class="spin" /> : st ? <span class={st.ok ? 'ok-c' : 'err-c'} title={st.message}><Icon name={st.ok ? 'ok' : 'fail'} size={14} /> <span class="ellip" style={{ maxWidth: '260px' }}>{st.message || (st.ok ? 'OK' : '')}</span></span> : <span class="muted">–</span>}</td>
                      <td><Toggle checked={i.enabled} label="" onChange={async (v) => { await act(() => api.put(`/api/integrations/${i.id}`, { enabled: v })); void list.reload(); }} /></td>
                      <td class="acts">
                        <button type="button" class="ico" title={tr('Testen', 'Test')} onClick={() => testOne(i)}><Icon name="zap" size={13} /></button>
                        <button type="button" class="ico" title={tr('Bearbeiten', 'Edit')} onClick={() => setEdit(i)}><Icon name="pencil" size={13} /></button>
                        <button type="button" class="ico danger" title={tr('Löschen', 'Delete')} onClick={async () => {
                          if (!confirm(tr(`„${i.name}“ löschen? Widgets, die sie nutzen, zeigen dann einen Fehler.`, `Delete "${i.name}"? Widgets using it will show an error.`))) return;
                          await act(() => api.del(`/api/integrations/${i.id}`), tr('Gelöscht', 'Deleted'));
                          void list.reload();
                        }}><Icon name="trash" size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
                {!paged.slice.length && <tr><td colSpan={5} class="muted">{tr('Noch keine Integration. Lege z. B. Pi-hole, Proxmox oder Zabbix an und nutze sie dann in Widgets.', 'No integrations yet. Add e.g. Pi-hole, Proxmox or Zabbix and use them in widgets.')}</td></tr>}
              </tbody>
            </table>
            <Pager {...paged} />
          </>
        )}
      </Card>
      {edit && types.data && <Editor types={types.data} item={edit} onClose={() => setEdit(null)} onSaved={() => list.reload()} />}
    </Page>
  );
}
