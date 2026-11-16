import { useEffect } from 'preact/hooks';
import { BackgroundLayer } from './Background';
import { Drawer } from './Drawer';
import { Grid } from './Grid';
import { Icon } from './icons';
import { Palette } from './Palette';
import {
  activeTab, addTab, canEdit, drawer, editing, getHost, layoutKey, loadError, loading, locked, navigate, notice,
  paletteOpen, refreshAll, reload, route, selectTab, t, tabs, toasts, ui, user,
} from './store';

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function onDashboard(): boolean { return route.value.page === 'dashboard'; }

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
      if (k === '/') { e.preventDefault(); paletteOpen.value = true; return; }
      if (!onDashboard()) return;
      if (k === 'e' && canEdit()) editing.value = !editing.value;
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
  const editMode = editing.value && canEdit();
  return (
    <nav class="tabs" aria-label="Tabs">
      {tabs.value.map((x, i) => (
        <button type="button" key={x.id} class={x.id === current?.id ? 'tab on' : 'tab'} onClick={() => selectTab(x.id)}
          onDblClick={() => { if (editMode) drawer.value = { kind: 'tab', id: x.id }; }}
          onContextMenu={(e) => { if (canEdit(x)) { e.preventDefault(); selectTab(x.id); drawer.value = { kind: 'tab', id: x.id }; } }}
          title={`${x.name} (${i + 1})`}>
          {host.kind === 'extension' && <Icon name={x.source === 'server' ? 'cloud' : 'monitor'} size={12} class="tab-src" />}
          {x.name}
          {editMode && x.id === current?.id && (
            <span class="tab-gear" role="button" title={tr('Tab-Einstellungen', 'Tab settings')}
              onClick={(e) => { e.stopPropagation(); drawer.value = { kind: 'tab', id: x.id }; }}><Icon name="sliders" size={12} /></span>
          )}
        </button>
      ))}
      {editMode && (
        <button type="button" class="tab add" title={tr('Tab hinzufügen', 'Add tab')} onClick={() => {
          const name = prompt(tr('Name des neuen Tabs', 'Name of the new tab'));
          if (name?.trim()) addTab(name.trim(), current?.source || host.tabSources()[0]);
        }}><Icon name="plus" size={14} /></button>
      )}
    </nav>
  );
}

function PageNav() {
  const host = getHost();
  const pages = (host.pages?.() || []).filter((p) => !p.adminOnly || user.value?.role === 'admin');
  if (!pages.length) return null;
  const tr = t.value;
  const cur = route.value.page;
  return (
    <nav class="nav" aria-label={tr('Bereiche', 'Sections')}>
      <button type="button" class={cur === 'dashboard' ? 'ico on' : 'ico'} title="Dashboard" onClick={() => navigate('dashboard')}><Icon name="dashboard" /></button>
      {pages.map((p) => (
        <button type="button" key={p.id} class={cur === p.id ? 'ico on' : 'ico'} title={tr(p.label.de, p.label.en)} onClick={() => navigate(p.id)}>
          <Icon name={p.icon} />
        </button>
      ))}
    </nav>
  );
}

function TopBar() {
  const tr = t.value;
  const editable = canEdit();
  const dash = onDashboard();
  const layout = layoutKey.value;
  const page = (getHost().pages?.() || []).find((p) => p.id === route.value.page);
  return (
    <div class="topbar">
      <button type="button" class="brand" title="Dashboard" onClick={() => navigate('dashboard')}>Homy</button>
      {dash ? <TabBar /> : <div class="tabs"><span class="tab on">{page ? tr(page.label.de, page.label.en) : ''}</span></div>}
      <div class="tools">
        {dash && layout !== 'desktop' && <span class="notice" style={{ color: 'var(--primary)' }}><Icon name={layout === 'mobile' ? 'smartphone' : 'globe'} size={13} /> {layout === 'mobile' ? tr('Mobil-Layout', 'Mobile layout') : tr('Öffentliches Layout', 'Public layout')}</span>}
        {notice.value && <span class="notice" title={notice.value}><Icon name="cloud-off" size={13} /> {notice.value}</span>}
        <button type="button" class="cmd" onClick={() => { paletteOpen.value = true; }}>
          <Icon name="search" size={14} /> <span>{tr('Suchen', 'Search')}</span> <kbd>Ctrl K</kbd>
        </button>
        {dash && editing.value && editable && (
          <button type="button" class="hb primary sm" onClick={() => { drawer.value = { kind: 'add' }; }}>
            <Icon name="plus" size={14} /> {tr('Widget', 'Widget')}
          </button>
        )}
        {dash && (
          <>
            <button type="button" class={editing.value ? 'ico on' : 'ico'} disabled={!editable}
              title={locked.value && activeTab.value?.source === 'server' ? tr('Layout vom Admin gesperrt', 'Layout locked by admin') : tr('Bearbeiten (E)', 'Edit (E)')}
              onClick={() => { editing.value = !editing.value; if (!editing.value && drawer.value?.kind !== 'settings') drawer.value = null; }}>
              <Icon name={editing.value ? 'check' : 'pencil'} />
            </button>
            <button type="button" class="ico" title={tr('Aktualisieren (R)', 'Refresh (R)')} onClick={refreshAll}><Icon name="refresh" /></button>
          </>
        )}
        <PageNav />
        {getHost().loginAction && <button type="button" class="hb primary sm" onClick={() => getHost().loginAction!()}><Icon name="login" size={14} /> {tr('Anmelden', 'Sign in')}</button>}
        <button type="button" class={drawer.value?.kind === 'settings' ? 'ico on' : 'ico'} title={user.value ? `${tr('Schnelleinstellungen', 'Quick settings')} – ${user.value.display_name || user.value.username}` : tr('Einstellungen', 'Settings')}
          onClick={() => { drawer.value = drawer.value?.kind === 'settings' ? null : { kind: 'settings' }; }}>
          <Icon name="sliders" />
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

/** All tabs stay mounted (hidden) so their widgets load in the background. */
function Board() {
  const current = activeTab.value?.id;
  const preload = ui.value.preloadTabs !== false;
  return (
    <>
      {tabs.value.filter((x) => preload || x.id === current).map((x) => (
        <div key={x.id} class="tab-pane" hidden={x.id !== current}>
          <Grid tabId={x.id} active={x.id === current} />
        </div>
      ))}
    </>
  );
}

export function App() {
  useShortcuts();
  const tr = t.value;
  const dash = onDashboard();
  const page = (getHost().pages?.() || []).find((p) => p.id === route.value.page);
  const Page = page?.component;
  return (
    <div class={`app${drawer.value ? ' has-drawer' : ''}${editing.value ? ' editing' : ''}`}>
      <BackgroundLayer />
      <TopBar />
      <main class="board">
        {loading.value && !tabs.value.length && dash && <div class="splash"><span class="spin" /></div>}
        {loadError.value && !tabs.value.length && dash && (
          <div class="grid-empty"><div>
            <p>{tr('Konnte nicht laden', 'Could not load')}: {loadError.value}</p>
            <button type="button" class="hb" onClick={() => reload()}><Icon name="refresh" /> {tr('Erneut versuchen', 'Retry')}</button>
          </div></div>
        )}
        <div hidden={!dash}>{!!tabs.value.length && <Board />}</div>
        {!dash && Page && <Page sub={route.value.sub} />}
        {!dash && !Page && <div class="grid-empty"><p>{tr('Seite nicht gefunden.', 'Page not found.')}</p></div>}
      </main>
      <Drawer />
      {paletteOpen.value && <Palette />}
      <Toasts />
    </div>
  );
}
