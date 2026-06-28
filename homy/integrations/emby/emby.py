"""Emby integration (Jellyfin-compatible API)."""

import requests

INTEGRATION_TYPE = {
    'name': 'Emby',
    'icon': 'play-circle',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Server URL', 'default': 'http://localhost:8096'},
        'api_key': {'type': 'password', 'label': 'API Key', 'default': ''},
    },
    'metrics': [
        {'path': 'active_sessions', 'label': 'Active streams'},
        {'path': 'total_movies', 'label': 'Movies'},
        {'path': 'total_series', 'label': 'TV shows'},
    ],
}


def fetch_payload(config):
    server_url = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not server_url or not api_key:
        raise ValueError('Emby URL and API key are required')

    headers = {'X-Emby-Token': api_key, 'X-MediaBrowser-Token': api_key}
    sessions = requests.get(f'{server_url}/Sessions', headers=headers, timeout=8).json()
    active = len([s for s in sessions if s.get('NowPlayingItem')])
    counts = requests.get(f'{server_url}/Items/Counts', headers=headers, timeout=8).json()
    return {
        'active_sessions': active,
        'total_movies': counts.get('MovieCount', 0),
        'total_series': counts.get('SeriesCount', 0),
    }
