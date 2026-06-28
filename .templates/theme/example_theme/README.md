# Example Theme (`example_theme`)

Themes are plain CSS files that override the dashboard's CSS variables.
Unlike modules and integrations, there's no ZIP upload — you install them manually.

## Installation

1. Copy the folder to `homy/themes/example_theme/`
2. The CSS file must be named after the folder: `example_theme.css`
3. `info.cfg` needs a `[info]` section with at least `name` and `version`
4. Restart the server (or `pip install .` + browser reload)
5. Pick the theme under **Settings → Appearance**

## CSS variables reference

Override these in your theme's CSS file under `:root`:

| Variable | Used for |
|----------|----------|
| `--bg-base` | Page background |
| `--bg-surface` | Panels, sidebar |
| `--bg-card` / `--bg-card-solid` | Widget cards |
| `--bg-card-rgb` | RGB triplet for opacity-controlled card backgrounds |
| `--text-primary` / `--text-secondary` / `--text-muted` | Text hierarchy |
| `--primary` | Accent color (buttons, highlights, active states) |
| `--success` | Green (online, done, positive) |
| `--danger` | Red (offline, error, destructive) |
| `--border-color` | Card and element borders |
| `--border-glow` | Glow effect on focused / accented elements |

The existing themes in `homy/themes/dark/dark.css` and `homy/themes/light/light.css`
are the best reference — copy one and tweak the values.
