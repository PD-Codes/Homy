"""*arr calendar widget — upcoming episodes / movies."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'arr_calendar',
    'name': '*arr Kalender',
    'integration_types': ['sonarr', 'radarr'],
    'default_size_x': 8,
    'default_size_y': 5,
    'icon': 'calendar-days',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'days_ahead': {
            'type': 'select',
            'label': 'Tage voraus',
            'options': ['3', '7', '14', '30'],
            'default': '7',
        },
    },
}

CACHE_NS = 'arr_calendar'
CACHE_TTL = 300


def register(app):
    @app.route('/api/arr_calendar/data', methods=['GET'], endpoint='widget_arr_calendar_data')
    def arr_calendar_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, ['sonarr', 'radarr'])
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = iwf.fetch_arr_calendar(
                integration.type,
                config,
                days_ahead=wcfg.get('days_ahead', 7),
            )
            result['configured'] = True
            result['online'] = True
            result['integration_type'] = integration.type
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('arr_calendar failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
