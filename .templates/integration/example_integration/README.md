# Example Integration (`example_integration`)

Full API integration with a built-in status widget. Copy this when you want to let users
configure a server URL + credentials once and then drop widgets wherever they like.

## Folder structure

```
example_integration/
├── info.cfg                        # ID, name, icon, version
├── example_integration.py          # INTEGRATION_TYPE + fetch_payload()
├── lang/
│   ├── enUS.js
│   └── deDE.js
└── widgets/
    └── status/                     # One widget — add more folders for more widgets
        ├── widget.cfg              # Links this widget to the integration type
        ├── status.py               # Flask route + WIDGET metadata
        ├── status.js               # Frontend renderer
        └── status.css
```

## What each file does

**`example_integration.py`** — the integration itself

- `INTEGRATION_TYPE` describes the fields users fill in under Settings → Integrations
- `fetch_payload(config)` is called by generic widgets like `flex_data` and `metric_display`
  to pull live data. It receives the user's stored config (with secrets decrypted).
  Return a plain dict; anything JSON-serializable works.

**`widgets/status/status.py`** — a custom widget for this integration

- `WIDGET` declares the widget's type, name, size defaults, and config fields
- `register(app)` adds a Flask route that the JS renderer calls
- The route looks up the linked integration, fetches data, caches it, and returns JSON

**`widgets/status/status.js`** — renders the widget in the browser

- Calls the Flask route with the widget's ID
- Builds and inserts HTML into the container element
- Uses `_t()` for all user-visible strings so translations work

## Adding another widget

1. Copy `widgets/status/` to `widgets/my_widget/`
2. Update the `type` in `WIDGET` (must be globally unique — prefix with your integration name)
3. Update the `endpoint` in `widget.cfg` to match your new route
4. Update the route path in `status.py` to avoid collisions with existing routes
5. Rename `status.js` to `my_widget.js` and update `WidgetRegistry.register`

## Password fields

Fields with `'type': 'password'` are stored in the vault — the raw value is never
sent back to the browser after the first save. In `config` (the dict passed to
`fetch_payload` and your widget route), the decrypted value is available normally.

## Installation

ZIP up the folder with exactly one top-level directory:

```
example_integration.zip
└── example_integration/
    ├── info.cfg
    ├── example_integration.py
    └── ...
```

Upload under Admin → Media & Packages, click **Install**, then reload.

## Tip

Look at `homy/integrations/jellyfin/` or `homy/integrations/uptime_kuma/` for working
examples of integrations with multiple widgets and full i18n support.
