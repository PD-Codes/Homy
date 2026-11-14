import { useEffect } from 'preact/hooks';
import { Drawer } from './Drawer';
import { Grid } from './Grid';
import { Icon } from './icons';
import { Palette } from './Palette';
import {
  activeTab, addTab, canEdit, drawer, editing, getHost, loadError, loading, locked, notice, paletteOpen,
  refreshAll, reload, selectTab, t, tabs, toasts, ui, user,
} from './store';

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); paletteOpen.value = !paletteOpen.value; return; }
      if (e.key === 'Escape') {
        if (paletteOpen.value) paletteOpen.value = false;
        else if (drawer.value) drawer.value = null;
        else if (editing.value) editing.value = false;
        return;
      }
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey || paletteOpen.value) return;
      const k = e.key.toLowerCase();
      if (k === '/') { e.preventDefault(); paletteOpen.value = true; }
      else if (k === 'e' && canEdit()) editing.value = !editing.value;
      else if (k === 'a' && canEdit()) { editing.value = true; drawer.value = { kind: 'add' }; }
      else if (k === 'r') refreshAll();
      else if (/^[1-9]$/.test(k)) { const tab = tabs.value[Number(k) - 1]; if (tab) selectTab(tab.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function TabBar() {
  const tr = t.value;
  const host = getHost();
  const current = activeTab.value;
  return (
    <nav class="tabs" aria-label="Tabs">
      {tabs.value.map((x, i) => (
        <button type="button" key={x.id} class={x.id === current?.id ? 'tab on' : 'tab'} onClick={() => selectTab(x.id)}
          title={`${x.name} (${i + 1})`}>
          {host.kind === 'extension' && <Icon name={x.source === 'server' ? 'cloud' : 'monitor'} size={12} class="tab-src" />}
          {x.name}
        </button>
      ))}
      {editing.value && (
        <button type="button" class="tab add" title={tr('Tab hinzufügen', 'Add tab')} onClick={() => {
          const name = prompt(tr('Name des neuen Tabs', 'Name of the new tab'));
          if (name?.trim()) addTab(name.trim(), current?.source || host.tabSources()[0]);
        }}><Icon name="plus" size={14} /></button>
      )}
    </nav>
  );
}

function TopBar() {
  const tr = t.value;
  const editable = canEdit();
  return (
    <div class="topbar">
      <span class="brand" title="Homy">Homy</span>
      <TabBar />
      <div class="tools">
        {notice.value && <span class="notice" title={notice.value}><Icon name="cloud-off" size={13} /> {notice.value}</span>}
        <button type="button" class="cmd" onClick={() => { paletteOpen.value = true; }}>
          <Icon name="search" size={14} /> <span>{tr('Suchen', 'Search')}</span> <kbd>Ctrl K</kbd>
        </button>
        {editing.value && editable && (
          <button type="button" class="hb primary sm" onClick={() => { drawer.value = { kind: 'add' }; }}>
            <Icon name="plus" size={14} /> {tr('Widget', 'Widget')}
          </button>
        )}
        <button type="button" class={editing.value ? 'ico on' : 'ico'} disabled={!editable}
          title={locked.value && activeTab.value?.source === 'server' ? tr('Layout vom Admin gesperrt', 'Layout locked by admin') : tr('Bearbeiten (E)', 'Edit (E)')}
          onClick={() => { editing.value = !editing.value; if (!editing.value && drawer.value?.kind !== 'settings') drawer.value = null; }}>
          <Icon name={editing.value ? 'check' : 'pencil'} />
        </button>
        <button type="button" class="ico" title={tr('Aktualisieren (R)', 'Refresh (R)')} onClick={refreshAll}><Icon name="refresh" /></button>
        <button type="button" class="ico" title={user.value ? `${tr('Einstellungen', 'Settings')} – ${user.value.display_name || user.value.username}` : tr('Einstellungen', 'Settings')}
          onClick={() => { drawer.value = drawer.value?.kind === 'settings' ? null : { kind: 'settings' }; }}>
          <Icon name="settings" />
        </button>
      </div>
    </div>
  );
}

function Toasts() {
  return (
    <div class="toasts" aria-live="polite">
      {toasts.value.map((x) => (
        <div key={x.id} class={`toast${x.tone === 'error' ? ' err' : ''}`}>
          <span>{x.text}</span>
          {x.action && <button type="button" onClick={() => { x.action!.run(); x.action = undefined; }}>{x.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

export function App() {
  useShortcuts();
  const tr = t.value;
  const bg = ui.value.background;
  return (
    <div class={`app${drawer.value ? ' has-drawer' : ''}${editing.value ? ' editing' : ''}`}
      style={bg ? { backgroundImage: `url("${bg.replace(/"/g, '')}")` } : undefined}>
      <TopBar />
      <main class="board">
        {loading.value && !tabs.value.length && <div class="splash"><span class="spin" /></div>}
        {loadError.value && !tabs.value.length && (
          <div class="grid-empty"><div>
            <p>{tr('Konnte nicht laden', 'Could not load')}: {loadError.value}</p>
            <button type="button" class="hb" onClick={() => reload()}><Icon name="refresh" /> {tr('Erneut versuchen', 'Retry')}</button>
          </div></div>
        )}
        {!!tabs.value.length && <Grid />}
      </main>
      <Drawer />
      {paletteOpen.value && <Palette />}
      <Toasts />
    </div>
  );
}
