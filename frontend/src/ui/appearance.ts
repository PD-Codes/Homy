/** Per-widget appearance (same config keys as the classic UI, so layouts carry over). */
import type { SchemaField } from '@/sdk';

const SIZES = { Klein: ['11px', '12px'], Normal: ['12px', '13.5px'], Groß: ['14px', '15.5px'] } as const;

export const APPEARANCE_FIELDS: SchemaField[] = [
  { key: 'hide_header', type: 'toggle', label: 'Header ausblenden', default: 'Nein', on: 'Ja', off: 'Nein', help: 'Im Bearbeiten-Modus bleibt er sichtbar.' },
  { key: 'hide_action_buttons', type: 'toggle', label: 'Aktions-Buttons ausblenden', default: 'Nein', on: 'Ja', off: 'Nein', help: 'z. B. Pi-hole pausieren, Proxmox Start/Stopp' },
  { key: 'transparent_widget', type: 'toggle', label: 'Komplett transparent (ohne Hintergrund & Rand)', default: 'Nein', on: 'Ja', off: 'Nein' },
  { key: 'bg_opacity', type: 'range', label: 'Hintergrund-Deckkraft', default: '100', min: 0, max: 100 },
  { key: 'font_size_title', type: 'select', label: 'Header-Schrift', default: 'Normal', options: ['Klein', 'Normal', 'Groß'].map((v) => ({ value: v, label: v })) },
  { key: 'font_size_body', type: 'select', label: 'Inhalt-Schrift', default: 'Normal', options: ['Klein', 'Normal', 'Groß'].map((v) => ({ value: v, label: v })) },
  { key: 'accent_color', type: 'color', label: 'Akzentfarbe (leer = Theme)', default: '' },
  {
    key: 'refresh_interval', type: 'select', label: 'Aktualisierung', default: '',
    options: [
      { value: '', label: 'Standard' }, { value: '0', label: 'Aus' }, { value: '15', label: '15 Sekunden' },
      { value: '30', label: '30 Sekunden' }, { value: '60', label: '1 Minute' }, { value: '120', label: '2 Minuten' },
      { value: '300', label: '5 Minuten' }, { value: '600', label: '10 Minuten' }, { value: '900', label: '15 Minuten' },
    ],
  },
];

export const APPEARANCE_KEYS = new Set(APPEARANCE_FIELDS.map((f) => f.key));

export interface Look {
  cls: string[];
  style: Record<string, string>;
  hideHeader: boolean;
}

export function widgetLook(config: Record<string, unknown>): Look {
  const cls: string[] = [];
  const style: Record<string, string> = {};
  const yes = (k: string) => String(config[k] ?? '') === 'Ja';
  if (yes('transparent_widget')) cls.push('is-transparent');
  if (yes('hide_action_buttons')) cls.push('hide-actions');
  const alpha = Number(config.bg_opacity ?? 100);
  if (!yes('transparent_widget') && Number.isFinite(alpha) && alpha < 100) {
    const a = Math.max(0, Math.min(100, alpha));
    style.background = `color-mix(in srgb, var(--bg-card) ${a}%, transparent)`;
    style.borderColor = `color-mix(in srgb, var(--border-color) ${Math.max(a, 30)}%, transparent)`;
  }
  const accent = String(config.accent_color || '');
  if (/^#[0-9a-f]{6}$/i.test(accent)) {
    style['--primary'] = accent;
    style['--widget-accent'] = accent;
    if (!yes('transparent_widget')) style.borderColor = `color-mix(in srgb, ${accent} 45%, var(--border-color))`;
  }
  const title = SIZES[String(config.font_size_title || 'Normal') as keyof typeof SIZES] || SIZES.Normal;
  const body = SIZES[String(config.font_size_body || 'Normal') as keyof typeof SIZES] || SIZES.Normal;
  style['--wf-title'] = title[0];
  style['--wf-body'] = body[1];
  style['--widget-font-body'] = body[1];
  return { cls, style, hideHeader: yes('hide_header') };
}

/** Seconds between refreshes: per-widget override, else the type default. */
export function refreshSeconds(config: Record<string, unknown>, typeDefault: number | undefined): number {
  const raw = config.refresh_interval;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const n = parseInt(String(raw), 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return typeDefault ?? 0;
}
