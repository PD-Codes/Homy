# Example Layout Template (`example_layout`)

Layout templates are metadata packages that appear in the Asset Library with a preview
image and description. They don't install code — they're just a way to share dashboard
configurations that users can import.

## ZIP contents

```
example_layout.zip
└── example_layout/
    ├── manifest.json       # required
    ├── preview.png         # optional — shown as a thumbnail (.jpg and .webp work too)
    └── layout.json         # optional — exported widget/tab data users can import
```

## Uploading

Admin → Media & Packages → Package type: **Template**

The package is validated and stored. Users can then browse it in the Asset Library.
There's no automatic installation step — layout templates are import-on-demand.

## manifest.json

Required fields: `type` (must be `"template"`) and `name`.
Everything else is optional metadata shown in the library UI.

## layout.json (optional)

The structure follows the dashboard export format from `/api/layout/export`.
Use the `layout.json.example` file in this folder as a starting point.
Field names can change between versions, so test after a Homy update if you rely on this.
