"""Glances integration."""

import requests

INTEGRATION_TYPE = {
    'name': 'Glances',
    'icon': 'activity',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Glances URL', 'default': 'http://localhost:61208'},
    },
    'metrics': [
        {'path': 'cpu_percent', 'label': 'CPU %'},
        {'path': 'mem_percent', 'label': 'Memory %'},
        {'path': 'disk_percent', 'label': 'Disk %'},
    ],
}


def fetch_payload(config):
    server_url = config.get('server_url', '').strip().rstrip('/')
    if not server_url:
        raise ValueError('Glances URL required')

    quick = requests.get(f'{server_url}/api/3/quicklook', timeout=5)
    quick.raise_for_status()
    data = quick.json()

    disk_percent = None
    try:
        fs = requests.get(f'{server_url}/api/3/fs', timeout=5).json()
        mount = config.get('disk_mount', '/').strip() or '/'
        for entry in fs if isinstance(fs, list) else []:
            if entry.get('mnt_point') == mount:
                disk_percent = entry.get('percent')
                break
        if disk_percent is None and fs:
            disk_percent = fs[0].get('percent')
    except Exception:
        pass

    return {
        'cpu_percent': data.get('cpu', 0),
        'mem_percent': data.get('mem', 0),
        'disk_percent': disk_percent,
        'configured': True,
    }
