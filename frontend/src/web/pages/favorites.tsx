import { useMemo, useState } from 'preact/hooks';
import type { Favorite } from '@/sdk';
import { Icon } from '@/ui/icons';
import { Card, Choice, Dialog, Field, Loading, Page, Pager, Segmented, Text, Toggle, act, useAsync, usePaged } from '@/ui/kit';
import { t, user } from '@/ui/store';
import { api } from './api';

interface Fav extends Favorite { is_private?: boolean; user_id?: number | null }

function FavIcon({ f }: { f: Fav }) {
  const [broken, setBroken] = useState(false);
  if (f.icon_type === 'icon' && f.icon_value && !['auto', 'link'].includes(f.icon_value)) return <span class="fav-ico"><Icon name={f.icon_value} size={16} /></span>;
  const src = f.icon_type === 'image' && f.icon_value ? f.icon_value
    : f.icon_type === 'asset' && f.icon_value ? `/api/assets/${f.icon_value}/file` : `/api/favicon?url=${encodeURIComponent(f.url)}`;
  if (broken) return <span class="fav-ico fav-letter">{(f.title || '?').charAt(0).toUpperCase()}</span>;
  return <span class="fav-ico"><img src={src} alt="" loading="lazy" onError={() => setBroken(true)} /></span>;
}

