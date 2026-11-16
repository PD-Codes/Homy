import { useEffect, useRef, useState } from 'preact/hooks';
import type { CatalogEntry, SchemaField, WidgetInstance } from '@/sdk';
import { Icon } from './icons';
import { APPEARANCE_FIELDS, APPEARANCE_KEYS } from './appearance';
import { getHost, t, updateWidget } from './store';

interface IntegrationRow { id: number; name: string; type: string; enabled?: boolean }

let integrationsCache: Promise<IntegrationRow[]> | null = null;
function loadIntegrations(): Promise<IntegrationRow[]> {
  const server = getHost().server();
  if (!server) return Promise.resolve([]);
  integrationsCache ??= server.fetchJson<IntegrationRow[]>('/api/integrations').catch(() => []);
  return integrationsCache;
}

function Field({ f, value, entry, onChange }: {
  f: SchemaField; value: unknown; entry: CatalogEntry; onChange: (v: unknown) => void;
}) {
  const tr = t.value;
  const [integrations, setIntegrations] = useState<IntegrationRow[] | null>(null);
  useEffect(() => {
    if (f.type === 'integration') void loadIntegrations().then(setIntegrations);
  }, [f.type]);

  const str = value === undefined || value === null ? '' : String(value);
  switch (f.type) {
    case 'toggle': {
      const on = f.on ?? true;
      const off = f.off ?? false;
      const checked = String(value ?? f.default) === String(on);
      return (
        <label class="cf-toggle" title={f.help}>
          <input type="checkbox" checked={checked} onChange={(e) => onChange((e.target as HTMLInputElement).checked ? on : off)} />
          <span class="hsw" /> <span>{f.label}</span>
        </label>
      );
    }
    case 'range': {
      const n = value === undefined || value === null || value === '' ? Number(f.default ?? 100) : Number(value);
      return (
        <label class="cf-field"><span>{f.label} <b>{n}%</b></span>
          <input type="range" min={f.min ?? 0} max={f.max ?? 100} step={5} value={n}
            onChange={(e) => onChange(String((e.target as HTMLInputElement).value))} />
        </label>
      );
    }
    case 'color':
      return (
        <label class="cf-field"><span>{f.label}</span>
          <span class="row">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(str) ? str : '#5b8def'} onChange={(e) => onChange((e.target as HTMLInputElement).value)} style={{ width: '44px', padding: '2px', height: '30px' }} />
            <input type="text" value={str} placeholder="#rrggbb" style={{ flex: 1 }} onChange={(e) => onChange((e.target as HTMLInputElement).value.trim())} />
            {str && <button type="button" class="ico" title={tr('Zurücksetzen', 'Reset')} onClick={() => onChange('')}><Icon name="reset" size={14} /></button>}
          </span>
        </label>
      );
    case 'select':
      return (
        <label class="cf-field"><span>{f.label}</span>
          <select value={str} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
            {(f.options || []).map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
          </select>
        </label>
      );
    case 'integration': {
      const types = entry.integration_types || [];
      const list = (integrations || []).filter((i) => !types.length || types.includes(i.type));
      return (
        <label class="cf-field"><span>{tr('Integration', 'Integration')}</span>
          <select value={str} onChange={(e) => onChange((e.target as HTMLSelectElement).value)}>
            <option value="">{integrations ? tr('— auswählen —', '— choose —') : tr('lädt …', 'loading …')}</option>
            {list.map((i) => <option key={i.id} value={String(i.id)}>{i.name} ({i.type})</option>)}
          </select>
          {integrations && !list.length && <small class="muted">{tr('Keine passende Integration angelegt.', 'No matching integration configured.')}</small>}
        </label>
      );
    }
    case 'textarea':
      return (
        <label class="cf-field"><span>{f.label}</span>
          <textarea rows={f.rows || 5} value={str} placeholder={f.placeholder}
            onChange={(e) => onChange((e.target as HTMLTextAreaElement).value)} />
        </label>
      );
    default: {
      const type = f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : f.type === 'color' ? 'color' : 'text';
      return (
        <label class="cf-field"><span>{f.label}</span>
          <input {...({ type } as Record<string, string>)} value={str} placeholder={f.placeholder} min={f.min} max={f.max}
            autoComplete={f.type === 'password' ? 'new-password' : 'off'}
            onChange={(e) => {
              const raw = (e.target as HTMLInputElement).value;
              onChange(f.type === 'number' && raw !== '' ? Number(raw) : raw);
            }} />
          {f.help && <small class="muted">{f.help}</small>}
        </label>
      );
    }
  }
}

