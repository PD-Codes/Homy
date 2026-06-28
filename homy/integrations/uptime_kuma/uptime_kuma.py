"""Uptime Kuma integration."""

import requests

INTEGRATION_TYPE = {
    'name': 'Uptime Kuma',
    'icon': 'activity',
    'fields': {
        'base_url': {'type': 'text', 'label': 'Base URL', 'default': 'http://localhost:3001'},
        'api_key': {'type': 'password', 'label': 'API Key', 'default': ''},
        'slug': {'type': 'text', 'label': 'Status-Page Slug (optional)', 'default': ''},
    },
    'metrics': [
        {'path': 'heartbeat_count', 'label': 'Heartbeats'},
        {'path': 'up_count', 'label': 'Monitore UP'},
        {'path': 'down_count', 'label': 'Monitore DOWN'},
        {'path': 'monitor_count', 'label': 'Monitore gesamt'},
    ],
}


def _count_monitors(entries):
    if not isinstance(entries, list):
        return 0, 0, 0
    up = down = 0
    for item in entries:
        status = item.get('status') if isinstance(item, dict) else None
        if status in (1, 'up', 'UP'):
            up += 1
        elif status in (0, 'down', 'DOWN'):
            down += 1
    return len(entries), up, down


def fetch_payload(config):
    base = (config.get('base_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    slug = (config.get('slug') or '').strip()
    if not base:
        raise ValueError('Uptime Kuma Base URL erforderlich')

    if slug:
        res = requests.get(f'{base}/api/status-page/{slug}', timeout=10)
        res.raise_for_status()
        data = res.json()
        public_list = data.get('publicGroupList') or data.get('heartbeatList') or []
        heartbeats = data.get('heartbeatList') or []
        if isinstance(public_list, list) and public_list and isinstance(public_list[0], dict):
            monitor_list = []
            for group in public_list:
                monitor_list.extend(group.get('monitorList') or [])
            total, up, down = _count_monitors(monitor_list)
        else:
            total = len(heartbeats) if isinstance(heartbeats, list) else 0
            up = down = 0
        return {
            'heartbeat_count': total,
            'up_count': up,
            'down_count': down,
            'monitor_count': total,
            'slug': slug,
        }

    if not api_key:
        raise ValueError('API Key erforderlich ohne Status-Page Slug')

    headers = {'Authorization': f'Bearer {api_key}', 'Accept': 'application/json'}
    res = requests.get(f'{base}/api/entry', headers=headers, timeout=10)
    res.raise_for_status()
    entries = res.json()
    if not isinstance(entries, list):
        entries = entries.get('entries') or entries.get('data') or []
    total, up, down = _count_monitors(entries)
    return {
        'heartbeat_count': total,
        'up_count': up,
        'down_count': down,
        'monitor_count': total,
        'entries': entries,
    }
