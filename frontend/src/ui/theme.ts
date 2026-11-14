/** Theme tokens. Variable names match the classic Homy themes so legacy widgets look right. */
export const THEMES: Record<string, { label: string; vars: Record<string, string> }> = {
  dark: {
    label: 'Dark',
    vars: {
      '--bg-base': '#0e1116', '--bg-surface': '#151a21', '--bg-card': '#171c24', '--bg-card-solid': '#171c24',
      '--bg-card-rgb': '23, 28, 36', '--bg-hover': '#1e252f', '--border-color': '#262d38',
      '--text-primary': '#e6e9ee', '--text-secondary': '#a3abb8', '--text-muted': '#6c7684',
      '--primary': '#5b8def', '--primary-hover': '#4677e0', '--success': '#3fb27f', '--danger': '#e5534b',
      '--warning': '#d9a441',
    },
  },
  light: {
    label: 'Light',
    vars: {
      '--bg-base': '#f3f4f6', '--bg-surface': '#ffffff', '--bg-card': '#ffffff', '--bg-card-solid': '#ffffff',
      '--bg-card-rgb': '255, 255, 255', '--bg-hover': '#eef0f3', '--border-color': '#e1e4e9',
      '--text-primary': '#1b1f24', '--text-secondary': '#4b5563', '--text-muted': '#8a93a0',
      '--primary': '#2f6fde', '--primary-hover': '#255dc0', '--success': '#1f9d63', '--danger': '#d23c34',
      '--warning': '#b7791f',
    },
  },
  dracula: {
    label: 'Dracula',
    vars: {
      '--bg-base': '#22232e', '--bg-surface': '#282a36', '--bg-card': '#2c2e3b', '--bg-card-solid': '#2c2e3b',
      '--bg-card-rgb': '44, 46, 59', '--bg-hover': '#353849', '--border-color': '#3d4054',
      '--text-primary': '#f8f8f2', '--text-secondary': '#c3c6d4', '--text-muted': '#7c80a0',
      '--primary': '#bd93f9', '--primary-hover': '#a77ef0', '--success': '#50fa7b', '--danger': '#ff5555',
      '--warning': '#ffb86c',
    },
  },
  nord: {
    label: 'Nord',
    vars: {
      '--bg-base': '#242933', '--bg-surface': '#2b313c', '--bg-card': '#2e3440', '--bg-card-solid': '#2e3440',
      '--bg-card-rgb': '46, 52, 64', '--bg-hover': '#363d4a', '--border-color': '#3b4252',
      '--text-primary': '#eceff4', '--text-secondary': '#c8ced9', '--text-muted': '#7d8799',
      '--primary': '#88c0d0', '--primary-hover': '#75aebe', '--success': '#a3be8c', '--danger': '#bf616a',
      '--warning': '#ebcb8b',
    },
  },
  amber: {
    label: 'Terminal',
    vars: {
      '--bg-base': '#0c0b09', '--bg-surface': '#14120e', '--bg-card': '#16140f', '--bg-card-solid': '#16140f',
      '--bg-card-rgb': '22, 20, 15', '--bg-hover': '#201d16', '--border-color': '#2d2819',
      '--text-primary': '#f2e6c9', '--text-secondary': '#c9b98f', '--text-muted': '#8a7d5c',
      '--primary': '#f0a500', '--primary-hover': '#d39200', '--success': '#8fbf4d', '--danger': '#e0603a',
      '--warning': '#f0c94a',
    },
  },
};

/** Classic theme ids map onto the new token sets. */
const ALIASES: Record<string, string> = { glassmorphism: 'dark', cyber: 'amber', custom: 'dark' };

const CUSTOM_KEYS: Record<string, string> = {
  bg_base: '--bg-base', bg_surface: '--bg-surface', bg_card: '--bg-card', text_primary: '--text-primary',
  text_secondary: '--text-secondary', text_muted: '--text-muted', primary: '--primary',
  border_color: '--border-color', success: '--success', danger: '--danger',
};

export function applyTheme(id: string, custom?: Record<string, string> | null): void {
  const key = THEMES[id] ? id : ALIASES[id] || 'dark';
  const root = document.documentElement;
  root.dataset.theme = key;
  root.style.colorScheme = key === 'light' ? 'light' : 'dark';
  for (const [k, v] of Object.entries(THEMES[key].vars)) root.style.setProperty(k, v);
  if (id === 'custom' && custom) {
    for (const [k, v] of Object.entries(custom)) {
      const cssVar = CUSTOM_KEYS[k];
      if (cssVar && /^[#a-z0-9(),.\s%-]+$/i.test(v)) root.style.setProperty(cssVar, v);
    }
  }
}
