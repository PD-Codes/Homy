"""Immich integration."""

import requests

INTEGRATION_TYPE = {
    'name': 'Immich',
    'icon': 'image',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Server URL', 'default': 'http://localhost:2283'},
        'api_key': {'type': 'password', 'label': 'API Key', 'default': ''},
    },
    'metrics': [
        {'path': 'photos', 'label': 'Fotos'},
        {'path': 'videos', 'label': 'Videos'},
        {'path': 'usage', 'label': 'Speicher (Bytes)'},
        {'path': 'version', 'label': 'Version'},
    ],
}


def fetch_payload(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('Immich URL und API Key erforderlich')

    headers = {'x-api-key': api_key, 'Accept': 'application/json'}
    info_res = requests.get(f'{base}/api/server-info', headers=headers, timeout=10)
    info_res.raise_for_status()
    stats_res = requests.get(f'{base}/api/server/statistics', headers=headers, timeout=10)
    stats_res.raise_for_status()
    info_data = info_res.json()
    stats_data = stats_res.json()

    photos = stats_data.get('photos')
    videos = stats_data.get('videos')
    if photos is None and isinstance(stats_data.get('usageByUser'), list):
        photos = sum(u.get('photos', 0) for u in stats_data['usageByUser'])
    if videos is None and isinstance(stats_data.get('usageByUser'), list):
        videos = sum(u.get('videos', 0) for u in stats_data['usageByUser'])

    return {
        'version': info_data.get('version'),
        'photos': photos or 0,
        'videos': videos or 0,
        'usage': stats_data.get('usage', 0),
    }
