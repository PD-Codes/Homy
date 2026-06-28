"""Zabbix host status widget — CPU, RAM, disk, temperatures."""

import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import (
    get_integration_for_widget,
    get_integration_plugin_module,
    get_widget_config,
)

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'zabbix_host_status',
    'name': 'Zabbix Host Status',
    'integration_types': ['zabbix'],
    'default_size_x': 5,
    'default_size_y': 5,
    'icon': 'server',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'host_id': {'type': 'text', 'label': 'Host', 'default': ''},
        'disk_mount': {'type': 'text', 'label': 'Disk mount point', 'default': '/'},
    },
}

CACHE_NS = 'zabbix_host_status'
CACHE_TTL = 45


def register(app):
    @app.route('/api/zabbix/hosts', methods=['GET'], endpoint='widget_zabbix_hosts_list')
    def zabbix_hosts_list():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        _, config, err, code = get_integration_for_widget(widget_id, 'zabbix')
        if err:
            return jsonify({'ok': False, 'message': err, 'hosts': []}), code

        try:
            zabbix_mod = get_integration_plugin_module('zabbix')
            hosts = zabbix_mod.fetch_hosts(config, search=request.args.get('q'))
            return jsonify({'ok': True, 'hosts': hosts})
        except Exception as exc:
            logger.warning('Zabbix host list failed: %s', exc)
            return jsonify({'ok': False, 'message': str(exc), 'hosts': []}), 502

    @app.route('/api/zabbix_host_status/data', methods=['GET'], endpoint='widget_zabbix_host_status_data')
    def zabbix_host_status_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        host_id = (wcfg.get('host_id') or '').strip()
        disk_mount = (wcfg.get('disk_mount') or '/').strip() or '/'

        ck = cache_key(CACHE_NS, widget_id, host_id, disk_mount)
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

        if not host_id:
            return jsonify({
                'configured': True,
                'online': False,
                'message_key': 'zabbix_host_pick_required',
                'status': None,
            }), 200

        try:
            zabbix_mod = get_integration_plugin_module('zabbix')
            status = zabbix_mod.fetch_host_status(config, host_id, disk_mount=disk_mount)
            result = {
                'configured': True,
                'online': True,
                'status': status,
            }
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('Zabbix host status failed: %s', exc)
            return jsonify({
                'configured': True,
                'online': False,
                'message': str(exc),
                'status': None,
            }), 200
