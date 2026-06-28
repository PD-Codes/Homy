# Homy

**Homy** is a modular, self-hosted homepage dashboard with drag-and-drop widgets, multi-tab layouts, integrations, and a full admin area — built for homelab and daily-driver use.

> [!WARNING]  
> This project is currently in alpha and may contain various bugs. Any help with identifying and reporting issues is greatly appreciated.

![Python](https://img.shields.io/badge/python-3.8%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)

Homy separates **integrations** (credentials & APIs) from **widgets** (what you see on the grid). Configure Pi-hole, Jellyfin, Zabbix, *arr*, Discord, and more once, then drop widgets on any tab.

[↑ Back to top](#homy)

## TL;DR — Quick Start

```bash
# Install (production)
pip install .

# Start dashboard (Waitress, port 8080)
homy

# Custom port
homy -p 9090
# or
homy --port 9090

# Development server (hot reload)
homy --dev

# Verbose terminal logs
homy --debug

# Reset a local user's password (CLI only, then exit)
homy -rP myuser
# or
homy --reset-password myuser
```

Open [http://localhost:8080](http://localhost:8080). On first run, create the admin account in the setup wizard. Data lives under `~/.homy/homy.db` (override with `DATA_DIR`).

[↑ Back to top](#homy)

## CLI

| Flag | Description |
|------|-------------|
| `-p` / `--port` | Listen port (default: `8080`, env `PORT`) |
| `--host` | Listen host (default: `0.0.0.0`, env `HOST`) |
| `--debug` | Verbose logging (favicon cache, HTTP, modules) |
| `--dev` | Flask dev server instead of Waitress |
| `-rP` / `--reset-password` | Reset local user password interactively, then exit |

[↑ Back to top](#homy)

## Highlights

| Feature | Homy |
|--------|------|
| Drag-and-drop grid (24 columns) | Yes, per tab |
| Multi-user + roles | Yes |
| Integration credential vault | Yes |
| Built-in + ZIP integrations | Yes |
| Widget builder from JSON paths | Yes |
| Silent background refresh | Yes |
| Themes + custom per-user colors | Yes |
| Tab backgrounds (media library) | Yes |
| Password reset (SMTP + 6-digit code) | Yes |
| OIDC / SAML / LDAP / MFA | Yes (admin) |
| Docker | Yes |

[↑ Back to top](#homy)

## Widgets vs. integrations

**Integrations** — configure under **Integrationen** (URL, API keys).  
**Widgets** — add to the dashboard; they reference `integration_id` or use display modules (`metric_display`, `favorites`, `clock`, …).

Service-specific UIs (Pi-hole, Zabbix host status, Discord, Overseerr, …) ship under `homy/integrations/<id>/widgets/`.

[↑ Back to top](#homy)

## Built-in integrations (selection)

| Group | Examples |
|-------|----------|
| *arr* | Radarr, Sonarr, Lidarr, Prowlarr, Bazarr |
| Download | qBittorrent, SABnzbd |
| Media | Jellyfin, Emby, Plex, Tautulli, Overseerr, Immich |
| Network | Pi-hole, AdGuard Home |
| Monitoring | Zabbix, Grafana, Uptime Kuma, Glances, Proxmox |
| Other | Discord, Home Assistant, Weather, JSON API, RSS |

[↑ Back to top](#homy)

## Docker

### Local build

```bash
docker compose up -d
```

Maps **8080:8080**. Persist data with a volume on `DATA_DIR` (default in container: configure via env).

### GitHub Container Registry (GHCR)

When you bump `version` in `pyproject.toml` and push to `main`/`master`, GitHub Actions creates a **release** and publishes:

`ghcr.io/<owner>/homy:<version>` and `:latest`

Example (replace owner/repo):

```bash
docker pull ghcr.io/<owner>/homy:latest
docker run -d --name homy -p 8080:8080 \
  -v homy-data:/app/data \
  -e SECRET_KEY=change_me \
  ghcr.io/<owner>/homy:latest
```

Manual re-run: **Actions → Release & Docker → Run workflow** (optional **Force release**).

[↑ Back to top](#homy)

## Releases

1. Raise `version` in `pyproject.toml` (e.g. `0.1.0` → `0.2.0`).
2. Commit and push to `main` or `master`.
3. Workflow `.github/workflows/release.yml` tags `v<version>`, creates a GitHub Release, and pushes the Docker image to GHCR.

[↑ Back to top](#homy)

## Environment variables

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (default `8080`) |
| `HOST` | Bind address (default `0.0.0.0`) |
| `SECRET_KEY` | Flask session secret (**required** in production) |
| `DATA_DIR` | SQLite, uploads, favicon cache (default `~/.homy`) |
| `FLASK_ENV` | `production` or `development` |
| `WAITRESS_THREADS` | Worker threads (default `8`) |

[↑ Back to top](#homy)

## Development

```powershell
# Windows
.\scripts\run-dev.ps1
```

```bash
# Linux / macOS
./scripts/run-dev.sh
```

Editable install: `pip install -e .` then `homy --dev`.

[↑ Back to top](#homy)

## Browser extension

The **Homy Companion** extension (Firefox, Chrome, Opera) lives in [`browser-extension/`](browser-extension/). It connects to your Homy server, syncs selected favorites to browser bookmarks, caches the **desktop** dashboard for the new-tab page, and can download layout backups locally.

```bash
cd browser-extension && npm run build
```

Release builds attach `homy-<version>-chrome.zip`, `homy-<version>-firefox.zip`, and `homy-<version>-opera.zip` to GitHub Releases. See [browser-extension/README.md](browser-extension/README.md).

[↑ Back to top](#homy)

## Contributing

Issues and pull requests are welcome. For larger changes, open an issue first to align scope.

[↑ Back to top](#homy)

## License

See repository license file. Homy is provided **as is**

This project is licensed under the GNU General Public License v3.0 (GPLv3).
See the LICENSE file for details.

