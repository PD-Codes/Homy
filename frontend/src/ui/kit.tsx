/** Small UI kit for the management pages (cards, fields, dialogs, pagination). */
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon } from './icons';
import { t, toast } from './store';

export function Page({ title, icon, actions, sub, children }: {
  title: string; icon?: string; actions?: ComponentChildren; sub?: ComponentChildren; children: ComponentChildren;
}) {
  return (
    <div class="page">
      <div class="page-head">
        <h1>{icon && <Icon name={icon} size={18} />} {title}</h1>
        <div class="page-actions">{actions}</div>
      </div>
      {sub && <div class="page-sub">{sub}</div>}
      <div class="page-body">{children}</div>
    </div>
  );
}

export function Card({ title, icon, actions, children, span }: {
  title?: string; icon?: string; actions?: ComponentChildren; children: ComponentChildren; span?: 1 | 2 | 3;
}) {
  return (
    <section class={`card${span ? ` span-${span}` : ''}`}>
      {(title || actions) && (
        <header class="card-head">
          <h3>{icon && <Icon name={icon} size={15} />} {title}</h3>
          <div class="card-actions">{actions}</div>
        </header>
      )}
      <div class="card-body">{children}</div>
    </section>
  );
}

export function Grid2({ children }: { children: ComponentChildren }) {
  return <div class="cards">{children}</div>;
}

export function Field({ label, hint, children, wide }: { label: string; hint?: ComponentChildren; children: ComponentChildren; wide?: boolean }) {
  return (
    <label class={`cf-field${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small class="muted">{hint}</small>}
    </label>
  );
}

export function Text({ value, onInput, ...rest }: { value: string | number | null | undefined; onInput: (v: string) => void } & Record<string, unknown>) {
  return <input {...(rest as Record<string, string>)} value={value ?? ''} onInput={(e) => onInput((e.target as HTMLInputElement).value)} />;
}

export function Area({ value, onInput, rows = 4, mono }: { value: string | null | undefined; onInput: (v: string) => void; rows?: number; mono?: boolean }) {
  return <textarea class={mono ? 'mono' : ''} rows={rows} value={value ?? ''} onInput={(e) => onInput((e.target as HTMLTextAreaElement).value)} />;
}

export function Choice<V extends string>({ value, options, onChange }: {
  value: V; options: { value: V; label: string }[]; onChange: (v: V) => void;
}) {
  return (
    <select value={value} onChange={(e) => onChange((e.target as HTMLSelectElement).value as V)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: ComponentChildren; hint?: string; disabled?: boolean;
}) {
  return (
    <label class={`cf-toggle${disabled ? ' disabled' : ''}`} title={hint}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span class="hsw" /> <span>{label}</span>
    </label>
  );
}

export function Segmented<V extends string>({ value, options, onChange }: {
  value: V; options: { value: V; label: string; icon?: string }[]; onChange: (v: V) => void;
}) {
  return (
    <div class="seg" role="radiogroup">
      {options.map((o) => (
        <button type="button" key={o.value} role="radio" aria-checked={value === o.value} class={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={13} />} {o.label}
        </button>
      ))}
    </div>
  );
}

export function Dialog({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: ComponentChildren; footer?: ComponentChildren; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    (ref.current?.querySelector('input, select, textarea, button') as HTMLElement | null)?.focus();
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <div class="dlg-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class={`dlg${wide ? ' wide' : ''}`} ref={ref} role="dialog" aria-label={title}>
        <header><h3>{title}</h3><button type="button" class="ico" onClick={onClose}><Icon name="x" /></button></header>
        <div class="dlg-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export const PER_PAGE = 20;

export function usePaged<T>(list: T[], perPage = PER_PAGE) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(list.length / perPage));
  useEffect(() => { if (page >= pages) setPage(pages - 1); }, [pages]);
  const slice = useMemo(() => list.slice(page * perPage, page * perPage + perPage), [list, page, perPage]);
  return { slice, page, pages, setPage, total: list.length };
}

export function Pager({ page, pages, setPage, total }: { page: number; pages: number; setPage: (p: number) => void; total: number }) {
  const tr = t.value;
  if (pages <= 1) return <div class="pager muted small">{total} {tr('Einträge', 'entries')}</div>;
  return (
    <div class="pager">
      <span class="muted small">{total} {tr('Einträge', 'entries')}</span>
      <button type="button" class="ico" disabled={page === 0} onClick={() => setPage(0)}><Icon name="chevrons-left" size={14} /></button>
      <button type="button" class="ico" disabled={page === 0} onClick={() => setPage(page - 1)}><Icon name="chevron-left" size={14} /></button>
      <span class="small">{page + 1} / {pages}</span>
      <button type="button" class="ico" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><Icon name="chevron-right" size={14} /></button>
      <button type="button" class="ico" disabled={page >= pages - 1} onClick={() => setPage(pages - 1)}><Icon name="chevrons-right" size={14} /></button>
    </div>
  );
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(() => {
    const n = ++seq.current;
    setLoading(true);
    return fn().then((d) => { if (n === seq.current) { setData(d); setError(null); } })
      .catch((e) => { if (n === seq.current) setError((e as Error).message); })
      .finally(() => { if (n === seq.current) setLoading(false); });
  }, deps);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

export function Loading({ error, retry }: { error?: string | null; retry?: () => void }) {
  if (error) return <div class="w-state w-error">{error} {retry && <button type="button" class="hb sm" onClick={retry}>{t.value('Nochmal', 'Retry')}</button>}</div>;
  return <div class="w-state"><span class="spin" /></div>;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'ok' | 'warn' | 'err' | 'neutral' | 'primary'; children: ComponentChildren }) {
  return <span class={`badge ${tone}`}>{children}</span>;
}

/** Run an action with a toast for success and error. */
export async function act<T>(fn: () => Promise<T>, ok?: string): Promise<T | undefined> {
  try {
    const r = await fn();
    if (ok) toast(ok);
    return r;
  } catch (e) {
    toast((e as Error).message, { tone: 'error' }, 7000);
    return undefined;
  }
}

export function SaveBar({ dirty, onSave, onReset, busy }: { dirty: boolean; onSave: () => void; onReset?: () => void; busy?: boolean }) {
  const tr = t.value;
  if (!dirty) return null;
  return (
    <div class="savebar">
      <span>{tr('Ungespeicherte Änderungen', 'Unsaved changes')}</span>
      {onReset && <button type="button" class="hb ghost sm" onClick={onReset}>{tr('Verwerfen', 'Discard')}</button>}
      <button type="button" class="hb primary sm" disabled={busy} onClick={onSave}><Icon name="save" size={14} /> {tr('Speichern', 'Save')}</button>
    </div>
  );
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' });
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] || null);
    input.click();
  });
}
