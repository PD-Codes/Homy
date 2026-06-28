"""Portainer integration."""

import requests

INTEGRATION_TYPE = {
    'name': 'Portainer',
    'icon': 'container',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Server URL', 'default': 'https://localhost:9443'},
        'api_key': {'type': 'password', 'label': 'API Key', 'default': ''},
    },
    'metrics': [
        {'path': 'version', 'label': 'Version'},
        {'path': 'endpoints_count', 'label': 'Endpoints'},
        {'path': 'instance_id', 'label': 'Instanz-ID'},
    ],
}


def fetch_payload(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('Portainer URL und API Key erforderlich')

    headers = {'X-API-Key': api_key, 'Accept': 'application/json'}
    status = requests.get(f'{base}/api/status', headers=headers, timeout=10)
    status.raise_for_status()
    endpoints = requests.get(f'{base}/api/endpoints', headers=headers, timeout=10)
    endpoints.raise_for_status()
    status_data = status.json()
    endpoint_list = endpoints.json()
    if not isinstance(endpoint_list, list):
        endpoint_list = []

    return {
        'version': status_data.get('Version') or status_data.get('version'),
        'instance_id': status_data.get('InstanceID') or status_data.get('instanceID'),
        'endpoints_count': len(endpoint_list),
        'endpoints': endpoint_list,
    }
