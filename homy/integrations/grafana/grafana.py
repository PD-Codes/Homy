"""Grafana integration."""

import requests

INTEGRATION_TYPE = {
    'name': 'Grafana',
    'icon': 'bar-chart-2',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Grafana URL', 'default': 'http://localhost:3000'},
        'api_key': {'type': 'password', 'label': 'Service Account Token', 'default': ''},
    },
    'metrics': [
        {'path': 'dashboard_count', 'label': 'Dashboards'},
        {'path': 'health.database', 'label': 'Database status'},
    ],
}


def fetch_payload(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('Grafana URL and Service Account Token are required')

    headers = {'Authorization': f'Bearer {api_key}', 'Accept': 'application/json'}
    health_res = requests.get(f'{base}/api/health', headers=headers, timeout=8)
    health_res.raise_for_status()
    health = health_res.json() if health_res.content else {}

    dash_res = requests.get(
        f'{base}/api/search',
        params={'type': 'dash-db'},
        headers=headers,
        timeout=10,
    )
    dash_res.raise_for_status()
    dashboards = dash_res.json() if dash_res.content else []
    if not isinstance(dashboards, list):
        dashboards = []

    return {
        'health': health,
        'dashboard_count': len(dashboards),
        'dashboards': [
            {'uid': d.get('uid'), 'title': d.get('title'), 'uri': d.get('uri', '')}
            for d in dashboards[:50]
        ],
    }
