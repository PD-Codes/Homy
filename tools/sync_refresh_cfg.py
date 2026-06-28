#!/usr/bin/env python3
"""Write default_refresh_interval into each module info.cfg from known defaults."""

from __future__ import annotations

import configparser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULES = ROOT / 'homy' / 'modules'

# Module folder -> seconds (0 = disabled)
MODULE_DEFAULTS = {
    'spacer': 0,
    'favorites': 0,
    'clock': 0,
    'weather': 300,
    'weather_warnings': 300,
    'openweather_card': 900,
    'calendar': 300,
    'discord': 30,
    'jellyfin': 15,
    'emby': 15,
    'plex': 15,
    'grafana': 60,
    'rss_feed': 300,
    'torrent': 15,
    'pihole': 30,
    'proxmox': 30,
    'homeassistant': 20,
    'radarr': 60,
    'sonarr': 60,
    'lidarr': 60,
    'prowlarr': 60,
    'portainer': 30,
    'uptime_kuma': 60,
    'tautulli': 15,
    'sabnzbd': 15,
    'seerr': 60,
    'glances': 30,
    'service_status': 60,
    'metric_display': 30,
    'integration_table': 60,
    'integration_events': 30,
}

# Multi-widget modules: per widget type in [refresh]
REFRESH_OVERRIDES = {
    'custom_json': {
        'json_graph': 30,
        'json_custom': 30,
    },
}


def main():
    for module_dir in sorted(MODULES.iterdir()):
        if not module_dir.is_dir() or module_dir.name.startswith('_'):
            continue
        info_path = module_dir / 'info.cfg'
        if not info_path.exists():
            continue

        name = module_dir.name
        cfg = configparser.ConfigParser()
        cfg.read(info_path, encoding='utf-8')
        if not cfg.has_section('info'):
            cfg.add_section('info')

        if name in REFRESH_OVERRIDES:
            if not cfg.has_section('refresh'):
                cfg.add_section('refresh')
            for wtype, seconds in REFRESH_OVERRIDES[name].items():
                cfg.set('refresh', wtype, str(seconds))
        elif name in MODULE_DEFAULTS:
            cfg.set('info', 'default_refresh_interval', str(MODULE_DEFAULTS[name]))
        else:
            cfg.set('info', 'default_refresh_interval', '30')

        with info_path.open('w', encoding='utf-8') as f:
            cfg.write(f)
        print(f'Updated {info_path.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
