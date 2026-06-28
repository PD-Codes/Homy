"""Integration widget — auto-generated scaffold."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'torrent_status',
    'name': 'Torrent Status',
    'integration_types': ['qbittorrent', 'transmission'],
    'default_size_x': 8,
    'default_size_y': 5,
    'icon': 'download-cloud',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'state_filter': {
            'type': 'select',
            'label': 'Zeige Torrents',
            'options': ['Alle', 'Aktiv', 'Wird heruntergeladen', 'Wird hochgeladen'],
            'default': 'Aktiv',
        },
        'max_items': {
            'type': 'select',
            'label': 'Max. Torrents',
            'options': ['5', '8', '10', '15'],
            'default': '8',
        },
    },
}

CACHE_NS = 'torrent_status'
CACHE_TTL = 20


def register(app):
    @app.route('/api/torrent_status/data', methods=['GET'], endpoint='widget_torrent_status_data')
    def torrent_status_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, ['qbittorrent', 'transmission'])
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = iwf.fetch_torrent_status(integration.type, config)
            state_filter = wcfg.get('state_filter', 'Aktiv')
            max_items = int(wcfg.get('max_items', 8) or 8)
            torrents = result.get('torrents', [])
            if state_filter == 'Wird heruntergeladen':
                torrents = [t for t in torrents if t.get('dlspeed', 0) > 0]
            elif state_filter == 'Wird hochgeladen':
                torrents = [t for t in torrents if t.get('upspeed', 0) > 0 and t.get('dlspeed', 0) == 0]
            result['torrents'] = torrents[:max_items]
            result['active_count'] = len(result['torrents'])
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('torrent_status failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
