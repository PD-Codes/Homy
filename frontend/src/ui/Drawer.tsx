import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CatalogEntry, Category } from '@/sdk';
import { ConfigForm } from './ConfigForm';
import { Icon } from './icons';
import { THEMES } from './theme';
import {
  activeTab, addTab, addWidget, catalog, catalogEntry, drawer, getHost, moveTab, reload, removeTab,
  renameTab, saveUi, t, tabs, ui, widgets,
} from './store';

const CATS: { id: Category | 'all'; de: string; en: string }[] = [
  { id: 'all', de: 'Alle', en: 'All' },
  { id: 'essentials', de: 'Basis', en: 'Essentials' },
  { id: 'productivity', de: 'Produktiv', en: 'Productivity' },
  { id: 'info', de: 'Info', en: 'Info' },
  { id: 'system', de: 'System', en: 'System' },
  { id: 'integration', de: 'Integrationen', en: 'Integrations' },
];

function Picker() {
  const tr = t.value;
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | 'all'>('all');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const tab = activeTab.value;
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return catalog.value.filter((e) => (cat === 'all' || e.category === cat)
      && (!needle || `${e.name} ${e.type} ${e.description || ''} ${(e.integration_types || []).join(' ')}`.toLowerCase().includes(needle)));
  }, [q, cat, catalog.value]);
  const blocked = (e: CatalogEntry) => !!e.needsServer && tab?.source !== 'server';

  return (
    <div class="picker">
      <div class="picker-search">
        <Icon name="search" />
        <input ref={input} value={q} placeholder={tr('Widget suchen …', 'Search widgets …')}
          onInput={(e) => setQ((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { const first = list.find((x) => !blocked(x)); if (first) void addWidget(first); }
          }} />
      </div>
      <div class="chips">
        {CATS.map((c) => (
          <button type="button" key={c.id} class={cat === c.id ? 'chip on' : 'chip'} onClick={() => setCat(c.id)}>{tr(c.de, c.en)}</button>
        ))}
      </div>
      <div class="picker-list">
        {list.map((e) => (
          <button type="button" key={e.type} class="pick" disabled={blocked(e)} onClick={() => addWidget(e)}
            title={blocked(e) ? tr('Nur auf Homy-Tabs (Server) verfügbar', 'Only available on Homy (server) tabs') : e.description || e.name}>
            <span class="pick-ico"><Icon name={e.icon} size={18} /></span>
            <span class="pick-txt">
              <strong>{e.name}</strong>
              <small>{e.description || (e.integration_types?.length ? e.integration_types.join(', ') : e.type)}</small>
            </span>
            <span class="pick-size">{e.size.w}×{e.size.h}</span>
          </button>
        ))}
        {!list.length && <p class="muted pad">{tr('Nichts gefunden.', 'Nothing found.')}</p>}
      </div>
    </div>
  );
}

function ConfigPanel({ id }: { id: string }) {
  const tr = t.value;
  const w = widgets.value.find((x) => x.id === id);
  const entry = w && catalogEntry(w.type);
  if (!w) return <p class="muted pad">{tr('Widget nicht gefunden.', 'Widget not found.')}</p>;
  if (!entry) return <p class="muted pad">{tr('Für diesen Typ gibt es keine Einstellungen.', 'This type has no settings.')}</p>;
  return <ConfigForm w={w} entry={entry} />;
}

function TabManager() {
  const tr = t.value;
  const host = getHost();
  const sources = host.tabSources();
  const [name, setName] = useState('');
  return (
    <div class="set-group">
      <h4>{tr('Tabs', 'Tabs')}</h4>
      <ul class="tab-list">
        {tabs.value.map((x, i) => (
          <li key={x.id}>
            {host.kind === 'extension' && <span class={`src src-${x.source}`} title={x.source === 'server' ? 'Homy' : tr('Lokal', 'Local')}><Icon name={x.source === 'server' ? 'cloud' : 'monitor'} size={13} /></span>}
            <input value={x.name} onChange={(e) => renameTab(x.id, (e.target as HTMLInputElement).value || x.name)} />
            <button type="button" class="ico" disabled={i === 0} onClick={() => moveTab(x.id, -1)} title={tr('Nach links', 'Move left')}>‹</button>
            <button type="button" class="ico" disabled={i === tabs.value.length - 1} onClick={() => moveTab(x.id, 1)} title={tr('Nach rechts', 'Move right')}>›</button>
            <button type="button" class="ico danger" onClick={() => {
              const n = widgets.value.filter((w) => w.tab_id === x.id).length;
              if (!n || confirm(tr(`Tab „${x.name}“ mit ${n} Widgets löschen?`, `Delete tab "${x.name}" with ${n} widgets?`))) void removeTab(x.id);
            }} title={tr('Löschen', 'Delete')}><Icon name="trash" size={13} /></button>
          </li>
        ))}
      </ul>
      <form class="row" onSubmit={(e) => {
        e.preventDefault();
        const src = (e.currentTarget.querySelector('select') as HTMLSelectElement | null)?.value as 'local' | 'server' | undefined;
        if (name.trim()) { addTab(name.trim(), src || sources[0]); setName(''); }
      }}>
        <input value={name} placeholder={tr('Neuer Tab', 'New tab')} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        {sources.length > 1 && (
          <select>{sources.map((s) => <option key={s} value={s}>{s === 'server' ? 'Homy' : tr('Lokal', 'Local')}</option>)}</select>
        )}
        <button type="submit" class="hb"><Icon name="plus" /></button>
      </form>
    </div>
  );
}

