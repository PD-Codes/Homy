"""
Custom widget for example_integration — shows current API status.

Each widget in a integration's widgets/ folder needs:
  WIDGET      — metadata (type, name, config fields, default size)
  register()  — adds a Flask route that the JS renderer calls
"""

import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget

logger = logging.getLogger(__name__)

# WIDGET describes this widget to the Homy UI — type, display name, icon, etc.
WIDGET = {
    # The type string must be globally unique. Prefix with your integration name
    # to avoid collisions with other modules: 'myapi_status', not just 'status'.
    'type': 'example_status',
    'name': 'Example: API Status',

    # Which integration types can power this widget. Must match the 'id' in info.cfg.
    'integration_types': ['example_integration'],

    'default_size_x': 4,
    'default_size_y': 3,
    'icon': 'activity',

    # config_schema fields are shown in the widget settings panel.
    # 'integration_id' is required for any widget that links to an integration.
    'config_schema': {
        'integration_id': {
            'type': 'text',
            'label': 'Integration ID',
            'default': '',
        },
        # Add more fields here if your widget needs per-widget config beyond
        # the shared integration credentials. For example:
        # 'show_details': {
        #     'type': 'select',
        #     'label': 'Show details',
        #     'options': ['Yes', 'No'],
        #     'default': 'Yes',
        # },
    },
}

# Cache namespace — keeps this widget's entries separate from other widgets'.
CACHE_NS = 'example_status'
CACHE_TTL = 30  # seconds


def register(app):
    @app.route('/api/example_status/data', methods=['GET'], endpoint='widget_example_status_data')
    def example_status_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        # Resolve the integration linked to this widget and get its config.
        # The second argument is a list of accepted integration types — the call
        # returns an error if the linked integration isn't one of them.
        _integration, config, err, code = get_integration_for_widget(
            widget_id, ['example_integration']
        )
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        # Check the cache before hitting the external API.
        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            import importlib
            mod = importlib.import_module('homy.integrations.example_integration')
            payload = mod.fetch_payload(config)

            result = {
                'configured': True,
                'online': bool(payload.get('online', True)),
                'status': payload.get('status', 'unknown'),
                'items_count': payload.get('items_count', 0),
                'message': payload.get('message', ''),
            }
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)

        except Exception as exc:
            logger.warning('example_status fetch failed: %s', exc)
            # Return 200 with online=False so the widget shows a friendly message
            # rather than an error state that blocks the whole widget area.
            return jsonify({
                'configured': True,
                'online': False,
                'message': str(exc),
            }), 200
