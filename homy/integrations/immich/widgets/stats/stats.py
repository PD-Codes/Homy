"""Immich library stats widget."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'immich_stats',
    'name': 'Immich Library',
    'integration_types': ['immich'],
    'default_size_x': 6,
    'default_size_y': 4,
    'icon': 'image',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'storage_warning_gb': {
            'type': 'text',
            'label': 'Speicher-Warnung ab (GB)',
            'default': '100',
        },
        'show_version': {
            'type': 'select',
            'label': 'Version anzeigen',
            'options': ['Ja', 'Nein'],
            'default': 'Nein',
        },
    },
}

CACHE_NS = 'immich_stats'
CACHE_TTL = 300


def register(app):
    @app.route('/api/immich_stats/data', methods=['GET'], endpoint='widget_immich_stats_data')
    def immich_stats_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, ['immich'])
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = iwf.fetch_immich_stats(config)
            try:
                result['storage_warning_gb'] = float(wcfg.get('storage_warning_gb') or 100)
            except (TypeError, ValueError):
                result['storage_warning_gb'] = 100.0
            result['show_version'] = wcfg.get('show_version', 'Nein') == 'Ja'
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('immich_stats failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
