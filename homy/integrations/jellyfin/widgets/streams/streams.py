"""Media streams widget — Jellyfin / Emby active sessions."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'media_streams',
    'name': 'Media Streams',
    'integration_types': ['jellyfin', 'emby'],
    'default_size_x': 8,
    'default_size_y': 5,
    'icon': 'play-circle',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'show_progress': {
            'type': 'select',
            'label': 'Fortschritt anzeigen',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
        'show_type_icon': {
            'type': 'select',
            'label': 'Medientyp-Icon anzeigen',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
        'show_library_counts': {
            'type': 'select',
            'label': 'Bibliotheks-Zähler anzeigen',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
        'max_items': {
            'type': 'select',
            'label': 'Max. Streams',
            'options': ['3', '5', '8', '10'],
            'default': '5',
        },
    },
}

CACHE_NS = 'media_streams'
CACHE_TTL = 20


def register(app):
    @app.route('/api/media_streams/data', methods=['GET'], endpoint='widget_media_streams_data')
    def media_streams_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, ['jellyfin', 'emby'])
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = iwf.fetch_media_sessions(integration.type, config)
            try:
                max_items = max(1, min(int(wcfg.get('max_items', 5) or 5), 10))
            except (TypeError, ValueError):
                max_items = 5
            result['sessions'] = result.get('sessions', [])[:max_items]
            result['show_progress'] = wcfg.get('show_progress', 'Ja') == 'Ja'
            result['show_type_icon'] = wcfg.get('show_type_icon', 'Ja') == 'Ja'
            result['show_library_counts'] = wcfg.get('show_library_counts', 'Ja') == 'Ja'
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('media_streams failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
