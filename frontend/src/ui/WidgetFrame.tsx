import { Component } from 'preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { WidgetContext, WidgetInstance } from '@/sdk';
import { Icon } from './icons';
import {
  activeTab, catalogEntry, drawer, duplicateWidget, getHost, moduleFor, refreshTick, removeWidget, t, updateWidget,
} from './store';

class Boundary extends Component<{ children: ComponentChildren; label: string }, { err: Error | null }> {
  state = { err: null as Error | null };
  componentDidCatch(err: Error) { this.setState({ err }); }
  render() {
    if (this.state.err) {
      return <div class="w-state w-error"><Icon name="alert-triangle" /> <span>{this.props.label}: {this.state.err.message}</span></div>;
    }
    return this.props.children;
  }
}

function useTicker(seconds: number | undefined): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seconds || seconds < 5) return undefined;
    const id = setInterval(() => { if (!document.hidden) setN((x) => x + 1); }, seconds * 1000);
    return () => clearInterval(id);
  }, [seconds]);
  return n;
}

function NativeBody({ w, editing }: { w: WidgetInstance; editing: boolean }) {
  const mod = moduleFor(w.type)!;
  const host = getHost();
  const auto = useTicker(mod.refresh);
  const tick = refreshTick.value + auto;
  const ctx = useMemo<WidgetContext>(() => ({
    instance: w,
    tabSource: activeTab.value?.source || 'server',
    locale: host.locale,
    t: t.value,
    server: host.server(),
    kv: host.kv,
    setConfig: (patch) => { void updateWidget(w.id, { config: patch }); },
    openUrl: (url, newTab) => { if (newTab) window.open(url, '_blank', 'noopener'); else window.location.href = url; },
    editing,
    refreshTick: tick,
    host: host.caps,
  }), [w, editing, tick]);
  const Cmp = mod.component;
  return <Cmp config={w.config} ctx={ctx} size={{ w: w.w, h: w.h }} />;
}

function ForeignBody({ w }: { w: WidgetInstance }) {
  const ref = useRef<HTMLDivElement>(null);
  const entry = catalogEntry(w.type);
  const auto = useTicker(entry?.refresh);
  const tick = refreshTick.value + auto;
  const cfgKey = JSON.stringify(w.config);
  useEffect(() => {
    if (!ref.current) return undefined;
    const cleanup = getHost().renderForeign(ref.current, w, entry, tick);
    return () => { if (typeof cleanup === 'function') cleanup(); };
  }, [w.id, w.type, cfgKey, tick, w.w, w.h]);
  return <div class="w-foreign" ref={ref} />;
}

export function WidgetFrame(props: {
  w: WidgetInstance;
  style: Record<string, string | number>;
  editing: boolean;
  dragging?: boolean;
  highlighted?: boolean;
  onHandleDown?: (e: PointerEvent) => void;
  onResizeDown?: (e: PointerEvent) => void;
  onKey?: (e: KeyboardEvent) => void;
}) {
  const { w, editing } = props;
  const mod = moduleFor(w.type);
  const entry = catalogEntry(w.type);
  const tr = t.value;
  const title = (w.title || '').trim();
  const showHeader = editing || (!!title && !mod?.chromeless);
  const unknown = !mod && !entry;
  const cls = [
    'wf', editing && 'is-editing', props.dragging && 'is-dragging', props.highlighted && 'is-flash',
    mod?.chromeless && !editing && 'is-chromeless', `wf-${w.type}`,
  ].filter(Boolean).join(' ');

  return (
    <section class={cls} style={props.style} data-wid={w.id} tabIndex={editing ? 0 : -1} onKeyDown={props.onKey}
      aria-label={title || entry?.name || w.type}>
      {showHeader && (
        <header class="wf-head" onPointerDown={editing ? props.onHandleDown : undefined}>
          {editing && <Icon name="grip" size={14} class="wf-grip" />}
          <span class="wf-title">{title || (editing ? entry?.name || w.type : '')}</span>
          {editing && (
            <span class="wf-actions" onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" title={tr('Einstellungen', 'Settings')} onClick={() => { drawer.value = { kind: 'config', id: w.id }; }}><Icon name="settings" size={14} /></button>
              <button type="button" title={tr('Duplizieren', 'Duplicate')} onClick={() => duplicateWidget(w.id)}><Icon name="copy" size={14} /></button>
              <button type="button" class="danger" title={tr('Entfernen', 'Remove')} onClick={() => removeWidget(w.id)}><Icon name="trash" size={14} /></button>
            </span>
          )}
        </header>
      )}
      <div class="wf-body">
        <Boundary label={entry?.name || w.type}>
          {unknown
            ? <div class="w-state"><Icon name="box" /> {tr('Unbekannter Widget-Typ', 'Unknown widget type')}: {w.type}</div>
            : mod
              ? <NativeBody w={w} editing={editing} />
              : activeTab.value?.source === 'server' || getHost().kind === 'web'
                ? <ForeignBody w={w} />
                : <div class="w-state">{tr('Nur mit Homy-Verbindung', 'Requires a Homy connection')}</div>}
        </Boundary>
      </div>
      {editing && <span class="wf-resize" onPointerDown={props.onResizeDown} title={tr('Größe ändern', 'Resize')} />}
    </section>
  );
}