function Editor({ fav, categories, isPublic, onClose, onSaved }: {
  fav: Partial<Fav>; categories: string[]; isPublic: boolean; onClose: () => void; onSaved: () => void;
}) {
  const tr = t.value;
  const [f, setF] = useState<Partial<Fav>>({ icon_type: 'auto', ...fav });
  const set = (p: Partial<Fav>) => setF({ ...f, ...p });
  const save = async () => {
    const url = (f.url || '').trim();
    const body = {
      title: (f.title || '').trim() || url.replace(/^https?:\/\//, ''),
      url: /^https?:\/\//i.test(url) ? url : `https://${url}`,
      category: (f.category || '').trim() || 'General',
      icon_type: f.icon_type || 'auto', icon_value: f.icon_value || '',
      is_private: !!f.is_private, is_public: isPublic,
    };
    const ok = await act(() => (f.id !== undefined ? api.put(`/api/favorites/${f.id}`, body) : api.post('/api/favorites', body)), tr('Gespeichert', 'Saved'));
    if (ok !== undefined) { onSaved(); onClose(); }
  };
  return (
    <Dialog title={f.id !== undefined ? tr('Favorit bearbeiten', 'Edit favorite') : tr('Favorit hinzufügen', 'Add favorite')} onClose={onClose}
      footer={<><button type="button" class="hb" onClick={onClose}>{tr('Abbrechen', 'Cancel')}</button><button type="button" class="hb primary" disabled={!f.url} onClick={save}>{tr('Speichern', 'Save')}</button></>}>
      <Field label="URL"><Text value={f.url} onInput={(v) => set({ url: v })} placeholder="https://…" /></Field>
      <Field label={tr('Titel', 'Title')}><Text value={f.title} onInput={(v) => set({ title: v })} /></Field>
      <Field label={tr('Kategorie', 'Category')}>
        <Text value={f.category} onInput={(v) => set({ category: v })} list="fav-cats" />
        <datalist id="fav-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      </Field>
      <Field label={tr('Symbol', 'Icon')}>
        <Segmented value={(f.icon_type || 'auto') as 'auto' | 'icon' | 'image'} onChange={(v) => set({ icon_type: v, icon_value: v === 'auto' ? '' : f.icon_value })}
          options={[{ value: 'auto', label: 'Favicon' }, { value: 'icon', label: tr('Symbol', 'Icon') }, { value: 'image', label: tr('Bild-URL', 'Image URL') }]} />
      </Field>
      {f.icon_type === 'icon' && <Field label={tr('Lucide-Name (z. B. server, shield, tv)', 'Lucide name (e.g. server, shield, tv)')}><Text value={f.icon_value} onInput={(v) => set({ icon_value: v })} /></Field>}
      {f.icon_type === 'image' && <Field label={tr('Bild-URL', 'Image URL')}><Text value={f.icon_value} onInput={(v) => set({ icon_value: v })} placeholder="https://…/icon.png" /></Field>}
      {!isPublic && <Toggle checked={!!f.is_private} onChange={(v) => set({ is_private: v })} label={tr('Privat (nicht in Exporten/Vorlagen)', 'Private (excluded from exports/templates)')} />}
    </Dialog>
  );
}

export function FavoritesPage() {
  const tr = t.value;
  const isAdmin = user.value?.role === 'admin';
  const [scope, setScope] = useState<'mine' | 'public'>('mine');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [edit, setEdit] = useState<Partial<Fav> | null>(null);
  const [sortCats, setSortCats] = useState(false);
  const list = useAsync(() => api.get<Fav[]>(`/api/favorites?layout=${scope === 'public' ? 'public' : 'auto'}`), [scope]);
  const order = useAsync(() => api.get<{ order: string[] }>('/api/favorites/category-order'), []);

  const categories = useMemo(() => {
    const set = new Set((list.data || []).map((f) => f.category || 'General'));
    const ord = order.data?.order || [];
    return [...set].sort((a, b) => (ord.indexOf(a) < 0 ? 999 : ord.indexOf(a)) - (ord.indexOf(b) < 0 ? 999 : ord.indexOf(b)) || a.localeCompare(b));
  }, [list.data, order.data]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (list.data || [])
      .filter((f) => (!cat || (f.category || 'General') === cat) && (!n || `${f.title} ${f.url} ${f.category}`.toLowerCase().includes(n)))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [list.data, q, cat]);
  const paged = usePaged(filtered);

  const move = async (f: Fav, dir: -1 | 1) => {
    const all = (list.data || []).filter((x) => (x.category || 'General') === (f.category || 'General')).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const i = all.findIndex((x) => x.id === f.id);
    const other = all[i + dir];
    if (!other) return;
    await act(async () => {
      await api.put(`/api/favorites/${f.id}`, { order: other.order ?? 0 });
      await api.put(`/api/favorites/${other.id}`, { order: f.order ?? 0 });
    });
    void list.reload();
  };

  const remove = async (f: Fav) => {
    if (!confirm(tr(`„${f.title}“ löschen?`, `Delete "${f.title}"?`))) return;
    await act(() => api.del(`/api/favorites/${f.id}`), tr('Gelöscht', 'Deleted'));
    void list.reload();
  };


  return (
    <Page title={tr('Favoriten', 'Favorites')} icon="star" actions={<>
      {isAdmin && <Segmented value={scope} onChange={setScope} options={[{ value: 'mine', label: tr('Meine', 'Mine') }, { value: 'public', label: tr('Öffentlich', 'Public') }]} />}
      <button type="button" class="hb" onClick={() => setSortCats(true)}><Icon name="list-ordered" size={14} /> {tr('Kategorien sortieren', 'Sort categories')}</button>
      <button type="button" class="hb primary" onClick={() => setEdit({ category: cat })}><Icon name="plus" size={14} /> {tr('Favorit', 'Favorite')}</button>
    </>}>
      <Card>
        <div class="toolbar">
          <input class="grow" placeholder={tr('Suchen …', 'Search …')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          <Choice value={cat} onChange={setCat} options={[{ value: '', label: tr('Alle Kategorien', 'All categories') }, ...categories.map((c) => ({ value: c, label: c }))]} />
        </div>
        {!list.data ? <Loading error={list.error} retry={list.reload} /> : (
          <>
            <table class="tbl">
              <thead><tr><th>{tr('Titel', 'Title')}</th><th>URL</th><th>{tr('Kategorie', 'Category')}</th><th /></tr></thead>
              <tbody>
                {paged.slice.map((f) => (
                  <tr key={f.id}>
                    <td><span class="cell-main"><FavIcon f={f} /> {f.title} {f.is_private && <Icon name="lock" size={12} />}</span></td>
                    <td><a class="ellip" href={f.url} target="_blank" rel="noopener noreferrer">{f.url.replace(/^https?:\/\//, '')}</a></td>
                    <td>{f.category || 'General'}</td>
                    <td class="acts">
                      <button type="button" class="ico" title={tr('Nach oben', 'Up')} onClick={() => move(f, -1)}><Icon name="arrow-up" size={13} /></button>
                      <button type="button" class="ico" title={tr('Nach unten', 'Down')} onClick={() => move(f, 1)}><Icon name="arrow-down" size={13} /></button>
                      <button type="button" class="ico" title={tr('Bearbeiten', 'Edit')} onClick={() => setEdit(f)}><Icon name="pencil" size={13} /></button>
                      <button type="button" class="ico danger" title={tr('Löschen', 'Delete')} onClick={() => remove(f)}><Icon name="trash" size={13} /></button>
                    </td>
                  </tr>
                ))}
                {!paged.slice.length && <tr><td colSpan={4} class="muted">{tr('Keine Favoriten.', 'No favorites.')}</td></tr>}
              </tbody>
            </table>
            <Pager {...paged} />
          </>
        )}
      </Card>
      {edit && <Editor fav={edit} categories={categories} isPublic={scope === 'public'} onClose={() => setEdit(null)} onSaved={() => list.reload()} />}
      {sortCats && <CategorySorter categories={categories} onClose={() => setSortCats(false)} onSaved={() => order.reload()} />}
    </Page>
  );
}

function CategorySorter({ categories, onClose, onSaved }: { categories: string[]; onClose: () => void; onSaved: () => void }) {
  const tr = t.value;
  const [list, setList] = useState(categories);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  return (
    <Dialog title={tr('Kategorien sortieren', 'Sort categories')} onClose={onClose} footer={<>
      <button type="button" class="hb" onClick={onClose}>{tr('Abbrechen', 'Cancel')}</button>
      <button type="button" class="hb primary" onClick={async () => { await act(() => api.put('/api/favorites/category-order', { order: list }), tr('Gespeichert', 'Saved')); onSaved(); onClose(); }}>{tr('Speichern', 'Save')}</button>
    </>}>
      <ul class="tab-list">
        {list.map((c, i) => (
          <li key={c}><span style={{ flex: 1 }}>{c}</span>
            <button type="button" class="ico" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="arrow-up" size={13} /></button>
            <button type="button" class="ico" disabled={i === list.length - 1} onClick={() => move(i, 1)}><Icon name="arrow-down" size={13} /></button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
