"""Home Assistant integration."""

import requests

INTEGRATION_TYPE = {
    'name': 'Home Assistant',
    'icon': 'home',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Server URL', 'default': 'http://localhost:8123'},
        'api_key': {'type': 'password', 'label': 'Long-Lived Access Token', 'default': ''},
    },
    'metrics': [
        {'path': 'entity_count', 'label': 'Entitäten gesamt'},
        {'path': 'message', 'label': 'API Status'},
    ],
}


def fetch_payload(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('Home Assistant URL und API Token erforderlich')

    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }
    api_res = requests.get(f'{base}/api/', headers=headers, timeout=10)
    api_res.raise_for_status()
    message = api_res.json().get('message', 'API running.')

    states_res = requests.get(f'{base}/api/states', headers=headers, timeout=15)
    states_res.raise_for_status()
    states = states_res.json()
    entity_count = len(states) if isinstance(states, list) else 0

    return {
        'message': message,
        'entity_count': entity_count,
    }
