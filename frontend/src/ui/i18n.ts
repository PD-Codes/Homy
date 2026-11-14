/** Two-language UI text: t('Deutsch', 'English'). Locale comes from the host. */
export type T = (de: string, en: string) => string;

export function makeT(locale: string): T {
  const de = locale.toLowerCase().startsWith('de');
  return (deText, enText) => (de ? deText : enText);
}

export function detectLocale(preferred?: string | null): string {
  if (preferred) return preferred;
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  return nav.toLowerCase().startsWith('de') ? 'de-DE' : 'en-US';
}
