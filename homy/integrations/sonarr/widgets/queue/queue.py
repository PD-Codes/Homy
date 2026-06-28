"""*arr queue widget — Sonarr / Radarr / Lidarr / Readarr."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'arr_queue',
    'name': '*arr Queue',
    'integration_types': ['sonarr', 'radarr', 'lidarr', 'readarr'],
    'default_size_x': 8,
    'default_size_y': 5,
    'icon': 'list-ordered',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'max_items': {
            'type': 'select',
            'label': 'Max. Einträge',
            'options': ['5', '10', '15', '20'],
            'default': '10',
        },
        'show_progress': {
            'type': 'select',
            'label': 'Fortschritt-Balken',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
        'show_eta': {
            'type': 'select',
            'label': 'ETA anzeigen',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
        'show_protocol': {
            'type': 'select',
            'label': 'Protokoll-Badge (torrent/usenet)',
            'options': ['Ja', 'Nein'],
            'default': 'Nein',
        },
    },
}

CACHE_NS = 'arr_queue'
CACHE_TTL = 45


def register(app):
    @app.route('/api/arr_queue/data', methods=['GET'], endpoint='widget_arr_queue_data')
    def arr_queue_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, ['sonarr', 'radarr', 'lidarr', 'readarr'])
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = iwf.fetch_arr_queue_list(integration, config, wcfg.get('max_items', 10))
            result['show_progress'] = wcfg.get('show_progress', 'Ja') == 'Ja'
            result['show_eta'] = wcfg.get('show_eta', 'Ja') == 'Ja'
            result['show_protocol'] = wcfg.get('show_protocol', 'Nein') == 'Ja'
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('arr_queue failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
