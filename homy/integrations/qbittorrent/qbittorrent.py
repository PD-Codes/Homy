"""qBittorrent integration."""

import requests

INTEGRATION_TYPE = {
    'name': 'qBittorrent',
    'icon': 'download-cloud',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Server URL', 'default': 'http://localhost:8080'},
        'username': {'type': 'text', 'label': 'Benutzername (optional)', 'default': ''},
        'password': {'type': 'password', 'label': 'Passwort (optional)', 'default': ''},
    },
    'metrics': [
        {'path': 'version', 'label': 'Version'},
        {'path': 'dl_speed', 'label': 'Download-Geschwindigkeit'},
        {'path': 'up_speed', 'label': 'Upload-Geschwindigkeit'},
        {'path': 'dl_info_data', 'label': 'Heruntergeladen (Bytes)'},
        {'path': 'connection_status', 'label': 'Verbindungsstatus'},
    ],
}


def _auth(config):
    user = (config.get('username') or '').strip()
    pwd = config.get('password') or ''
    if user:
        return (user, pwd)
    return None


def fetch_payload(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    if not base:
        raise ValueError('qBittorrent URL erforderlich')

    auth = _auth(config)
    version_res = requests.get(f'{base}/api/v2/app/version', auth=auth, timeout=10)
    version_res.raise_for_status()
    transfer_res = requests.get(f'{base}/api/v2/transfer/info', auth=auth, timeout=10)
    transfer_res.raise_for_status()
    transfer = transfer_res.json()

    return {
        'version': version_res.text.strip('"'),
        'dl_speed': transfer.get('dl_info_speed', 0),
        'up_speed': transfer.get('up_info_speed', 0),
        'dl_info_data': transfer.get('dl_info_data', 0),
        'connection_status': transfer.get('connection_status', 'unknown'),
    }
