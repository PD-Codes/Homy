"""Lidarr integration."""

from homy.integration_arr_helpers import fetch_arr_queue_stats

INTEGRATION_TYPE = {
    'name': 'Lidarr',
    'icon': 'music',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Server URL', 'default': 'http://localhost:8686'},
        'api_key': {'type': 'password', 'label': 'API Key', 'default': ''},
    },
    'metrics': [
        {'path': 'queue_total', 'label': 'Queue gesamt'},
        {'path': 'queue_count', 'label': 'Queue Einträge'},
        {'path': 'version', 'label': 'Version'},
        {'path': 'app_name', 'label': 'App Name'},
    ],
}


def fetch_payload(config):
    return fetch_arr_queue_stats(
        config.get('server_url'),
        config.get('api_key'),
        api_version='v1',
    )
