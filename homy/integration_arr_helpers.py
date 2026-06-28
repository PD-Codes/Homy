"""Shared fetch helpers for *arr-style and download-client integration plugins."""

import requests


def _headers(api_key):
    return {'X-Api-Key': api_key, 'Accept': 'application/json'}


def fetch_arr_queue_stats(server_url, api_key, api_version='v3'):
    base = (server_url or '').strip().rstrip('/')
    if not base or not api_key:
        raise ValueError('Server URL und API Key erforderlich')

    headers = _headers(api_key)
    status = requests.get(f'{base}/api/{api_version}/system/status', headers=headers, timeout=10)
    status.raise_for_status()
    status_data = status.json()

    queue = requests.get(f'{base}/api/{api_version}/queue', headers=headers, timeout=10)
    queue.raise_for_status()
    queue_data = queue.json()
    records = queue_data.get('records', queue_data if isinstance(queue_data, list) else [])

    return {
        'app_name': status_data.get('appName') or status_data.get('instanceName'),
        'version': status_data.get('version'),
        'queue_total': queue_data.get('totalRecords', len(records)),
        'queue_count': len(records),
        'queue': records,
    }


def fetch_prowlarr_stats(server_url, api_key):
    base = (server_url or '').strip().rstrip('/')
    if not base or not api_key:
        raise ValueError('Prowlarr URL und API Key erforderlich')
    headers = _headers(api_key)
    status = requests.get(f'{base}/api/v1/system/status', headers=headers, timeout=10)
    status.raise_for_status()
    indexers = requests.get(f'{base}/api/v1/indexer', headers=headers, timeout=10)
    indexers.raise_for_status()
    items = indexers.json()
    enabled = sum(1 for i in items if i.get('enable'))
    return {
        'version': status.json().get('version'),
        'indexers_total': len(items),
        'indexers_enabled': enabled,
        'indexers': items,
    }


ARR_API_VERSIONS = {
    'sonarr': 'v3',
    'radarr': 'v3',
    'lidarr': 'v1',
    'readarr': 'v1',
}


def fetch_arr_for_type(integration_type, config):
    itype = (integration_type or '').strip().lower()
    version = ARR_API_VERSIONS.get(itype, 'v3')
    return fetch_arr_queue_stats(
        config.get('server_url'),
        config.get('api_key'),
        api_version=version,
    )


def normalize_arr_queue_item(record, integration_type):
    if not isinstance(record, dict):
        return {'title': 'Unknown', 'status': '', 'progress': 0}
    title = record.get('title') or ''
    itype = (integration_type or '').lower()
    if not title and itype == 'sonarr':
        series = record.get('series') or {}
        ep = record.get('episode') or {}
        title = f"{series.get('title', '')} — {ep.get('title', '')}".strip(' —')
    if not title and itype == 'radarr':
        movie = record.get('movie') or {}
        title = movie.get('title') or movie.get('sortTitle') or ''
    if not title:
        title = record.get('sourceTitle') or 'Queue item'
    size = float(record.get('size') or record.get('sizebytes') or 0)
    left = float(record.get('sizeleft') or record.get('remainingSize') or 0)
    progress = 0
    if size > 0:
        progress = round(max(0, min(100, ((size - left) / size) * 100)), 1)
    eta = record.get('estimatedCompletionTime') or ''
    if eta and 'T' in eta:
        eta = eta.split('T')[1][:5]
    return {
        'title': title,
        'status': record.get('status') or record.get('trackedDownloadStatus') or '',
        'progress': progress,
        'sizeleft': left,
        'eta': eta,
        'protocol': record.get('protocol') or '',
    }


def fetch_bazarr_stats(server_url, api_key):
    base = (server_url or '').strip().rstrip('/')
    if not base or not api_key:
        raise ValueError('Bazarr URL und API Key erforderlich')
    headers = _headers(api_key)
    status = requests.get(f'{base}/api/system/status', headers=headers, timeout=10)
    status.raise_for_status()
    data = status.json()
    return {
        'version': data.get('bazarr_version') or data.get('version'),
        'movies': data.get('movies', 0),
        'episodes': data.get('episodes', 0),
        'missing_movies': data.get('missing_movies', 0),
        'missing_episodes': data.get('missing_episodes', 0),
    }
