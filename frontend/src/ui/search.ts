export const ENGINES: Record<string, { label: string; url: string }> = {
  duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  google: { label: 'Google', url: 'https://www.google.com/search?q=%s' },
  bing: { label: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  startpage: { label: 'Startpage', url: 'https://www.startpage.com/do/search?q=%s' },
  ecosia: { label: 'Ecosia', url: 'https://www.ecosia.org/search?q=%s' },
};

let defaultEngine = 'duckduckgo';
export function setDefaultEngine(id: string): void { if (ENGINES[id]) defaultEngine = id; }

export function searchUrl(query: string, engine = defaultEngine, custom = ''): string {
  const tpl = engine === 'custom' && custom.includes('%s') ? custom : (ENGINES[engine] || ENGINES.duckduckgo).url;
  return tpl.replace('%s', encodeURIComponent(query));
}
