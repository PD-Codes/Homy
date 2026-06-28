"""Plex integration."""

import xml.etree.ElementTree as ET

import requests

INTEGRATION_TYPE = {
    'name': 'Plex',
    'icon': 'play',
    'fields': {
        'server_url': {'type': 'text', 'label': 'Server URL', 'default': 'http://localhost:32400'},
        'api_token': {'type': 'password', 'label': 'Plex Token', 'default': ''},
    },
    'metrics': [
        {'path': 'active_streams', 'label': 'Active streams'},
        {'path': 'library_count', 'label': 'Libraries'},
    ],
}


def _attr(el, name, default=''):
    if el is None:
        return default
    return el.attrib.get(name, default)


def fetch_payload(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    token = (config.get('api_token') or '').strip()
    if not base or not token:
        raise ValueError('Plex URL and token are required')

    headers = {'Accept': 'application/xml', 'X-Plex-Token': token}
    sessions_res = requests.get(f'{base}/status/sessions', headers=headers, timeout=8)
    sessions_res.raise_for_status()
    root = ET.fromstring(sessions_res.content)
    active_streams = len(root.findall('.//Video')) + len(root.findall('.//Track'))

    sections_res = requests.get(f'{base}/library/sections', headers=headers, timeout=8)
    sections_res.raise_for_status()
    sections = ET.fromstring(sections_res.content)
    libraries = []
    for directory in sections.findall('.//Directory'):
        libraries.append({
            'title': _attr(directory, 'title'),
            'type': _attr(directory, 'type'),
            'count': int(_attr(directory, 'count', '0') or 0),
        })

    return {
        'active_streams': active_streams,
        'library_count': len(libraries),
        'libraries': libraries,
    }
