"""Pi-hole top blocked domains widget."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'pihole_stats',
    'name': 'Pi-hole Top Blocked',
    'integration_types': ['pihole'],
    'default_size_x': 6,
    'default_size_y': 5,
    'icon': 'shield',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'show': {
            'type': 'select',
            'label': 'Zeige',
            'options': ['top_ads', 'top_queries'],
            'default': 'top_ads',
        },
    },
}

CACHE_NS = 'pihole_stats'
CACHE_TTL = 60


def register(app):
    @app.route('/api/pihole_stats/data', methods=['GET'], endpoint='widget_pihole_stats_data')
    def pihole_stats_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, ['pihole'])
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = iwf.fetch_pihole_stats(config)
            result['show'] = wcfg.get('show', 'top_ads')
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('pihole_stats failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