function SettingsPanel() {
  const tr = t.value;
  const host = getHost();
  const Extra = host.SettingsExtra;
  return (
    <div class="settings">
      <div class="set-group">
        <h4>{tr('Darstellung', 'Appearance')}</h4>
        <div class="swatches">
          {Object.entries(THEMES).map(([id, th]) => (
            <button type="button" key={id} class={ui.value.theme === id ? 'swatch on' : 'swatch'} onClick={() => saveUi({ theme: id })}
              style={{ background: th.vars['--bg-base'], color: th.vars['--text-primary'], borderColor: th.vars['--primary'] }}>
              <i style={{ background: th.vars['--primary'] }} />{th.label}
            </button>
          ))}
        </div>
        <label class="cf-toggle">
          <input type="checkbox" checked={ui.value.fitToScreen} onChange={(e) => saveUi({ fitToScreen: (e.target as HTMLInputElement).checked })} />
          <span class="hsw" /> <span>{tr('An Bildschirmhöhe anpassen (kein Scrollen)', 'Fit to screen height (no scrolling)')}</span>
        </label>
        <label class="cf-field"><span>{tr('Dichte', 'Density')}</span>
          <select value={ui.value.density} onChange={(e) => saveUi({ density: (e.target as HTMLSelectElement).value as 'compact' | 'cozy' })}>
            <option value="compact">{tr('Kompakt', 'Compact')}</option>
            <option value="cozy">{tr('Luftig', 'Cozy')}</option>
          </select>
        </label>
        <label class="cf-field"><span>{tr('Hintergrundbild (URL, optional)', 'Background image (URL, optional)')}</span>
          <input value={ui.value.background || ''} placeholder="https://…" onChange={(e) => saveUi({ background: (e.target as HTMLInputElement).value.trim() })} />
        </label>
      </div>
      <TabManager />
      {Extra && <Extra onChanged={() => { void reload(); }} />}
      {host.menuLinks && (
        <div class="set-group">
          <h4>{tr('Verwaltung', 'Administration')}</h4>
          <div class="link-list">
            {host.menuLinks().map((l) => (
              <a key={l.href} class="hb ghost" href={l.href}><Icon name={l.icon} /> {l.label}</a>
            ))}
          </div>
        </div>
      )}
      <div class="set-group muted small">
        <h4>{tr('Tastenkürzel', 'Shortcuts')}</h4>
        <p><kbd>Strg</kbd>+<kbd>K</kbd> / <kbd>/</kbd> {tr('Suche & Befehle', 'Search & commands')} · <kbd>E</kbd> {tr('Bearbeiten', 'Edit')} · <kbd>A</kbd> {tr('Widget hinzufügen', 'Add widget')} · <kbd>1</kbd>–<kbd>9</kbd> Tabs · <kbd>R</kbd> {tr('Aktualisieren', 'Refresh')}</p>
        <p>{tr('Im Bearbeiten-Modus: Widget anklicken, Pfeiltasten verschieben, Umschalt+Pfeile ändern die Größe.', 'In edit mode: select a widget, arrows move it, Shift+arrows resize it.')}</p>
      </div>
    </div>
  );
}

export function Drawer() {
  const d = drawer.value;
  const tr = t.value;
  if (!d) return null;
  const title = d.kind === 'add' ? tr('Widget hinzufügen', 'Add widget')
    : d.kind === 'config' ? tr('Widget-Einstellungen', 'Widget settings') : tr('Einstellungen', 'Settings');
  return (
    <aside class="drawer" aria-label={title}>
      <header>
        <h3>{title}</h3>
        {d.kind === 'config' && <button type="button" class="ico" title={tr('Weiteres Widget', 'Add another')} onClick={() => { drawer.value = { kind: 'add' }; }}><Icon name="plus" /></button>}
        <button type="button" class="ico" onClick={() => { drawer.value = null; }} title={tr('Schließen (Esc)', 'Close (Esc)')}><Icon name="x" /></button>
      </header>
      <div class="drawer-body">
        {d.kind === 'add' && <Picker />}
        {d.kind === 'config' && <ConfigPanel id={d.id} />}
        {d.kind === 'settings' && <SettingsPanel />}
      </div>
    </aside>
  );
}
