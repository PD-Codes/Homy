"""
Example integration — talks to an external REST API and exposes data to widgets.

The two things this file must define:
  INTEGRATION_TYPE  — tells Homy what fields to show in the integrations config UI
  fetch_payload()   — called by generic widgets (flex_data, metric_display, etc.)
                      to pull a snapshot of the service's state
"""

import requests

# INTEGRATION_TYPE describes this integration to the Homy UI.
# Users fill these fields in under Settings → Integrations, and the stored
# values are passed to fetch_payload() and your custom widget routes.
INTEGRATION_TYPE = {
    'name': 'Example REST API',

    # Lucide icon name for the integrations list. Browse at lucide.dev.
    'icon': 'plug',

    # Fields the user fills in when adding this integration.
    # Supported types: 'text', 'password', 'select', 'textarea'
    'fields': {
        'server_url': {
            'type': 'text',
            'label': 'Server URL',
            'default': 'https://api.example.com',
        },
        'api_key': {
            'type': 'password',    # stored encrypted, never sent back to browser
            'label': 'API Key',
            'default': '',
        },
    },

    # Which fields from fetch_payload()'s return dict appear in the generic
    # "add widget from integration" builder. Use dot-notation for nested keys.
    'metrics': [
        {'path': 'status', 'label': 'Status'},
        {'path': 'items_count', 'label': 'Item count'},
    ],
}


def fetch_payload(config):
    """Fetch a snapshot from the external API.

    Called by generic widgets (flex_data, metric_display, integration_table, ...).
    config is a plain dict with the user's stored field values — passwords are
    already decrypted here, you don't need to do anything special.

    Return a JSON-serializable dict. Raise on fatal errors; return a dict with
    'online': False for soft failures so the widget can show a helpful message.
    """
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()

    if not base:
        raise ValueError('Server URL is required')

    headers = {}
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'

    try:
        res = requests.get(f'{base}/health', headers=headers, timeout=8)
        res.raise_for_status()
        data = res.json() if res.content else {}
        return {
            'status': data.get('status', 'ok'),
            'items_count': data.get('items_count', 0),
            'online': True,
        }
    except requests.RequestException as exc:
        # Return a soft failure so widgets can display "offline" instead of an error.
        return {
            'status': 'error',
            'items_count': 0,
            'online': False,
            'message': str(exc),
        }
