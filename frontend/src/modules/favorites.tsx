import { useEffect, useMemo, useState } from 'preact/hooks';
import { cfgBool, cfgStr, defineModule } from '@/sdk';
import type { Favorite, WidgetContext, WidgetProps } from '@/sdk';
import { Icon } from '@/ui/icons';

type Source = 'homy' | 'local' | 'bookmarks' | 'topsites';

function resolveSource(config: Record<string, unknown>, ctx: WidgetContext): Source {
  const s = cfgStr(config, 'source', 'auto');
  if (s === 'homy' || s === 'local' || s === 'bookmarks' || s === 'topsites') return s;
  return ctx.tabSource === 'local' ? 'local' : 'homy';
}

function FavIcon({ f, ctx }: { f: Favorite; ctx: WidgetContext }) {
  const [src, setSrc] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
  const lucide = f.icon_type === 'icon' && f.icon_value && !['auto', 'link'].includes(f.icon_value) ? f.icon_value : null;
  useEffect(() => {
    let alive = true;
    setBroken(false);
    const pick = async () => {
      if (f.icon_type === 'image' && f.icon_value) return f.icon_value;
      if (f.icon_type === 'asset' && f.icon_value && ctx.host.assetUrl) return ctx.host.assetUrl(String(f.icon_value));
      if (lucide) return null;
      return ctx.host.favicon ? ctx.host.favicon(f.url) : null;
    };
    void Promise.resolve(pick()).then((u) => { if (alive) setSrc(u || null); }).catch(() => alive && setSrc(null));
    return () => { alive = false; };
  }, [f.url, f.icon_type, f.icon_value]);
  if (lucide) return <span class="fav-ico"><Icon name={lucide} size={18} /></span>;
  if (src && !broken) return <span class="fav-ico"><img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /></span>;
  const letter = (f.title || f.url.replace(/^https?:\/\/(www\.)?/, '')).trim().charAt(0).toUpperCase() || '?';
  return <span class="fav-ico fav-letter">{letter}</span>;
}

