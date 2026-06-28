from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import fetch_integration_for_widget as fetch_for_widget

WIDGET = {
    'type': 'aniworld_stats',
    'name': 'AniWorld · Statistics',
    'integration_types': ['aniworld_downloader'],
    'default_size_x': 6,
    'default_size_y': 4,
    'icon': 'bar-chart-2',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
    },
}

CACHE_NS = 'aniworld_stats'
CACHE_TTL = 60


def register(app):
    @app.route('/api/aniworld_stats/data', methods=['GET'], endpoint='widget_aniworld_stats_data')
    def aniworld_stats_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'configured': False, 'message': 'widget_id required'}), 400

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        payload, err, code = fetch_for_widget(widget_id, 'aniworld_downloader', 'v1_stats')
        if err:
            return jsonify({'configured': False, 'message': err}), code

        result = {
            'configured': True,
            'total_downloads': payload.get('total_downloads', 0),
            'completed': payload.get('completed', 0),
            'failed': payload.get('failed', 0),
            'total_episodes': payload.get('total_episodes', 0),
            'last_24h_completed': payload.get('last_24h_completed', 0),
            'average_speed_mbps': payload.get('average_speed_mbps', 0),
            'anime_downloads': payload.get('anime_downloads', 0),
            'series_downloads': payload.get('series_downloads', 0),
            'movie_downloads': payload.get('movie_downloads', 0),
        }
        widget_cache.set(ck, result, ttl=CACHE_TTL)
        return jsonify(result)
