import { useEffect, useState } from 'preact/hooks';
import { cfgBool, cfgStr, defineModule } from '@/sdk';
import type { WidgetProps } from '@/sdk';

function Clock({ config, ctx, size }: WidgetProps) {
  const tz = cfgStr(config, 'timezone', '') || undefined;
  const h24 = cfgBool(config, 'format_24h', true);
  const sec = cfgBool(config, 'show_seconds', false);
  const showDate = cfgBool(config, 'show_date', true);
  const showTz = cfgBool(config, 'show_timezone', false);
  const greet = cfgBool(config, 'greeting', false);
  const label = cfgStr(config, 'label');
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), sec ? 1000 : 10_000);
    return () => clearInterval(id);
  }, [sec]);

  let time = '';
  let date = '';
  let validTz = tz;
  try {
    time = now.toLocaleTimeString(ctx.locale, { timeZone: tz, hour: '2-digit', minute: '2-digit', second: sec ? '2-digit' : undefined, hour12: !h24 });
    date = now.toLocaleDateString(ctx.locale, { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });
  } catch {
    validTz = undefined;
    time = now.toLocaleTimeString(ctx.locale, { hour: '2-digit', minute: '2-digit' });
  }
  const hour = Number(now.toLocaleString('en-US', { timeZone: validTz, hour: 'numeric', hour12: false }));
  const greeting = hour < 5 ? ctx.t('Gute Nacht', 'Good night') : hour < 11 ? ctx.t('Guten Morgen', 'Good morning')
    : hour < 17 ? ctx.t('Guten Tag', 'Good afternoon') : hour < 22 ? ctx.t('Guten Abend', 'Good evening') : ctx.t('Gute Nacht', 'Good night');
  const scale = Math.max(1, Math.min(size.h / 2, size.w / 4));
  return (
    <div class="m-clock" style={{ '--s': scale }}>
      {(label || greet) && <div class="m-clock-label">{greet ? greeting : label}</div>}
      <div class="m-clock-time">{time}</div>
      {showDate && <div class="m-clock-date">{date}</div>}
      {showTz && validTz && <div class="m-clock-tz">{validTz}</div>}
    </div>
  );
}

const yesNo = (key: string, label: string, def: 'Ja' | 'Nein') => ({ key, type: 'toggle', label, default: def, on: 'Ja', off: 'Nein' });

defineModule({
  type: 'clock',
  name: { de: 'Uhr', en: 'Clock' },
  description: { de: 'Uhrzeit, Datum, Zeitzone, Begrüßung', en: 'Time, date, time zone, greeting' },
  icon: 'clock',
  category: 'essentials',
  size: { w: 6, h: 3 },
  chromeless: true,
  schema: [
    { key: 'timezone', type: 'text', label: 'Zeitzone (IANA, leer = lokal)', default: '', placeholder: 'Europe/Berlin' },
    yesNo('format_24h', '24-Stunden-Format', 'Ja'),
    yesNo('show_seconds', 'Sekunden anzeigen', 'Nein'),
    yesNo('show_date', 'Datum anzeigen', 'Ja'),
    yesNo('show_timezone', 'Zeitzone anzeigen', 'Nein'),
    yesNo('greeting', 'Begrüßung statt Beschriftung', 'Nein'),
    { key: 'label', type: 'text', label: 'Beschriftung (optional)', default: '' },
  ],
  component: Clock,
});
