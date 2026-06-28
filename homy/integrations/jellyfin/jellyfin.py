"""Jellyfin integration."""

import requests

INTEGRATION_TYPE = {
    'name': 'Jellyfin',
    'icon': 'play-circle',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Server URL', 'default': 'http://localhost:8096'},
        'api_key': {'type': 'password', 'label': 'API Key', 'default': ''},
    },
    'metrics': [
        {'path': 'active_sessions', 'label': 'Aktive Streams'},
        {'path': 'total_movies', 'label': 'Filme gesamt'},
        {'path': 'total_series', 'label': 'Serien gesamt'},
    ],
}


def fetch_payload(config):
    server_url = config.get('server_url', '').strip().rstrip('/')
    api_key = config.get('api_key', '').strip()
    if not server_url or not api_key:
        raise ValueError('Jellyfin URL und API Key erforderlich')

    headers = {'X-MediaBrowser-Token': api_key}
    sessions = requests.get(f'{server_url}/Sessions', headers=headers, timeout=5).json()
    active = len([s for s in sessions if s.get('NowPlayingItem')])
    movies = requests.get(f'{server_url}/Items/Counts', headers=headers, timeout=5).json()
    return {
        'active_sessions': active,
        'total_movies': movies.get('MovieCount', 0),
        'total_series': movies.get('SeriesCount', 0),
    }
