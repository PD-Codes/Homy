import { useEffect, useState } from 'preact/hooks';
import type { Background } from '@/sdk';
import { Icon } from './icons';
import { Segmented, Toggle } from './kit';
import { activeTab, getHost, route, t, toast, ui } from './store';

export function useBgUrl(bg: Background | undefined): string {
  const [url, setUrl] = useState('');
  const key = bg ? `${bg.type}|${bg.asset_id ?? ''}|${bg.url ?? ''}` : '';
  useEffect(() => {
    let alive = true;
    if (!bg || bg.type === 'none') { setUrl(''); return undefined; }
    const host = getHost();
    const resolved = host.backgroundUrl ? host.backgroundUrl(bg)
      : bg.type === 'url' ? bg.url || '' : `/api/assets/${bg.asset_id}/file`;
    void Promise.resolve(resolved).then((u) => { if (alive) setUrl(u || ''); });
    return () => { alive = false; };
  }, [key]);
  return url;
}

function effectiveBackground(): Background | undefined {
  if (route.value.page !== 'dashboard') return ui.value.wallpaper;
  const tabBg = activeTab.value?.background;
  if (tabBg && tabBg.type !== 'none') return tabBg;
  if (ui.value.wallpaper && ui.value.wallpaper.type !== 'none') return ui.value.wallpaper;
  if (ui.value.background) return { type: 'url', url: ui.value.background };
  return undefined;
}

/** Fixed layer behind the board: tab background, else the global wallpaper. */
export function BackgroundLayer() {
  const bg = effectiveBackground();
  const url = useBgUrl(bg);
  if (!bg || !url) return null;
  const opacity = Math.max(0, Math.min(100, bg.opacity ?? 100)) / 100;
  return (
    <div class="bg-layer" aria-hidden="true" style={{
      backgroundImage: `url("${url.replace(/"/g, '%22')}")`,
      backgroundSize: bg.size || 'cover',
      backgroundPosition: bg.position || 'center',
      opacity,
      position: bg.fixed === false ? 'absolute' : 'fixed',
    }} />
  );
}

export function BackgroundEditor({ value, onChange, allowFixed }: { value: Background | undefined; onChange: (bg: Background) => void; allowFixed?: boolean }) {
  const tr = t.value;
  const host = getHost();
  const bg: Background = value || { type: 'none' };
  const [library, setLibrary] = useState<{ id: number | string; name: string; url: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useBgUrl(bg);
  const set = (patch: Partial<Background>) => onChange({ ...bg, ...patch });

  useEffect(() => {
    if (bg.type === 'asset' && host.listBackgrounds && !library) void host.listBackgrounds().then(setLibrary).catch(() => setLibrary([]));
  }, [bg.type]);

  const upload = async (file: File | undefined) => {
    if (!file || !host.uploadBackground) return;
    setBusy(true);
    try {
      const created = await host.uploadBackground(file);
      onChange({ ...bg, ...created });
      if (host.listBackgrounds) setLibrary(await host.listBackgrounds());
    } catch (e) { toast((e as Error).message, { tone: 'error' }); } finally { setBusy(false); }
  };

  return (
    <div class="cf">
      <Segmented value={bg.type} onChange={(v) => set({ type: v })} options={[
        { value: 'none', label: tr('Keiner', 'None') },
        { value: 'asset', label: tr('Bild', 'Image'), icon: 'image' },
        { value: 'url', label: 'URL', icon: 'link' },
      ]} />
      {bg.type === 'url' && (
        <input type="text" placeholder="https://…/bild.jpg" value={bg.url || ''} onChange={(e) => set({ url: (e.target as HTMLInputElement).value.trim() })}
          style={{ padding: '6px 8px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-base)' }} />
      )}
      {bg.type === 'asset' && (
        <>
          <div class="thumbs">
            {(library || []).map((a) => (
              <button type="button" key={a.id} class={String(a.id) === String(bg.asset_id) ? 'thumb on' : 'thumb'} onClick={() => set({ asset_id: a.id })} title={a.name}>
                <img src={a.url} alt="" loading="lazy" /><span>{a.name}</span>
              </button>
            ))}
          </div>
          {host.uploadBackground && (
            <label class={`drop${busy ? ' over' : ''}`} onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer?.files?.[0]); }}>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => upload((e.target as HTMLInputElement).files?.[0])} />
              {busy ? <span class="spin" /> : <><Icon name="upload" /> {tr('Bild hochladen oder hierher ziehen', 'Upload an image or drop it here')}</>}
            </label>
          )}
        </>
      )}
      {bg.type !== 'none' && (
        <>
          {preview && <div class="bg-preview" style={{ backgroundImage: `url("${preview}")`, backgroundSize: bg.size || 'cover', backgroundPosition: bg.position || 'center', opacity: (bg.opacity ?? 100) / 100 }} />}
          <label class="cf-field"><span>{tr('Deckkraft', 'Opacity')} <b>{bg.opacity ?? 100}%</b></span>
            <input type="range" min={5} max={100} step={5} value={bg.opacity ?? 100} onChange={(e) => set({ opacity: Number((e.target as HTMLInputElement).value) })} />
          </label>
          <div class="form-grid">
            <label class="cf-field"><span>{tr('Größe', 'Size')}</span>
              <select value={bg.size || 'cover'} onChange={(e) => set({ size: (e.target as HTMLSelectElement).value as Background['size'] })}>
                <option value="cover">{tr('Füllen', 'Cover')}</option><option value="contain">{tr('Einpassen', 'Contain')}</option><option value="auto">{tr('Original', 'Original')}</option>
              </select>
            </label>
            <label class="cf-field"><span>{tr('Position', 'Position')}</span>
              <select value={bg.position || 'center'} onChange={(e) => set({ position: (e.target as HTMLSelectElement).value as Background['position'] })}>
                <option value="center">{tr('Mitte', 'Center')}</option><option value="top">{tr('Oben', 'Top')}</option><option value="bottom">{tr('Unten', 'Bottom')}</option>
              </select>
            </label>
          </div>
          {allowFixed && <Toggle checked={bg.fixed !== false} onChange={(v) => set({ fixed: v })} label={tr('Beim Scrollen fixiert', 'Fixed while scrolling')} />}
        </>
      )}
    </div>
  );
}
