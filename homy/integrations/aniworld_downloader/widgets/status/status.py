from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import fetch_integration_for_widget as fetch_for_widget

WIDGET = {
    'type': 'aniworld_status',
    'name': 'AniWorld · Live Status',
    'integration_types': ['aniworld_downloader'],
    'default_size_x': 8,
    'default_size_y': 5,
    'icon': 'activity',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'endpoint': {'type': 'text', 'label': 'Endpoint key', 'default': 'v1_status'},
    },
}

CACHE_NS = 'aniworld_status'
CACHE_TTL = 15


def register(app):
    @app.route('/api/aniworld_status/data', methods=['GET'], endpoint='widget_aniworld_status_data')
    def aniworld_status_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'configured': False, 'message': 'widget_id required'}), 400

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        payload, err, code = fetch_for_widget(widget_id, 'aniworld_downloader', 'v1_status')
        if err:
            return jsonify({'configured': False, 'message': err}), code

        queue = payload.get('queue') or {}
        running = payload.get('currently_running')
        result = {
            'configured': True,
            'online': True,
            'version': payload.get('version', ''),
            'paused': bool(payload.get('paused')),
            'queue': {
                'total': queue.get('total', 0),
                'queued': queue.get('queued', 0),
                'running': queue.get('running', 0),
                'completed': queue.get('completed', 0),
                'failed': queue.get('failed', 0),
            },
            'currently_running': running,
            'progress_percent': 0,
        }
        if running:
            result['progress_percent'] = (
                running.get('overall_progress_percent')
                or (running.get('episode_progress') or {}).get('percent')
                or 0
            )

        widget_cache.set(ck, result, ttl=CACHE_TTL)
        return jsonify(result)
