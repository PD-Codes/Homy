import { useEffect, useState } from 'preact/hooks';
import { cfgBool, cfgStr, defineModule } from '@/sdk';
import type { WidgetProps } from '@/sdk';

function Countdown({ config, ctx }: WidgetProps) {
  const name = cfgStr(config, 'event_name', 'Event');
  const date = cfgStr(config, 'target_date');
  const time = cfgStr(config, 'target_time', '00:00') || '00:00';
  const sec = cfgBool(config, 'show_seconds', true);
  const style = cfgStr(config, 'style', 'boxes');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), sec ? 1000 : 30_000); return () => clearInterval(id); }, [sec]);
  if (!date) return <div class="w-state">{ctx.t('Zieldatum in den Einstellungen setzen.', 'Set a target date in the settings.')}</div>;
  const target = new Date(`${date}T${time.length === 5 ? time : '00:00'}:00`).getTime();
  if (Number.isNaN(target)) return <div class="w-state w-error">{ctx.t('Ungültiges Datum', 'Invalid date')}</div>;
  let diff = Math.max(0, Math.floor((target - now) / 1000));
  const d = Math.floor(diff / 86400); diff -= d * 86400;
  const h = Math.floor(diff / 3600); diff -= h * 3600;
  const m = Math.floor(diff / 60); const s = diff - m * 60;
  const parts: [number, string][] = [[d, ctx.t('Tage', 'days')], [h, ctx.t('Std', 'hrs')], [m, 'Min']];
  if (sec) parts.push([s, ctx.t('Sek', 'sec')]);
  const done = target <= now;
  return (
    <div class={`m-count m-count-${style}`}>
      <div class="m-count-name">{name}</div>
      {done ? <div class="m-count-done">{ctx.t('Es ist so weit!', "It's time!")}</div> : (
        <div class="m-count-parts">
          {parts.map(([v, l]) => <span key={l}><b>{String(v).padStart(2, '0')}</b><small>{l}</small></span>)}
        </div>
      )}
    </div>
  );
}

defineModule({
  type: 'countdown',
  name: { de: 'Countdown', en: 'Countdown' },
  description: { de: 'Zeit bis zu einem Termin', en: 'Time until an event' },
  icon: 'timer',
  category: 'productivity',
  size: { w: 6, h: 3 },
  schema: [
    { key: 'event_name', type: 'text', label: 'Event-Name', default: 'Mein Event' },
    { key: 'target_date', type: 'text', label: 'Datum (YYYY-MM-DD)', default: '', placeholder: '2026-12-24' },
    { key: 'target_time', type: 'text', label: 'Uhrzeit (HH:MM)', default: '00:00' },
    { key: 'style', type: 'select', label: 'Stil', default: 'boxes', options: [{ value: 'boxes', label: 'Boxen' }, { value: 'minimal', label: 'Minimal' }, { value: 'banner', label: 'Banner' }] },
    { key: 'show_seconds', type: 'toggle', label: 'Sekunden zeigen', default: 'Ja', on: 'Ja', off: 'Nein' },
  ],
  component: Countdown,
});
