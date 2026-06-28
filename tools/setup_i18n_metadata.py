#!/usr/bin/env python3
"""Update info.cfg metadata and generate lang/ stubs for modules and integrations."""

from __future__ import annotations

import configparser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULES = ROOT / 'homy' / 'modules'
INTEGRATIONS = ROOT / 'homy' / 'integrations'

AUTHOR = 'Domekologe'
URL = 'https://github.com/PD-Codes'

# English descriptions per folder name (fallback: title-cased id)
DESCRIPTIONS = {
    'jellyfin': 'Connects to Jellyfin and shows active streams and library statistics.',
    'emby': 'Connects to Emby and shows active streams and library statistics.',
    'plex': 'Connects to Plex and shows active sessions and library statistics.',
    'grafana': 'Displays Grafana dashboard panels and metrics.',
    'rss_feed': 'Shows items from one or more RSS/Atom feeds.',
    'sonarr': 'TV series queue, downloads, and upcoming episodes.',
    'radarr': 'Movie queue, downloads, and upcoming releases.',
    'lidarr': 'Music queue, downloads, and upcoming albums.',
    'prowlarr': 'Indexer status and configuration overview.',
    'portainer': 'Docker container and stack overview.',
    'uptime_kuma': 'Monitor uptime status summary.',
    'tautulli': 'Plex/Tautulli activity and stream overview.',
    'sabnzbd': 'Usenet queue status and download speed.',
    'pihole': 'DNS statistics and blocking overview.',
    'proxmox': 'Virtual machine and node status.',
    'homeassistant': 'Home Assistant entities and states.',
    'glances': 'System CPU, memory, and disk metrics.',
    'zabbix': 'Zabbix monitoring — hosts, problems, and severity overview via JSON-RPC.',
    'torrent': 'qBittorrent or Transmission download status.',
    'seerr': 'Media requests and approval status.',
    'weather': 'Current weather and forecast.',
    'clock': 'Date, time, and optional timezone display.',
    'calendar': 'iCal calendar events.',
    'discord': 'Discord server widget embed.',
    'favorites': 'Bookmark links with categories and icons.',
    'custom_json': 'Custom JSON API data with flexible display.',
    'metric_display': 'Single metric or chart from an integration.',
    'integration_table': 'Tabular or list view of integration data.',
    'integration_events': 'Event feed from integration data.',
    'service_status': 'HTTP service reachability checks.',
    'spacer': 'Empty layout spacer for alignment.',
    'json': 'Generic JSON/REST API data source.',
    'pihole_int': 'Pi-hole DNS statistics integration.',
    'radarr_int': 'Radarr API integration for widgets.',
    'sonarr_int': 'Sonarr API integration for widgets.',
    'lidarr_int': 'Lidarr API integration for widgets.',
    'readarr': 'Readarr API integration for widgets.',
    'prowlarr_int': 'Prowlarr indexer API integration.',
    'bazarr': 'Bazarr subtitles API integration.',
    'transmission': 'Transmission RPC integration.',
    'qbittorrent': 'qBittorrent Web API integration.',
    'portainer_int': 'Portainer API integration.',
    'uptime_kuma_int': 'Uptime Kuma API integration.',
    'tautulli_int': 'Tautulli API integration.',
    'adguard_home': 'AdGuard Home DNS filtering statistics.',
    'overseerr': 'Overseerr request API integration.',
    'immich': 'Immich photo library statistics.',
    'homeassistant_int': 'Home Assistant REST API integration.',
    'sabnzbd_int': 'Sabnzbd API integration.',
    'weather': 'OpenWeather forecast and DWD/NINA weather warnings.',
    'aniworld_downloader': 'MRX AniWorld Downloader API (v1 and legacy routes).',
    'emby_int': 'Emby API integration for widgets.',
    'plex_int': 'Plex API integration for widgets.',
    'grafana_int': 'Grafana HTTP API integration.',
}


def module_lang_js(module_id: str, locale: str) -> str:
    prefix = locale.split('-')[0]
    if prefix == 'de':
        return f"""window.i18n.registerModuleTranslations('{module_id}', '{locale}', {{
    '{module_id}_title': '{module_id.title()}',
    '{module_id}_offline': 'Offline',
    '{module_id}_not_configured': 'Bitte in den Widget-Einstellungen konfigurieren.',
}});
"""
    return f"""window.i18n.registerModuleTranslations('{module_id}', '{locale}', {{
    '{module_id}_title': '{module_id.title()}',
    '{module_id}_offline': 'Offline',
    '{module_id}_not_configured': 'Please configure this widget in settings.',
}});
"""


def integration_lang_js(int_id: str, locale: str) -> str:
    prefix = locale.split('-')[0]
    if prefix == 'de':
        return f"""window.i18n.registerModuleTranslations('integration_{int_id}', '{locale}', {{
    'integration_{int_id}_name': '{int_id}',
}});
"""
    return f"""window.i18n.registerModuleTranslations('integration_{int_id}', '{locale}', {{
    'integration_{int_id}_name': '{int_id}',
}});
"""


def update_info_cfg(path: Path, item_id: str, is_integration: bool):
    if not path.exists():
        return
    cfg = configparser.ConfigParser()
    cfg.read(path, encoding='utf-8')
    if not cfg.has_section('info'):
        cfg.add_section('info')
    desc_key = item_id
    if is_integration and desc_key.endswith('_int'):
        pass
    desc = DESCRIPTIONS.get(desc_key) or DESCRIPTIONS.get(item_id) or f'{item_id.replace("_", " ").title()} module.'
    cfg.set('info', 'author', AUTHOR)
    cfg.set('info', 'url', URL)
    cfg.set('info', 'description', desc)
    if not cfg.has_option('info', 'default_language'):
        cfg.set('info', 'default_language', 'enUS')
    if not cfg.has_option('info', 'version'):
        cfg.set('info', 'version', '1.0.0')
    with path.open('w', encoding='utf-8') as f:
        cfg.write(f)


def ensure_lang_dir(base: Path, item_id: str, is_integration: bool):
    lang_dir = base / 'lang'
    lang_dir.mkdir(exist_ok=True)
    for fname, locale in (('deDE.js', 'de-DE'), ('enUS.js', 'en-US')):
        fp = lang_dir / fname
        if fp.exists():
            continue
        content = integration_lang_js(item_id, locale) if is_integration else module_lang_js(item_id, locale)
        fp.write_text(content, encoding='utf-8')


def main():
    for module_dir in sorted(MODULES.iterdir()):
        if not module_dir.is_dir() or module_dir.name.startswith('_'):
            continue
        update_info_cfg(module_dir / 'info.cfg', module_dir.name, False)
        ensure_lang_dir(module_dir, module_dir.name, False)

    for int_dir in sorted(INTEGRATIONS.iterdir()):
        if not int_dir.is_dir() or int_dir.name.startswith('_'):
            continue
        cfg = configparser.ConfigParser()
        cfg.read(int_dir / 'info.cfg', encoding='utf-8')
        int_id = cfg.get('info', 'id', fallback=int_dir.name).strip() or int_dir.name
        update_info_cfg(int_dir / 'info.cfg', int_id, True)
        ensure_lang_dir(int_dir, int_id, True)

    print('Updated info.cfg and generated missing lang/ files.')


if __name__ == '__main__':
    main()
