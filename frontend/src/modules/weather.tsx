import { useEffect, useState } from 'preact/hooks';
import { cfgNum, cfgStr, defineModule } from '@/sdk';
import type { WidgetProps } from '@/sdk';
import { Icon } from '@/ui/icons';

// Open-Meteo: free, no API key, CORS enabled. Results are cached per location for 15 min.
interface Wx {
  place: string;
  current: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; weather_code: number; wind_speed_10m: number; is_day: number };
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[] };
  units: { temp: string; wind: string };
}

const CODES: [number[], string, string, string][] = [
  [[0], 'Klar', 'Clear', 'sun'],
  [[1, 2], 'Leicht bewölkt', 'Partly cloudy', 'cloud-sun'],
  [[3], 'Bedeckt', 'Overcast', 'cloud'],
  [[45, 48], 'Nebel', 'Fog', 'cloud'],
  [[51, 53, 55, 56, 57], 'Niesel', 'Drizzle', 'cloud'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Regen', 'Rain', 'cloud'],
  [[71, 73, 75, 77, 85, 86], 'Schnee', 'Snow', 'cloud'],
  [[95, 96, 99], 'Gewitter', 'Thunderstorm', 'zap'],
];
function describe(code: number, t: (de: string, en: string) => string) {
  const hit = CODES.find(([c]) => c.includes(code));
  return hit ? { text: t(hit[1], hit[2]), icon: hit[3] } : { text: '–', icon: 'cloud' };
}

const memo = new Map<string, { at: number; data: Wx }>();

async function load(location: string, imperial: boolean, lang: string): Promise<Wx> {
  const key = `${location}|${imperial}|${lang}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.data;
  const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=${lang}&name=${encodeURIComponent(location)}`).then((r) => r.json());
  const g = geo?.results?.[0];
  if (!g) throw new Error(lang === 'de' ? `Ort „${location}“ nicht gefunden` : `Location "${location}" not found`);
  const params = new URLSearchParams({
    latitude: String(g.latitude), longitude: String(g.longitude), timezone: 'auto', forecast_days: '6',
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
  });
  if (imperial) { params.set('temperature_unit', 'fahrenheit'); params.set('wind_speed_unit', 'mph'); }
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const j = await res.json();
  const data: Wx = { place: g.name, current: j.current, daily: j.daily, units: { temp: imperial ? '°F' : '°C', wind: imperial ? 'mph' : 'km/h' } };
  memo.set(key, { at: Date.now(), data });
  return data;
}

function Weather({ config, ctx, size }: WidgetProps) {
  const location = cfgStr(config, 'location', 'Berlin');
  const imperial = cfgStr(config, 'units', 'metric') === 'imperial';
  const days = cfgNum(config, 'days', 3);
  const [wx, setWx] = useState<Wx | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const lang = ctx.locale.startsWith('de') ? 'de' : 'en';
  useEffect(() => {
    let alive = true;
    setErr(null);
    load(location, imperial, lang).then((d) => alive && setWx(d)).catch((e) => alive && setErr((e as Error).message));
    return () => { alive = false; };
  }, [location, imperial, lang, ctx.refreshTick]);

  if (err) return <div class="w-state w-error">{err}</div>;
  if (!wx) return <div class="w-state"><span class="spin" /></div>;
  const now = describe(wx.current.weather_code, ctx.t);
  const showDays = size.h >= 4 ? Math.min(days, 5) : 0;
  const wd = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(ctx.locale, { weekday: 'short' });
  return (
    <div class="m-wx">
      <div class="m-wx-now">
        <Icon name={wx.current.is_day || now.icon !== 'sun' ? now.icon : 'moon'} size={34} />
        <div>
          <div class="m-wx-temp">{Math.round(wx.current.temperature_2m)}{wx.units.temp}</div>
          <div class="m-wx-desc">{now.text} · {wx.place}</div>
        </div>
        <div class="m-wx-meta">
          <span>{ctx.t('Gefühlt', 'Feels')} {Math.round(wx.current.apparent_temperature)}°</span>
          <span><Icon name="wind" size={12} /> {Math.round(wx.current.wind_speed_10m)} {wx.units.wind}</span>
          <span>{wx.current.relative_humidity_2m}%</span>
        </div>
      </div>
      {showDays > 0 && (
        <div class="m-wx-days">
          {wx.daily.time.slice(1, showDays + 1).map((d, i) => {
            const x = describe(wx.daily.weather_code[i + 1], ctx.t);
            return (
              <div key={d} title={x.text}>
                <small>{wd(d)}</small>
                <Icon name={x.icon} size={18} />
                <span>{Math.round(wx.daily.temperature_2m_max[i + 1])}° <em>{Math.round(wx.daily.temperature_2m_min[i + 1])}°</em></span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

defineModule({
  type: 'quick_weather',
  name: { de: 'Wetter kompakt', en: 'Quick weather' },
  description: { de: 'Aktuelles Wetter + Vorhersage (Open-Meteo, ohne API-Key)', en: 'Current weather + forecast (Open-Meteo, no API key)' },
  icon: 'cloud-sun',
  category: 'info',
  size: { w: 6, h: 4 },
  refresh: 900,
  schema: [
    { key: 'location', type: 'text', label: 'Ort', default: 'Berlin' },
    { key: 'units', type: 'select', label: 'Einheiten', default: 'metric', options: [{ value: 'metric', label: '°C, km/h' }, { value: 'imperial', label: '°F, mph' }] },
    { key: 'days', type: 'select', label: 'Vorhersage-Tage', default: '3', options: [{ value: '0', label: '0' }, { value: '3', label: '3' }, { value: '5', label: '5' }] },
  ],
  component: Weather,
});
