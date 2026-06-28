"""Jellyfin / Emby recently added items widget."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'jellyfin_recent',
    'name': 'Zuletzt hinzugefügt',
    'integration_types': ['jellyfin', 'emby'],
    'default_size_x': 8,
    'default_size_y': 5,
    'icon': 'sparkles',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'max_items': {'type': 'select', 'label': 'Max. Einträge', 'options': ['5', '8', '10', '15'], 'default': '8'},
        'media_types': {
            'type': 'select',
            'label': 'Medientypen',
            'options': ['Movie,Episode', 'Movie', 'Episode'],
            'default': 'Movie,Episode',
        },
    },
}

CACHE_NS = 'jellyfin_recent'
CACHE_TTL = 120


def register(app):
    @app.route('/api/jellyfin_recent/data', methods=['GET'], endpoint='widget_jellyfin_recent_data')
    def jellyfin_recent_data():
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
            result = iwf.fetch_jellyfin_recent(
                config,
                limit=wcfg.get('max_items', 8),
                media_types=wcfg.get('media_types', 'Movie,Episode'),
            )
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('jellyfin_recent failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
