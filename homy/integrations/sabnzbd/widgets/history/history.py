"""SABnzbd download history widget."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'sabnzbd_history',
    'name': 'SABnzbd History',
    'integration_types': ['sabnzbd'],
    'default_size_x': 8,
    'default_size_y': 5,
    'icon': 'clock',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'max_items': {
            'type': 'select',
            'label': 'Max. Einträge',
            'options': ['5', '10', '15', '20'],
            'default': '10',
        },
        'show_size': {
            'type': 'select',
            'label': 'Dateigröße anzeigen',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
        'show_category': {
            'type': 'select',
            'label': 'Kategorie anzeigen',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
    },
}

CACHE_NS = 'sabnzbd_history'
CACHE_TTL = 120


def register(app):
    @app.route('/api/sabnzbd_history/data', methods=['GET'], endpoint='widget_sabnzbd_history_data')
    def sabnzbd_history_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, ['sabnzbd'])
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = iwf.fetch_sabnzbd_history(config, wcfg.get('max_items', 10))
            result['show_size'] = wcfg.get('show_size', 'Ja') == 'Ja'
            result['show_category'] = wcfg.get('show_category', 'Ja') == 'Ja'
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('sabnzbd_history failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
