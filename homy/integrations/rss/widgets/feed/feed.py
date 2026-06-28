"""Integration widget — auto-generated scaffold."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'rss_feed',
    'name': 'RSS Feed',
    'integration_types': ['rss'],
    'default_size_x': 8,
    'default_size_y': 6,
    'icon': 'rss',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'max_items': {'type': 'select', 'label': 'Max items', 'options': ['5','8','12'], 'default': '8'},
    },
}

CACHE_NS = 'rss_feed'
CACHE_TTL = 300


def register(app):
    @app.route('/api/rss_feed/data', methods=['GET'], endpoint='widget_rss_feed_data')
    def rss_feed_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, ['rss'])
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = iwf.fetch_rss_feed(config, wcfg.get("max_items", 8))
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('rss_feed failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
