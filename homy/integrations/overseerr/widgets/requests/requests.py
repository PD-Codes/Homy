"""Integration widget — auto-generated scaffold."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'overseerr_requests',
    'name': 'Overseerr Requests',
    'integration_types': ['overseerr'],
    'default_size_x': 8,
    'default_size_y': 5,
    'icon': 'clapperboard',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'max_items': {'type': 'select', 'label': 'Max. Anfragen in Liste', 'options': ['5', '8', '12', '15'], 'default': '8'},
        'hidden_request_statuses': {
            'type': 'text',
            'label': 'Ausgeblendete Status (intern)',
            'default': '',
        },
    },
}

CACHE_NS = 'overseerr_requests'
CACHE_TTL = 60


def register(app):
    @app.route('/api/overseerr_requests/data', methods=['GET'], endpoint='widget_overseerr_requests_data')
    def overseerr_requests_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, ['overseerr'])
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        hidden = wcfg.get('hidden_request_statuses', '')
        ck = cache_key(CACHE_NS, widget_id, wcfg.get('max_items', 8), hidden)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = iwf.fetch_overseerr_requests(config, wcfg.get('max_items', 8), wcfg)
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('overseerr_requests failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
