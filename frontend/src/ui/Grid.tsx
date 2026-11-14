import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { WidgetInstance } from '@/sdk';
import { COLS, bottom, compact, placeAndResolve, stackForMobile } from './grid/layout';
import { Icon } from './icons';
import { WidgetFrame } from './WidgetFrame';
import { canEdit, drawer, editing, highlightId, setLayout, t, tabWidgets, ui } from './store';

const GAP = 8;
const BASE_ROW = 30;

interface DragState {
  id: string;
  mode: 'move' | 'resize';
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  orig: WidgetInstance;
  preview: WidgetInstance[];
}

export function Grid() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [top, setTop] = useState(0);
  const [viewH, setViewH] = useState(window.innerHeight);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  const items = tabWidgets.value;
  const empty = items.length === 0;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      setWidth(el.clientWidth);
      setTop(el.getBoundingClientRect().top + window.scrollY);
      setViewH(window.innerHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [empty]);

  const isEditing = editing.value && canEdit();
  const mobile = width > 0 && width < 720;
  const laid = drag ? drag.preview : mobile ? stackForMobile(items) : items;
  const rows = Math.max(bottom(laid), 1);
  // Row height follows the stored layout (not the drag preview), so it does not jump
  // while editing; edit mode only adds spare rows below for dropping.
  const viewRows = Math.max(bottom(mobile ? stackForMobile(items) : items), 1);

  let rowH = BASE_ROW;
  if (ui.value.fitToScreen && !mobile && items.length) {
    const avail = viewH - top - 14;
    rowH = Math.max(22, Math.min(76, Math.floor((avail + GAP) / viewRows) - GAP));
  } else if (ui.value.density === 'cozy') {
    rowH = 36;
  }
  const colW = (width + GAP) / COLS;
  const pitch = rowH + GAP;
  const height = rows * pitch - GAP + (isEditing ? pitch * 3 : 0);

  const px = (w: WidgetInstance) => ({
    left: `${w.col * colW}px`,
    top: `${w.row * pitch}px`,
    width: `${w.w * colW - GAP}px`,
    height: `${w.h * pitch - GAP}px`,
  });

  // ---------------------------------------------------------------- pointer drag
  useEffect(() => {
    if (!drag) return undefined;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      let moving: WidgetInstance;
      if (d.mode === 'move') {
        moving = { ...d.orig, col: Math.round(d.orig.col + dx / colW), row: Math.max(0, Math.round(d.orig.row + dy / pitch)) };
      } else {
        moving = { ...d.orig, w: Math.max(2, Math.round(d.orig.w + dx / colW)), h: Math.max(1, Math.round(d.orig.h + dy / pitch)) };
      }
      const cur = d.preview.find((p) => p.id === d.id)!;
      const changed = cur.col !== moving.col || cur.row !== moving.row || cur.w !== moving.w || cur.h !== moving.h;
      setDrag({ ...d, dx, dy, preview: changed ? placeAndResolve(items, moving) : d.preview });
    };
    const onUp = () => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      const moved = d.preview.some((p) => {
        const o = items.find((i) => i.id === p.id);
        return o && (o.col !== p.col || o.row !== p.row || o.w !== p.w || o.h !== p.h);
      });
      // Gravity on drop: no holes left behind (use the Spacer widget for intentional gaps).
      if (moved) setLayout(compact(d.preview));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag?.id, colW, pitch, items]);

  const start = (w: WidgetInstance, mode: DragState['mode']) => (e: PointerEvent) => {
    if (!isEditing || mobile || e.button !== 0) return;
    e.preventDefault();
    setDrag({ id: w.id, mode, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, orig: w, preview: items });
  };

  // Keyboard: arrows move, Shift+arrows resize (edit mode).
  const onKey = (w: WidgetInstance) => (e: KeyboardEvent) => {
    if (!isEditing) return;
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const s = step[e.key];
    if (!s) return;
    e.preventDefault();
    const next = e.shiftKey
      ? { ...w, w: Math.max(2, w.w + s[0]), h: Math.max(1, w.h + s[1]) }
      : { ...w, col: w.col + s[0], row: Math.max(0, w.row + s[1]) };
    setLayout(compact(placeAndResolve(items, next)));
    requestAnimationFrame(() => (document.querySelector(`[data-wid="${CSS.escape(w.id)}"]`) as HTMLElement | null)?.focus());
  };

  const tr = t.value;
  if (!items.length) {
    return (
      <div class="grid-wrap" ref={ref}><div class="grid-empty">
        <div>
          <p>{tr('Dieser Tab ist noch leer.', 'This tab is empty.')}</p>
          {canEdit() && (
            <button type="button" class="hb primary" onClick={() => { editing.value = true; drawer.value = { kind: 'add' }; }}>
              <Icon name="plus" /> {tr('Widget hinzufügen', 'Add widget')}
            </button>
          )}
        </div>
      </div></div>
    );
  }

  const dragged = drag && items.find((i) => i.id === drag.id);
  return (
    <div class="grid-wrap" ref={ref}>
    <div class={`grid${isEditing ? ' is-editing' : ''}${drag ? ' is-dragging' : ''}`}
      style={{ height: `${height}px`, '--col-w': `${colW}px`, '--pitch': `${pitch}px` }}>
      {drag && (() => {
        const p = drag.preview.find((x) => x.id === drag.id)!;
        return <div class="grid-ghost" style={px(p)} />;
      })()}
      {laid.map((w) => {
        const isDragged = drag?.id === w.id;
        let style: Record<string, string | number> = px(w);
        if (isDragged && dragged) {
          const o = px(dragged);
          style = drag!.mode === 'move'
            ? { ...o, transform: `translate(${drag!.dx}px, ${drag!.dy}px)` }
            : { ...o, width: `${parseFloat(o.width) + drag!.dx}px`, height: `${parseFloat(o.height) + drag!.dy}px` };
        }
        return (
          <WidgetFrame key={w.id} w={items.find((i) => i.id === w.id) || w} style={style} editing={isEditing}
            dragging={isDragged} highlighted={highlightId.value === w.id}
            onHandleDown={start(w, 'move')} onResizeDown={start(w, 'resize')} onKey={onKey(w)} />
        );
      })}
    </div>
    </div>
  );
}