function CustomEditor({ w, entry, onReady }: { w: WidgetInstance; entry: CatalogEntry; onReady: (ok: boolean) => void }) {
  const tr = t.value;
  const ref = useRef<HTMLDivElement>(null);
  const handle = useRef<{ read: () => Record<string, unknown> } | null>(null);
  const host = getHost();
  useEffect(() => {
    if (!ref.current || !host.customConfig || entry.source === 'native') { onReady(false); return; }
    void host.customConfig(ref.current, w, entry).then((h) => { handle.current = h; onReady(!!h); }).catch(() => onReady(false));
  }, [w.id]);
  return (
    <div class="custom-config">
      <div ref={ref} class="legacy-config" />
      {handle.current && (
        <button type="button" class="hb primary" onClick={() => {
          try { void updateWidget(w.id, { config: handle.current!.read() }); } catch (e) { alert((e as Error).message); }
        }}><Icon name="check" /> {tr('Übernehmen', 'Apply')}</button>
      )}
    </div>
  );
}

export function ConfigForm({ w, entry }: { w: WidgetInstance; entry: CatalogEntry }) {
  const tr = t.value;
  const [custom, setCustom] = useState<boolean | null>(entry.source === 'native' ? false : null);
  const [advanced, setAdvanced] = useState(false);
  const [json, setJson] = useState('');
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const set = (key: string, v: unknown) => updateWidget(w.id, { config: { [key]: v } });

  return (
    <div class="cf">
      <label class="cf-field"><span>{tr('Titel', 'Title')}</span>
        <input type="text" value={w.title || ''} placeholder={entry.name}
          onChange={(e) => updateWidget(w.id, { title: (e.target as HTMLInputElement).value })} />
      </label>
      {entry.source !== 'native' && <CustomEditor key={w.id} w={w} entry={entry} onReady={setCustom} />}
      {custom === false && entry.schema.filter((f) => !APPEARANCE_KEYS.has(f.key)).map((f) => (
        <Field key={f.key} f={f} entry={entry} value={w.config[f.key] ?? f.default} onChange={(v) => set(f.key, v)} />
      ))}
      {custom === false && !entry.schema.length && <p class="muted">{tr('Keine Inhalts-Einstellungen.', 'No content settings.')}</p>}
      <details class="cf-adv" open>
        <summary>{tr('Darstellung & Aktualisierung', 'Appearance & refresh')}</summary>
        <div class="cf">
          {APPEARANCE_FIELDS.map((f) => (
            <Field key={f.key} f={f} entry={entry} value={w.config[f.key] ?? f.default} onChange={(v) => set(f.key, v)} />
          ))}
        </div>
      </details>
      <details class="cf-adv" open={advanced} onToggle={(e) => {
        const open = (e.target as HTMLDetailsElement).open;
        setAdvanced(open);
        if (open) setJson(JSON.stringify(w.config, null, 2));
      }}>
        <summary>{tr('Erweitert (JSON)', 'Advanced (JSON)')}</summary>
        <textarea class="mono" rows={10} value={json} onInput={(e) => setJson((e.target as HTMLTextAreaElement).value)} />
        {jsonErr && <small class="err">{jsonErr}</small>}
        <div class="row">
          <button type="button" class="hb" onClick={() => {
            try {
              const parsed = JSON.parse(json);
              setJsonErr(null);
              void updateWidget(w.id, { config: parsed });
            } catch (err) { setJsonErr((err as Error).message); }
          }}><Icon name="check" /> {tr('Übernehmen', 'Apply')}</button>

        </div>
      </details>
    </div>
  );
}
