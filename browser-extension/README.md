# Homy Browser Extension

Companion extension for [Homy](https://github.com/PD-Codes/Homy) (Firefox, Chrome, Opera).

## Features

- **Login** — server URL, username/password (session cookie), optional MFA
- **Bookmark sync (two-way, selectable)** — Homy → Browser: pick individual Homy favorites for the bookmark folder; Browser → Homy: pick browser bookmarks, imported into category **„Aus Browser synchronisiert“** / **„Synced from browser“**
- **New tab** — modes: **Standard** (browser Speed Dial / default), cached Homy dashboard (offline), Homy server, or favorites only. **Opera:** the Opera build redirects from Speed Dial to Homy when a Homy mode is active (`tabs` permission); use `homy-*-opera.zip` in Opera.
- **Offline cache** — dedicated store updated on every successful sync; failed sync never deletes the last snapshot
- **Layout backup** — JSON export of tabs/widgets via Homy API
- **Background sync** — periodic pull from `GET /api/extension/sync`

## Build

Requires Node.js 18+ (no npm dependencies).

```bash
cd browser-extension
npm run build
```

Artifacts in `dist/`:

- `homy-<version>-chrome.zip`
- `homy-<version>-firefox.zip`
- `homy-<version>-opera.zip`

Version is read from `../pyproject.toml`. Override with `HOMY_VERSION=1.2.3 npm run build`.

## Install (development)

1. Build or load `browser-extension/chrome` after copying `shared/` + `manifest.json` + icons (use build output).
2. **Chrome / Opera**: `chrome://extensions` → Developer mode → Load unpacked (extract zip or use staging folder).
3. **Firefox**: `about:debugging` → This Firefox → Load temporary add-on → pick `manifest.json` from extracted `homy-*-firefox.zip`.

Configure **Server URL** and log in under extension options (include subpath if needed, e.g. `https://nas/homy`). If sync returns HTML 404, update Homy or check the URL.

### Opera and the new tab page

Opera **does not allow** extensions to replace the new tab page — `chrome_url_overrides` is rejected with `'chrome_url_overrides' is not allowed for specified extension ID.` (see [MDN: chrome_settings_overrides](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/chrome_settings_overrides)). The `homy-*-opera.zip` build therefore omits that key (which also fixes the manifest error and lets the service worker load).

Instead, the Opera build uses a **background redirect**: when a Homy new-tab mode is active, opening Speed Dial is redirected to the Homy page. Depending on the Opera version this may show Speed Dial briefly or, if Opera blocks the redirect, not at all. Reliable fallbacks:

- Use **“Open Homy new tab”** in the extension options (always works).
- Pin a **Speed Dial entry** to the Homy page (open it once, then add to Speed Dial).

Use `homy-*-opera.zip` in Opera and reload the extension after updates.

## Project layout

| Path | Purpose |
|------|---------|
| `shared/` | Common JS/HTML/CSS |
| `chrome/`, `firefox/`, `opera/` | Per-browser `manifest.json` |
| `scripts/build.mjs` | Packages `homy-<version>-<browser>.zip` |
| `_locales/` | Manifest i18n (de/en) |

## Server requirements

Homy must allow extension origins (built into Homy CORS for `moz-extension://`, `chrome-extension://`). User must be logged in; sync uses session cookies (`credentials: 'include'`).
