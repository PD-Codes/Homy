"""JSON value card widget — displays a single extracted value from any JSON API."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'json_value',
    'name': 'JSON Value',
    'integration_types': ['json'],
    'default_size_x': 4,
    'default_size_y': 3,
    'icon': 'braces',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'json_path': {
            'type': 'text',
            'label': 'JSON Path (e.g. data.temperature)',
            'default': '',
        },
        'label': {'type': 'text', 'label': 'Label', 'default': 'Value'},
        'unit': {'type': 'text', 'label': 'Unit (optional)', 'default': ''},
        'refresh': {
            'type': 'select',
            'label': 'Refresh (seconds)',
            'options': ['30', '60', '120', '300'],
            'default': '60',
        },
    },
}

CACHE_NS = 'json_value'


def register(app):
    @app.route('/api/json_value/data', methods=['GET'], endpoint='widget_json_value_data')
    def json_value_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, ['json'])
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        try:
            ttl = max(10, min(int(wcfg.get('refresh', 60) or 60), 600))
        except (TypeError, ValueError):
            ttl = 60

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            from homy.integration_manager import get_integration_manager
            manager = get_integration_manager()
            result = iwf.fetch_json_value(
                manager,
                integration,
                config,
                json_path=wcfg.get('json_path', ''),
            )
            result['label'] = wcfg.get('label', 'Value')
            result['unit'] = wcfg.get('unit', '')
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=ttl)
            return jsonify(result)
        except Exception as exc:
            logger.warning('json_value failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
