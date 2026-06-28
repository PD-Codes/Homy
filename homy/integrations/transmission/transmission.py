"""Transmission integration."""

import requests

INTEGRATION_TYPE = {
    'name': 'Transmission',
    'icon': 'download',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Server URL', 'default': 'http://localhost:9091'},
        'username': {'type': 'text', 'label': 'Benutzername (optional)', 'default': ''},
        'password': {'type': 'password', 'label': 'Passwort (optional)', 'default': ''},
    },
    'metrics': [
        {'path': 'downloaded_bytes', 'label': 'Heruntergeladen (Bytes)'},
        {'path': 'upload_speed', 'label': 'Upload-Geschwindigkeit'},
        {'path': 'download_speed', 'label': 'Download-Geschwindigkeit'},
        {'path': 'torrent_count', 'label': 'Torrents gesamt'},
    ],
}


def _transmission_rpc(base, username, password, method, arguments=None):
    url = f'{base}/transmission/rpc'
    auth = None
    user = (username or '').strip()
    pwd = password or ''
    if user:
        auth = (user, pwd)

    payload = {'method': method}
    if arguments:
        payload['arguments'] = arguments

    headers = {'Content-Type': 'application/json'}
    session_id = None

    for _ in range(2):
        req_headers = dict(headers)
        if session_id:
            req_headers['X-Transmission-Session-Id'] = session_id
        res = requests.post(url, json=payload, headers=req_headers, auth=auth, timeout=10)
        if res.status_code == 409:
            session_id = res.headers.get('X-Transmission-Session-Id')
            if not session_id:
                res.raise_for_status()
            continue
        res.raise_for_status()
        return res.json()

    res.raise_for_status()
    return {}


def fetch_payload(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    if not base:
        raise ValueError('Transmission URL erforderlich')

    session = _transmission_rpc(
        base,
        config.get('username'),
        config.get('password'),
        'session-get',
    )
    args = session.get('arguments') or {}

    torrent_count = 0
    try:
        torrents = _transmission_rpc(
            base,
            config.get('username'),
            config.get('password'),
            'torrent-get',
            {'fields': ['id']},
        )
        torrent_count = len((torrents.get('arguments') or {}).get('torrents') or [])
    except Exception:
        torrent_count = 0

    return {
        'downloaded_bytes': args.get('downloaded-bytes', 0),
        'upload_speed': args.get('upload-speed', 0),
        'download_speed': args.get('download-speed', 0),
        'torrent_count': torrent_count,
    }
