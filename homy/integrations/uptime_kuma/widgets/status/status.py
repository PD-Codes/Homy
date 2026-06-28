"""Uptime Kuma status widget."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'uptime_kuma_status',
    'name': 'Uptime Kuma Status',
    'integration_types': ['uptime_kuma'],
    'default_size_x': 8,
    'default_size_y': 5,
    'icon': 'activity',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'view_mode': {
            'type': 'select',
            'label': 'Ansicht',
            'options': ['Liste', 'Kompakt'],
            'default': 'Liste',
        },
        'max_items': {
            'type': 'select',
            'label': 'Max. Monitore',
            'options': ['5', '10', '15', '20'],
            'default': '10',
        },
        'show_only_down': {
            'type': 'select',
            'label': 'Nur DOWN-Monitore',
            'options': ['Nein', 'Ja'],
            'default': 'Nein',
        },
        'show_status_badge': {
            'type': 'select',
            'label': 'Status-Badge anzeigen',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
    },
}

CACHE_NS = 'uptime_kuma_status'
CACHE_TTL = 45


def register(app):
    @app.route('/api/uptime_kuma_status/data', methods=['GET'], endpoint='widget_uptime_kuma_status_data')
    def uptime_kuma_status_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, ['uptime_kuma'])
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = iwf.fetch_uptime_kuma_monitors(config)
            monitors = result.get('monitors', [])
            if wcfg.get('show_only_down') == 'Ja':
                monitors = [m for m in monitors if m.get('status') == 'down']
            try:
                max_items = max(1, min(int(wcfg.get('max_items', 10) or 10), 30))
            except (TypeError, ValueError):
                max_items = 10
            result['monitors'] = monitors[:max_items]
            result['view_mode'] = wcfg.get('view_mode', 'Liste')
            result['show_status_badge'] = wcfg.get('show_status_badge', 'Ja') == 'Ja'
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('uptime_kuma_status failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
