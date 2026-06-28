"""Generic JSON / REST API integration."""

import json

import requests

INTEGRATION_TYPE = {
    'name': 'JSON / REST API',
    'icon': 'braces',
    'fields': {
        'url': {'type': 'text', 'label': 'API URL', 'default': 'https://'},
        'headers': {'type': 'textarea', 'label': 'Headers (JSON, optional)', 'default': '{}'},
        'method': {
            'type': 'select',
            'label': 'HTTP-Methode',
            'options': ['GET', 'POST'],
            'default': 'GET',
        },
        'body': {
            'type': 'textarea',
            'label': 'Body (JSON, optional — nur bei POST)',
            'default': '{}',
        },
    },
    'metrics': [
        {'path': '_raw', 'label': 'Komplette Antwort (JSON)'},
    ],
}


def fetch_payload(config):
    url = config.get('url', '').strip()
    if not url:
        raise ValueError('Keine URL konfiguriert')

    headers = {}
    try:
        raw_h = config.get('headers', '{}') or '{}'
        headers = json.loads(raw_h) if isinstance(raw_h, str) else raw_h
    except Exception:
        headers = {}

    method = str(config.get('method') or 'GET').upper()
    if method == 'POST':
        raw_body = config.get('body', '{}')
        body_obj = {}
        if isinstance(raw_body, str):
            try:
                body_obj = json.loads(raw_body) if raw_body.strip() else {}
            except Exception:
                body_obj = {}
        elif isinstance(raw_body, dict):
            body_obj = raw_body
        res = requests.post(url, headers=headers, json=body_obj, timeout=8)
    else:
        res = requests.get(url, headers=headers, timeout=8)

    res.raise_for_status()
    return res.json()
