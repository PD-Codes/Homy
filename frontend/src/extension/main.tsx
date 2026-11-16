import { render } from 'preact';
import { App } from '@/ui/App';
import { boot, reload } from '@/ui/store';
import { detectLocale } from '@/ui/i18n';
import '@/modules';
import '@/ui/styles.css';
import { createExtensionHost } from './host';

const locale = detectLocale(chrome.i18n?.getUILanguage?.());
document.documentElement.lang = locale.slice(0, 2);
const host = createExtensionHost(locale, () => { void reload(); });
const booting = boot(host);
render(<App />, document.getElementById('app')!);
void booting;

// Another tab changed the layout or the connection: pick it up when this one becomes visible.
let dirty = false;
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.keys(changes).some((k) => k.startsWith('homy.v2.board') || k === 'homy.v2.connection')) dirty = true;
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && dirty) { dirty = false; void reload(); }
});
