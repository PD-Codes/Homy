"""Tautulli integration."""

import requests

INTEGRATION_TYPE = {
    'name': 'Tautulli',
    'icon': 'bar-chart-2',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Server URL', 'default': 'http://localhost:8181'},
        'api_key': {'type': 'password', 'label': 'API Key', 'default': ''},
    },
    'metrics': [
        {'path': 'stream_count', 'label': 'Aktive Streams'},
        {'path': 'stream_count_direct_play', 'label': 'Direct Play'},
        {'path': 'stream_count_direct_stream', 'label': 'Direct Stream'},
        {'path': 'stream_count_transcode', 'label': 'Transcodes'},
    ],
}


def fetch_payload(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('Tautulli URL und API Key erforderlich')

    res = requests.get(
        f'{base}/api/v2',
        params={'apikey': api_key, 'cmd': 'get_activity'},
        timeout=10,
    )
    res.raise_for_status()
    body = res.json()
    data = body.get('response', {}).get('data', {}) if isinstance(body, dict) else {}
    sessions = data.get('sessions') or data.get('stream_count') or []
    if isinstance(sessions, list):
        stream_count = len(sessions)
    else:
        stream_count = int(data.get('stream_count') or 0)

    return {
        'stream_count': stream_count,
        'stream_count_direct_play': data.get('stream_count_direct_play', 0),
        'stream_count_direct_stream': data.get('stream_count_direct_stream', 0),
        'stream_count_transcode': data.get('stream_count_transcode', 0),
        'sessions': sessions if isinstance(sessions, list) else [],
    }
