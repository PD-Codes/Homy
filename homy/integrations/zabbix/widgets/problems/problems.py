"""Zabbix active problems list widget."""

import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import (
    get_integration_for_widget,
    get_integration_plugin_module,
    get_widget_config,
)

logger = logging.getLogger(__name__)

SEVERITY_OPTIONS = {
    'Alle': 0,
    'Information': 1,
    'Warning': 2,
    'Average': 3,
    'High': 4,
    'Disaster': 5,
}

WIDGET = {
    'type': 'zabbix_problems',
    'name': 'Zabbix Problems',
    'integration_types': ['zabbix'],
    'default_size_x': 8,
    'default_size_y': 5,
    'icon': 'alert-triangle',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'max_items': {
            'type': 'select',
            'label': 'Max problems',
            'options': ['5', '10', '15', '20'],
            'default': '10',
        },
        'min_severity': {
            'type': 'select',
            'label': 'Minimum severity',
            'options': list(SEVERITY_OPTIONS.keys()),
            'default': 'Alle',
        },
    },
}

CACHE_NS = 'zabbix_problems'
CACHE_TTL = 45


def register(app):
    @app.route('/api/zabbix_problems/data', methods=['GET'], endpoint='widget_zabbix_problems_data')
    def zabbix_problems_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404
        max_items = int(wcfg.get('max_items', 10) or 10)
        min_sev = SEVERITY_OPTIONS.get(wcfg.get('min_severity', 'Alle'), 0)

        ck = cache_key(CACHE_NS, widget_id, max_items, min_sev)
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
            problems = zabbix_mod.fetch_problems(config, limit=max_items, min_severity=min_sev)
            result = {
                'configured': True,
                'online': True,
                'problems': problems,
                'count': len(problems),
            }
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('Zabbix problems failed: %s', exc)
            return jsonify({
                'configured': True,
                'online': False,
                'message': str(exc),
                'problems': [],
            }), 200
