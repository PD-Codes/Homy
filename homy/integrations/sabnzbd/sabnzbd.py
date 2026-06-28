"""SABnzbd integration."""

import requests

INTEGRATION_TYPE = {
    'name': 'SABnzbd',
    'icon': 'download',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Server URL', 'default': 'http://localhost:8080'},
        'api_key': {'type': 'password', 'label': 'API Key', 'default': ''},
    },
    'metrics': [
        {'path': 'queue_size', 'label': 'Queue Größe'},
        {'path': 'speed', 'label': 'Geschwindigkeit'},
        {'path': 'kbpersec', 'label': 'KB/s'},
        {'path': 'noofslots_total', 'label': 'Slots gesamt'},
    ],
}


def fetch_payload(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('SABnzbd URL und API Key erforderlich')

    res = requests.get(
        f'{base}/api',
        params={'mode': 'queue', 'output': 'json', 'apikey': api_key},
        timeout=10,
    )
    res.raise_for_status()
    data = res.json()
    queue = data.get('queue') or {}

    return {
        'queue_size': queue.get('noofslots', 0),
        'noofslots_total': queue.get('noofslots_total', queue.get('noofslots', 0)),
        'speed': queue.get('speed', '0'),
        'kbpersec': queue.get('kbpersec', '0'),
        'status': queue.get('status', 'Unknown'),
        'paused': queue.get('paused', False),
    }
