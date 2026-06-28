"""Zabbix overview widget — hosts, problems, version."""

import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_integration_plugin_module

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'zabbix_status',
    'name': 'Zabbix Overview',
    'integration_types': ['zabbix'],
    'default_size_x': 6,
    'default_size_y': 4,
    'icon': 'activity',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
    },
}

CACHE_NS = 'zabbix_status'
CACHE_TTL = 60


def register(app):
    @app.route('/api/zabbix_status/data', methods=['GET'], endpoint='widget_zabbix_status_data')
    def zabbix_status_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        _, config, err, code = get_integration_for_widget(widget_id, 'zabbix')
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        if not config.get('server_url', '').strip() or not config.get('api_token', '').strip():
            return jsonify({
                'configured': False,
                'online': False,
                'message': 'Zabbix URL and API token required',
            })

        try:
            zabbix_mod = get_integration_plugin_module('zabbix')
            summary = zabbix_mod.fetch_summary(config)
            result = {
                'configured': True,
                'online': True,
                'version': summary.get('version', ''),
                'host_count': summary.get('host_count', 0),
                'problems_count': summary.get('problems_count', 0),
                'problems_high': summary.get('problems_high', 0),
                'problems_disaster': summary.get('problems_disaster', 0),
                'problems_warning': summary.get('problems_warning', 0),
                'problems_average': summary.get('problems_average', 0),
                'by_severity': summary.get('by_severity', {}),
            }
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('Zabbix status failed: %s', exc)
            return jsonify({
                'configured': True,
                'online': False,
                'message': str(exc),
            }), 200
