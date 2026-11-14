import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { cfgBool, cfgStr, defineModule } from '@/sdk';
import type { Favorite, WidgetProps } from '@/sdk';
import { Icon } from '@/ui/icons';
import { ENGINES, searchUrl } from '@/ui/search';

function SearchBar({ config, ctx }: WidgetProps) {
  const engine = cfgStr(config, 'engine', 'duckduckgo');
  const custom = cfgStr(config, 'custom_url');
  const withFavs = cfgBool(config, 'search_favorites', true);
  const autofocus = cfgBool(config, 'autofocus', true);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(-1);
  const [links, setLinks] = useState<Favorite[]>([]);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autofocus && !ctx.editing) input.current?.focus({ preventScroll: true });
  }, [autofocus, ctx.editing]);
  useEffect(() => {
    if (!withFavs) return;
    const sources = [ctx.host.favorites?.(), ctx.host.bookmarks?.()].filter(Boolean) as Promise<Favorite[]>[];
    void Promise.all(sources.map((p) => p.catch(() => []))).then((all) => setLinks(all.flat()));
  }, [withFavs]);

  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n || !withFavs) return [];
    const seen = new Set<string>();
    return links.filter((l) => {
      if (seen.has(l.url) || !`${l.title} ${l.url}`.toLowerCase().includes(n)) return false;
      seen.add(l.url);
      return true;
    }).slice(0, 6);
  }, [q, links, withFavs]);
  useEffect(() => setSel(-1), [q]);

  const go = () => {
    const pick = sel >= 0 ? hits[sel] : null;
    if (pick) { ctx.openUrl(pick.url); return; }
    const text = q.trim();
    if (!text) return;
    if (/^https?:\/\/\S+$/i.test(text) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(text) && !text.includes(' ')) {
      ctx.openUrl(/^https?:/i.test(text) ? text : `https://${text}`);
      return;
    }
    ctx.openUrl(searchUrl(text, engine, custom));
  };

  const label = engine === 'custom' ? ctx.t('Suche', 'Search') : (ENGINES[engine] || ENGINES.duckduckgo).label;
  return (
    <form class="m-search" onSubmit={(e) => { e.preventDefault(); go(); }}>
      <div class="m-search-box">
        <Icon name="search" size={17} />
        <input ref={input} value={q} placeholder={ctx.t(`Mit ${label} suchen oder URL eingeben`, `Search ${label} or type a URL`)}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
            if (e.key === 'ArrowUp' && hits.length) { e.preventDefault(); setSel((s) => Math.max(s - 1, -1)); }
            if (e.key === 'Escape') { setQ(''); (e.target as HTMLInputElement).blur(); }
          }} aria-label={ctx.t('Suche', 'Search')} autoComplete="off" spellcheck={false} />
      </div>
      {focused && !!hits.length && (
        <ul class="m-search-hits">
          {hits.map((h, i) => (
            <li key={h.url} class={i === sel ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); ctx.openUrl(h.url); }}>
              <Icon name="link" size={13} /> <span>{h.title}</span> <small>{h.url.replace(/^https?:\/\//, '').slice(0, 48)}</small>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

defineModule({
  type: 'search_bar',
  name: { de: 'Suche', en: 'Search' },
  description: { de: 'Websuche, URLs und Favoriten in einem Feld', en: 'Web search, URLs and favorites in one box' },
  icon: 'search',
  category: 'essentials',
  size: { w: 24, h: 2 },
  chromeless: true,
  schema: [
    { key: 'engine', type: 'select', label: 'Suchmaschine', default: 'duckduckgo', options: [...Object.entries(ENGINES).map(([value, e]) => ({ value, label: e.label })), { value: 'custom', label: 'Eigene URL' }] },
    { key: 'custom_url', type: 'text', label: 'Eigene Such-URL (%s = Suchbegriff)', default: '', placeholder: 'https://example.org/search?q=%s' },
    { key: 'search_favorites', type: 'toggle', label: 'Favoriten mit durchsuchen', default: 'Ja', on: 'Ja', off: 'Nein' },
    { key: 'autofocus', type: 'toggle', label: 'Automatisch fokussieren', default: 'Ja', on: 'Ja', off: 'Nein' },
  ],
  component: SearchBar,
});
