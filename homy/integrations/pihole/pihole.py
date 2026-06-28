"""Pi-hole integration."""

import requests

INTEGRATION_TYPE = {
    'name': 'Pi-hole',
    'icon': 'shield',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Pi-hole URL', 'default': 'http://pi.hole/admin'},
        'api_token': {'type': 'password', 'label': 'API Token', 'default': ''},
    },
    'metrics': [
        {'path': 'dns_queries_today', 'label': 'DNS Anfragen heute'},
        {'path': 'ads_blocked_today', 'label': 'Geblockte Anfragen'},
        {'path': 'ads_percentage_today', 'label': 'Blockiert %'},
    ],
}


def fetch_payload(config):
    server_url = config.get('server_url', '').strip().rstrip('/')
    token = config.get('api_token', '').strip()
    if not server_url or not token:
        raise ValueError('Pi-hole URL und Token erforderlich')

    res = requests.get(f'{server_url}/api.php?summaryRaw&auth={token}', timeout=5)
    res.raise_for_status()
    data = res.json()
    return {
        'dns_queries_today': data.get('dns_queries_today', 0),
        'ads_blocked_today': data.get('ads_blocked_today', 0),
        'ads_percentage_today': round(data.get('ads_percentage_today', 0), 1),
        'status': data.get('status', 'unknown'),
    }
