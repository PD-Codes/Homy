# Example Module (`example_module`)

A minimal module with one frontend-only widget. No backend API, no integration required.
Good starting point if you just want to render something on the dashboard.

## Files

| File | Purpose |
|------|---------|
| `info.cfg` | Module name, author, default refresh interval |
| `example_module.py` | Declares the `WIDGETS` list; optionally registers Flask routes |
| `example_module.js` | Registers the widget renderer with `WidgetRegistry.register(...)` |
| `example_module.css` | Widget-specific styles (optional) |
| `lang/enUS.js` | English strings |
| `lang/deDE.js` | German strings (add more locales as needed) |

## Getting started

1. Copy the whole `example_module/` folder and rename everything to your module name.
   Both the **folder** and the **Python file** inside must share the same name.
2. In `example_module.py`, update the `type` field in `WIDGETS`. This string is the
   widget's unique identifier — it has to match the key passed to `WidgetRegistry.register`.
3. In `example_module.js`, update the same type string at the top.
4. Fill in your actual widget logic inside `render(container, widgetData, config)`.

## Adding a backend route

If your widget needs to fetch data from a server or do any server-side work, add a
Flask route inside `register(app)` in the Python file:

```python
def register(app):
    @app.route('/api/my_widget/data', methods=['GET'])
    def my_widget_data():
        return jsonify({'value': 42})
```

Then call it from your JS renderer:

```js
const data = await API.request('/api/my_widget/data?widget_id=' + widgetData.id);
```

## Multiple widgets in one module

Just add more entries to the `WIDGETS` list in the Python file, and call
`WidgetRegistry.register(...)` multiple times in the JS file — once per widget type.

## Installing via ZIP

```
my_module.zip
└── my_module/
    ├── info.cfg
    ├── my_module.py
    ├── my_module.js
    ├── my_module.css    (optional)
    └── lang/
        ├── enUS.js
        └── deDE.js
```

Upload under Admin → Media & Packages, then click **Install**, then reload the page.

## Tip

Look at `homy/modules/clock/` or `homy/modules/countdown/` for real working examples
of modules with i18n and a self-updating render loop.