function Editor({ initial, onSave, onCancel, onDelete, ctx }: {
  initial: Partial<Favorite>; onSave: (f: Partial<Favorite>) => void; onCancel: () => void; onDelete?: () => void; ctx: WidgetContext;
}) {
  const [f, setF] = useState<Partial<Favorite>>(initial);
  return (
    <form class="fav-edit" onSubmit={(e) => {
      e.preventDefault();
      const url = (f.url || '').trim();
      if (!url) return;
      onSave({ ...f, url: /^https?:\/\//i.test(url) ? url : `https://${url}`, title: (f.title || '').trim() || url.replace(/^https?:\/\//, '') });
    }}>
      <input autoFocus placeholder="https://…" value={f.url || ''} onInput={(e) => setF({ ...f, url: (e.target as HTMLInputElement).value })} />
      <input placeholder={ctx.t('Titel', 'Title')} value={f.title || ''} onInput={(e) => setF({ ...f, title: (e.target as HTMLInputElement).value })} />
      <input placeholder={ctx.t('Kategorie', 'Category')} value={f.category || ''} onInput={(e) => setF({ ...f, category: (e.target as HTMLInputElement).value })} />
      <div class="row">
        <button type="submit" class="hb primary sm">{ctx.t('Speichern', 'Save')}</button>
        <button type="button" class="hb sm" onClick={onCancel}>{ctx.t('Abbrechen', 'Cancel')}</button>
        {onDelete && <button type="button" class="hb sm danger" onClick={onDelete}><Icon name="trash" size={13} /></button>}
      </div>
    </form>
  );
}

function Links({ config, ctx }: WidgetProps) {
  const source = resolveSource(config, ctx);
  const filter = cfgStr(config, 'category_filter').trim().toLowerCase();
  const mode = cfgStr(config, 'layout_mode', 'Grid');
  const tile = cfgStr(config, 'tile_size', 'Mittel');
  const grouped = cfgBool(config, 'group_by_category', true);
  const newTab = cfgBool(config, 'open_new_tab', false);
  const [items, setItems] = useState<Favorite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Favorite> | null>(null);
  const [reload, setReload] = useState(0);
  const editable = source === 'local' || (source === 'homy' && !!ctx.host.saveFavorite);

  useEffect(() => {
    let alive = true;
    setError(null);
    const load = async (): Promise<Favorite[]> => {
      if (source === 'local') return ((config.links as Favorite[]) || []).map((l, i) => ({ ...l, id: l.id ?? i }));
      if (source === 'bookmarks') return ctx.host.bookmarks ? ctx.host.bookmarks() : [];
      if (source === 'topsites') return ctx.host.topSites ? ctx.host.topSites() : [];
      return ctx.host.favorites ? ctx.host.favorites() : [];
    };
    load().then((r) => alive && setItems(r)).catch((e) => alive && setError((e as Error).message));
    return () => { alive = false; };
  }, [source, ctx.refreshTick, reload, source === 'local' ? JSON.stringify(config.links) : '']);

  const groups = useMemo(() => {
    const list = (items || []).filter((f) => !filter || (f.category || '').toLowerCase().split(',').map((s) => s.trim()).some((c) => filter.split(',').map((s) => s.trim()).includes(c)));
    if (!grouped) return [['', list]] as [string, Favorite[]][];
    const map = new Map<string, Favorite[]>();
    for (const f of list) {
      const key = f.category || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return [...map.entries()];
  }, [items, filter, grouped]);

  const save = async (f: Partial<Favorite>) => {
    try {
      if (source === 'local') {
        const links = [...((config.links as Favorite[]) || [])];
        const i = links.findIndex((l) => l.id === f.id);
        const row = { id: f.id ?? Date.now(), title: f.title!, url: f.url!, category: f.category || '' };
        if (i >= 0) links[i] = row; else links.push(row);
        ctx.setConfig({ links });
      } else if (ctx.host.saveFavorite) {
        await ctx.host.saveFavorite(f);
        setReload((n) => n + 1);
      }
      setEditing(null);
    } catch (e) { setError((e as Error).message); }
  };
  const remove = async (f: Partial<Favorite>) => {
    try {
      if (source === 'local') ctx.setConfig({ links: ((config.links as Favorite[]) || []).filter((l) => l.id !== f.id) });
      else if (ctx.host.deleteFavorite && f.id !== undefined) { await ctx.host.deleteFavorite(f.id); setReload((n) => n + 1); }
      setEditing(null);
    } catch (e) { setError((e as Error).message); }
  };

  if (error) return <div class="w-state w-error">{error}</div>;
  if (!items) return <div class="w-state"><span class="spin" /></div>;
  if (editing) return <div class="fav-wrap"><Editor ctx={ctx} initial={editing} onSave={save} onCancel={() => setEditing(null)} onDelete={editing.id !== undefined ? () => remove(editing) : undefined} /></div>;

  const sizeCls = tile === 'Klein' ? 'sm' : tile === 'Groß' ? 'lg' : 'md';
  const empty = !groups.some(([, l]) => l.length);
  return (
    <div class={`fav-wrap fav-${mode.toLowerCase()} fav-${sizeCls}`}>
      {empty && !editable && <div class="w-state">{ctx.t('Keine Einträge.', 'No entries.')}</div>}
      {groups.map(([cat, list]) => (
        <div class="fav-group" key={cat}>
          {grouped && cat && <div class="fav-cat">{cat}</div>}
          <div class="fav-items">
            {list.map((f) => (
              <a key={`${f.id}-${f.url}`} class="fav" href={f.url} target={newTab ? '_blank' : undefined} rel={newTab ? 'noopener noreferrer' : undefined}
                title={`${f.title}\n${f.url}${editable ? `\n${ctx.t('Rechtsklick: bearbeiten', 'Right-click: edit')}` : ''}`}
                onContextMenu={editable ? (e) => { e.preventDefault(); setEditing(f); } : undefined}>
                <FavIcon f={f} ctx={ctx} />
                <span class="fav-t">{f.title}</span>
              </a>
            ))}
          </div>
        </div>
      ))}
      {editable && (
        <button type="button" class="fav fav-add" onClick={() => setEditing({ category: filter.split(',')[0] || '' })} title={ctx.t('Link hinzufügen', 'Add link')}>
          <span class="fav-ico"><Icon name="plus" size={16} /></span><span class="fav-t">{ctx.t('Hinzufügen', 'Add')}</span>
        </button>
      )}
    </div>
  );
}

defineModule({
  type: 'favorites',
  name: { de: 'Links & Favoriten', en: 'Links & favorites' },
  description: { de: 'Homy-Favoriten, eigene Links, Browser-Lesezeichen oder meistbesuchte Seiten', en: 'Homy favorites, own links, browser bookmarks or top sites' },
  icon: 'bookmark',
  category: 'essentials',
  size: { w: 12, h: 6 },
  schema: [
    { key: 'source', type: 'select', label: 'Quelle', default: 'auto', options: [
      { value: 'auto', label: 'Automatisch' }, { value: 'homy', label: 'Homy-Favoriten' }, { value: 'local', label: 'Eigene Links (in diesem Widget)' },
      { value: 'bookmarks', label: 'Browser-Lesezeichen (Add-on)' }, { value: 'topsites', label: 'Meistbesucht (Add-on)' },
    ] },
    { key: 'category_filter', type: 'text', label: 'Kategorie-Filter (Komma, leer = alle)', default: '' },
    { key: 'layout_mode', type: 'select', label: 'Anzeige', default: 'Grid', options: [{ value: 'Grid', label: 'Kacheln' }, { value: 'List', label: 'Liste' }, { value: 'Buttons', label: 'Buttons' }] },
    { key: 'tile_size', type: 'select', label: 'Größe', default: 'Mittel', options: [{ value: 'Klein', label: 'Klein' }, { value: 'Mittel', label: 'Mittel' }, { value: 'Groß', label: 'Groß' }] },
    { key: 'group_by_category', type: 'toggle', label: 'Nach Kategorien gruppieren', default: 'Ja', on: 'Ja', off: 'Nein' },
    { key: 'open_new_tab', type: 'toggle', label: 'In neuem Tab öffnen', default: 'Nein', on: 'Ja', off: 'Nein' },
  ],
  component: Links,
});
