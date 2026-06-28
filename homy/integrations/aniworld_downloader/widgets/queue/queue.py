from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.database import WidgetInstance
from homy.integration_widget_util import (
    fetch_integration_for_widget as fetch_for_widget,
    get_widget_config,
)

WIDGET = {
    'type': 'aniworld_queue',
    'name': 'AniWorld · Queue',
    'integration_types': ['aniworld_downloader'],
    'default_size_x': 6,
    'default_size_y': 6,
    'icon': 'list-ordered',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'status_filter': {
            'type': 'select',
            'label': 'Status filter',
            'options': ['', 'queued', 'running', 'completed', 'failed'],
            'default': '',
        },
        'max_items': {'type': 'select', 'label': 'Max items', 'options': ['5', '10', '15'], 'default': '10'},
    },
}

CACHE_NS = 'aniworld_queue'
CACHE_TTL = 15


def register(app):
    @app.route('/api/aniworld_queue/data', methods=['GET'], endpoint='widget_aniworld_queue_data')
    def aniworld_queue_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'configured': False, 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'configured': False, 'message': 'Widget not found'}), 404
        status_filter = wcfg.get('status_filter', '')
        max_items = int(wcfg.get('max_items', 10) or 10)

        ck = cache_key(CACHE_NS, f'{widget_id}_{status_filter}')
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        extra = {}
        if status_filter:
            extra['status_filter'] = status_filter

        payload, err, code = fetch_for_widget(
            widget_id, 'aniworld_downloader', 'v1_queue', extra_overrides=extra
        )
        if err:
            return jsonify({'configured': False, 'message': err}), code

        items = payload.get('items') if isinstance(payload.get('items'), list) else []
        if not items and isinstance(payload, list):
            items = payload

        result = {
            'configured': True,
            'count': payload.get('count', len(items)),
            'items': items[:max_items],
        }
        widget_cache.set(ck, result, ttl=CACHE_TTL)
        return jsonify(result)
