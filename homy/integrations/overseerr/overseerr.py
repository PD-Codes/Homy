"""Overseerr integration."""

import requests

INTEGRATION_TYPE = {
    'name': 'Overseerr',
    'icon': 'clapperboard',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Server URL', 'default': 'http://localhost:5055'},
        'api_key': {'type': 'password', 'label': 'API Key', 'default': ''},
    },
    'metrics': [
        {'path': 'pending', 'label': 'Ausstehend'},
        {'path': 'approved', 'label': 'Genehmigt'},
        {'path': 'available', 'label': 'Verfügbar'},
        {'path': 'processing', 'label': 'In Bearbeitung'},
    ],
}


def fetch_payload(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('Overseerr URL und API Key erforderlich')

    headers = {'X-Api-Key': api_key, 'Accept': 'application/json'}
    count_res = requests.get(f'{base}/api/v1/request/count', headers=headers, timeout=10)
    count_res.raise_for_status()
    status_res = requests.get(f'{base}/api/v1/status', headers=headers, timeout=10)
    status_res.raise_for_status()
    counts = count_res.json()

    return {
        'pending': counts.get('pending', 0),
        'approved': counts.get('approved', 0),
        'available': counts.get('available', 0),
        'processing': counts.get('processing', 0),
        'declined': counts.get('declined', 0),
        'status': status_res.json(),
    }
