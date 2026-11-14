import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from './icons';
import {
  catalogEntry, drawer, editing, favorites, focusWidget, getHost, paletteOpen, refreshAll, saveUi, selectTab, t,
  tabs, ui, widgets,
} from './store';
import { THEMES } from './theme';
import { searchUrl } from './search';

interface Item { id: string; icon: string; label: string; hint?: string; run: () => void }

export function Palette() {
  const tr = t.value;
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const close = () => { paletteOpen.value = false; };

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const all: Item[] = [
      ...tabs.value.map((x, i) => ({ id: `tab:${x.id}`, icon: 'layers', label: x.name, hint: `Tab ${i + 1}`, run: () => selectTab(x.id) })),
      ...favorites.value.map((f) => ({ id: `fav:${f.id}`, icon: 'link', label: f.title, hint: f.category || new URL(f.url, location.href).host, run: () => { location.href = f.url; } })),
      ...widgets.value.map((w) => {
        const e = catalogEntry(w.type);
        return { id: `w:${w.id}`, icon: e?.icon || 'box', label: w.title || e?.name || w.type, hint: tabs.value.find((x) => x.id === w.tab_id)?.name, run: () => focusWidget(w.id) };
      }),
      { id: 'a:edit', icon: 'pencil', label: tr('Bearbeiten an/aus', 'Toggle edit mode'), hint: 'E', run: () => { editing.value = !editing.value; } },
      { id: 'a:add', icon: 'plus', label: tr('Widget hinzufügen', 'Add widget'), hint: 'A', run: () => { editing.value = true; drawer.value = { kind: 'add' }; } },
      { id: 'a:settings', icon: 'settings', label: tr('Einstellungen', 'Settings'), run: () => { drawer.value = { kind: 'settings' }; } },
      { id: 'a:refresh', icon: 'refresh', label: tr('Alles aktualisieren', 'Refresh everything'), hint: 'R', run: refreshAll },
      { id: 'a:fit', icon: 'maximize', label: tr('An Bildschirm anpassen umschalten', 'Toggle fit to screen'), run: () => saveUi({ fitToScreen: !ui.value.fitToScreen }) },
      ...Object.entries(THEMES).map(([id, th]) => ({ id: `theme:${id}`, icon: 'sun', label: `Theme: ${th.label}`, run: () => saveUi({ theme: id }) })),
      ...(getHost().menuLinks?.() || []).map((l) => ({ id: `link:${l.href}`, icon: l.icon, label: l.label, run: () => { location.href = l.href; } })),
    ];
    const hits = needle ? all.filter((i) => `${i.label} ${i.hint || ''}`.toLowerCase().includes(needle)) : all.slice(0, 12);
    if (needle) {
      const looksLikeUrl = /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(needle) || /^https?:\/\//.test(needle);
      if (looksLikeUrl) hits.unshift({ id: 'go', icon: 'globe', label: tr(`Öffnen: ${q}`, `Open: ${q}`), run: () => { location.href = /^https?:/.test(q) ? q : `https://${q}`; } });
      hits.push({ id: 'web', icon: 'search', label: tr(`Im Web suchen: ${q}`, `Search the web: ${q}`), hint: 'Enter', run: () => { location.href = searchUrl(q); } });
    }
    return hits.slice(0, 40);
  }, [q, tabs.value, favorites.value, widgets.value]);

  useEffect(() => setSel(0), [q]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const it = items[sel];
      if (it) { close(); it.run(); }
    }
  };

  return (
    <div class="palette-backdrop" onClick={close}>
      <div class="palette" onClick={(e) => e.stopPropagation()} role="dialog">
        <div class="palette-in">
          <Icon name="search" />
          <input ref={input} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} onKeyDown={onKey}
            placeholder={tr('Tabs, Favoriten, Widgets, Befehle – oder im Web suchen', 'Tabs, favorites, widgets, commands – or search the web')} />
          <kbd>Esc</kbd>
        </div>
        <ul>
          {items.map((it, i) => (
            <li key={it.id} class={i === sel ? 'on' : ''} onMouseEnter={() => setSel(i)} onClick={() => { close(); it.run(); }}>
              <Icon name={it.icon} size={15} /> <span>{it.label}</span> {it.hint && <small>{it.hint}</small>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
