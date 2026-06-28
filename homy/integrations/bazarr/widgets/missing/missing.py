"""Integration widget — auto-generated scaffold."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'bazarr_missing',
    'name': 'Bazarr Subtitles',
    'integration_types': ['bazarr'],
    'default_size_x': 6,
    'default_size_y': 4,
    'icon': 'subtitles',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
    },
}

CACHE_NS = 'bazarr_missing'
CACHE_TTL = 120


def register(app):
    @app.route('/api/bazarr_missing/data', methods=['GET'], endpoint='widget_bazarr_missing_data')
    def bazarr_missing_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, ['bazarr'])
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = iwf.fetch_bazarr_missing(config)
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('bazarr_missing failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
