"""Prowlarr integration."""

from homy.integration_arr_helpers import fetch_prowlarr_stats

INTEGRATION_TYPE = {
    'name': 'Prowlarr',
    'icon': 'radar',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Server URL', 'default': 'http://localhost:9696'},
        'api_key': {'type': 'password', 'label': 'API Key', 'default': ''},
    },
    'metrics': [
        {'path': 'indexers_total', 'label': 'Indexer gesamt'},
        {'path': 'indexers_enabled', 'label': 'Indexer aktiv'},
        {'path': 'version', 'label': 'Version'},
    ],
}


def fetch_payload(config):
    return fetch_prowlarr_stats(config.get('server_url'), config.get('api_key'))
