"""Bazarr integration."""

from homy.integration_arr_helpers import fetch_bazarr_stats

INTEGRATION_TYPE = {
    'name': 'Bazarr',
    'icon': 'subtitles',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Server URL', 'default': 'http://localhost:6767'},
        'api_key': {'type': 'password', 'label': 'API Key', 'default': ''},
    },
    'metrics': [
        {'path': 'movies', 'label': 'Filme'},
        {'path': 'episodes', 'label': 'Episoden'},
        {'path': 'missing_movies', 'label': 'Fehlende Filme'},
        {'path': 'missing_episodes', 'label': 'Fehlende Episoden'},
        {'path': 'version', 'label': 'Version'},
    ],
}


def fetch_payload(config):
    return fetch_bazarr_stats(config.get('server_url'), config.get('api_key'))
