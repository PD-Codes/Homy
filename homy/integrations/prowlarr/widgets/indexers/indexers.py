"""Integration widget — auto-generated scaffold."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'prowlarr_indexers',
    'name': 'Prowlarr Indexers',
    'integration_types': ['prowlarr'],
    'default_size_x': 6,
    'default_size_y': 5,
    'icon': 'radar',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
    },
}

CACHE_NS = 'prowlarr_indexers'
CACHE_TTL = 60


def register(app):
    @app.route('/api/prowlarr_indexers/data', methods=['GET'], endpoint='widget_prowlarr_indexers_data')
    def prowlarr_indexers_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, ['prowlarr'])
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = iwf.fetch_prowlarr_indexers(config)
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('prowlarr_indexers failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
