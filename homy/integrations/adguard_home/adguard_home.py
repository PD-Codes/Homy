"""AdGuard Home integration."""

import requests

INTEGRATION_TYPE = {
    'name': 'AdGuard Home',
    'icon': 'shield-check',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Server URL', 'default': 'http://localhost:3000'},
        'username': {'type': 'text', 'label': 'Benutzername', 'default': ''},
        'password': {'type': 'password', 'label': 'Passwort', 'default': ''},
    },
    'metrics': [
        {'path': 'dns_queries', 'label': 'DNS Anfragen'},
        {'path': 'blocked_filtering', 'label': 'Geblockt (Filter)'},
        {'path': 'num_dns_queries', 'label': 'Anfragen gesamt'},
        {'path': 'protection_enabled', 'label': 'Schutz aktiv'},
    ],
}


def fetch_payload(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    username = (config.get('username') or '').strip()
    password = config.get('password') or ''
    if not base or not username:
        raise ValueError('AdGuard URL und Benutzername erforderlich')

    auth = (username, password)
    status = requests.get(f'{base}/control/status', auth=auth, timeout=10)
    status.raise_for_status()
    stats = requests.get(f'{base}/control/stats', auth=auth, timeout=10)
    stats.raise_for_status()
    status_data = status.json()
    stats_data = stats.json()

    return {
        'protection_enabled': status_data.get('protection_enabled', False),
        'dns_queries': stats_data.get('dns_queries', 0),
        'blocked_filtering': stats_data.get('blocked_filtering', 0),
        'num_dns_queries': stats_data.get('num_dns_queries', stats_data.get('dns_queries', 0)),
        'avg_processing_time': stats_data.get('avg_processing_time', 0),
    }
