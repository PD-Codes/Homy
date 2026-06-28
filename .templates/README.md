# Homy Developer Templates

Copy these as starting points for your own modules, integrations, themes, and layout packs.
None of these run in the dashboard itself — they're just blueprints sitting in the repo.

## What can you build?

| Type | Where it lives | Install via |
|------|----------------|-------------|
| **Module** | `homy/modules/<name>/` | ZIP upload (Admin → Media & Packages) |
| **Integration** | `homy/integrations/<name>/` | ZIP upload (Admin → Media & Packages) |
| **Layout template** | Asset library (metadata only) | ZIP upload |
| **Theme** | `homy/themes/<name>/` | Manual copy + server restart |

After installing a module or integration, reload the page. If you're working directly
in the repo, a `pip install .` handles the path registration.

## Folder structure

```
.templates/
├── README.md
├── module/example_module/           # Simple frontend-only widget
├── integration/example_integration/ # API integration + built-in widget
├── theme/example_theme/             # CSS theme with info.cfg
└── template/example_layout/         # Layout pack (manifest.json + widget data)
```

## Naming rules

- Folder name = Python filename: `my_module/my_module.py`, `my_api/my_api.py`
- Use **snake_case** for everything, no spaces or hyphens
- The integration `id` in `info.cfg` can differ from the folder name, but keeping them
  the same saves confusion later

## Two kinds of widgets

### Module widget (defined in `WIDGETS` inside `<module>.py`)

Use this when your widget doesn't need a linked user integration. It just renders
something — a clock, a note, a countdown. Config is set per-widget, not through
the integrations manager.

→ See `module/example_module/`

### Integration widget (lives in `integrations/<name>/widgets/<widget>/`)

Use this when users need to configure a server address + credentials once, then
drop the widget wherever they like. The widget fetches data through the integration's
`fetch_payload()` or its own Flask route.

→ See `integration/example_integration/widgets/status/`

### Generic integration widgets (built into the core)

`flex_data`, `metric_display`, `integration_table`, and `integration_events` all work
with any integration's `fetch_payload()` out of the box — no custom widget code needed.
Use a custom widget only when you need data or interactions that those don't support.

## Config field types

Both `WIDGETS[].config_schema` and `INTEGRATION_TYPE.fields` use the same field types:

| type | renders as |
|------|-----------|
| `text` | Plain text input |
| `password` | Locked field with vault storage (never sent to the client after save) |
| `select` | Dropdown (or pill buttons for ≤4 options) |
| `textarea` | Multi-line text area |

Password fields are masked as `********` in the UI after saving. Users click "Edit"
to replace the stored value — the old one isn't shown, just replaced.

## Translations

Every module and integration should ship with `lang/enUS.js` at minimum.
Add `lang/deDE.js` for German. More locales are fine, just follow the same pattern.

```js
window.i18n.registerModuleTranslations('my_module', 'en-US', {
    'my_module_title': 'My Widget',
    'my_module_empty': 'Nothing to show yet.',
});
```

In your JS renderer, always go through i18n rather than hardcoding strings:

```js
const t = (key, fallback) => {
    if (!window.i18n) return fallback;
    const v = window.i18n.translate(key);
    return v === key ? fallback : v;
};
```

## ZIP packaging

```
my_module.zip
└── my_module/          ← exactly one top-level folder
    ├── info.cfg
    ├── my_module.py
    ├── my_module.js
    └── ...
```

One top-level folder, max 15 MB. The validator rejects archives with `..` paths or
files named `app.py`, `database.py`, `auth.py`, or similar core filenames.

## Auto-refresh

Set a default refresh interval in `info.cfg`:

```ini
[info]
default_refresh_interval = 30
```

Or set `default_refresh_interval = 0` to disable auto-refresh by default.
Users can override the interval per-widget in the widget config panel.

## More reading

- `homy/package_validator.py` — what the validator checks before allowing installation
- Any existing integration (e.g. `homy/integrations/jellyfin/`) for real-world examples
