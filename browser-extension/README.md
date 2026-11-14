# Homy browser add-on

Source lives in [`../frontend`](../frontend) (shared with the web app). Build:

```bash
cd frontend && npm ci && npm run build:ext
```

Packages land in `browser-extension/dist/`:

* `homy-<version>-chrome.zip` – Chrome, Edge, Brave, Vivaldi
* `homy-<version>-firefox.zip` – Firefox 115+
* `homy-<version>-opera.zip` – Opera (no new-tab override allowed; Speed Dial is redirected)
* `unpacked-<browser>/` – for "Load unpacked" during development

## What it does

* **Works without a server.** Local tabs with search, clock, weather (Open-Meteo, no key), notes/checklists,
  countdown, links, browser bookmarks and most-visited sites. Stored in `chrome.storage.local`.
* **With Homy:** ⚙ → *Homy-Verbindung* → server URL → sign in (or paste a token from Homy ⚙ → Konto).
  Homy tabs appear next to local tabs (cloud icon), are editable, and stay available offline as a copy.
  Integration widgets (Pi-hole, Zabbix, Proxmox …) are shown via `/embed/widget/<id>`.
* Same shortcuts as the web app: `Ctrl+K` / `/` search & commands, `E` edit, `A` add widget, `1–9` tabs, `R` refresh.

Requires Homy ≥ 0.2.0 on the server (API v2, tokens, embed pages).
