"""Pi-hole integrated widget — credentials from linked integration."""

import logging

import requests
from flask import jsonify, request

from homy.cache import cache_key, invalidate_widget, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'pihole_status',
    'name': 'Pi-hole DNS Status',
    'integration_types': ['pihole'],
    'default_size_x': 6,
    'default_size_y': 4,
    'icon': 'shield',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
    },
}

CACHE_NS = 'pihole_status'
CACHE_TTL = 30


def _mock_status(configured=True, online=True):
    return {
        'configured': configured,
        'online': online,
        'dns_queries_today': 18542 if online else 12480,
        'ads_blocked_today': 4289 if online else 2918,
        'ads_percentage_today': 23.1 if online else 23.4,
        'status': 'enabled',
        'message': 'Demo mode' if not configured else 'Connection failed (demo)',
    }


def register(app):
    @app.route('/api/pihole_status/data', methods=['GET'], endpoint='widget_pihole_status_data')
    def pihole_status_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        _, config, err, code = get_integration_for_widget(widget_id, 'pihole')
        if err:
            return jsonify(_mock_status(configured=False)), code if code < 500 else 200

        server_url = config.get('server_url', '').strip().rstrip('/')
        api_token = config.get('api_token', '').strip()
        if not server_url or not api_token:
            return jsonify(_mock_status(configured=False))

        try:
            res = requests.get(
                f'{server_url}/api.php?summaryRaw&auth={api_token}',
                timeout=4,
            )
            res.raise_for_status()
            data = res.json()
            result = {
                'configured': True,
                'online': True,
                'dns_queries_today': data.get('dns_queries_today', 0),
                'ads_blocked_today': data.get('ads_blocked_today', 0),
                'ads_percentage_today': round(data.get('ads_percentage_today', 0.0), 1),
                'status': data.get('status', 'unknown'),
            }
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('Pi-hole connection failed: %s', exc)
            fallback = _mock_status(configured=True, online=False)
            return jsonify(fallback)

    @app.route('/api/pihole_status/toggle', methods=['POST'], endpoint='widget_pihole_status_toggle')
    def pihole_status_toggle():
        data = request.get_json() or {}
        widget_id = data.get('widget_id')
        action = data.get('action')
        duration = data.get('duration', 300)

        if not widget_id or not action:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id and action required'}), 400

        _, config, err, code = get_integration_for_widget(widget_id, 'pihole')
        if err:
            return jsonify({'success': True, 'status': 'disabled' if action == 'disable' else 'enabled'})

        invalidate_widget(CACHE_NS, widget_id)
        server_url = config.get('server_url', '').strip().rstrip('/')
        api_token = config.get('api_token', '').strip()
        if not server_url or not api_token:
            return jsonify({'success': True, 'status': 'disabled' if action == 'disable' else 'enabled'})

        try:
            if action == 'disable':
                url = f'{server_url}/api.php?disable={duration}&auth={api_token}'
            else:
                url = f'{server_url}/api.php?enable&auth={api_token}'
            res = requests.get(url, timeout=4)
            res.raise_for_status()
            return jsonify({'success': True, 'status': 'disabled' if action == 'disable' else 'enabled'})
        except Exception as exc:
            logger.error('Failed to toggle Pi-hole: %s', exc)
            return jsonify({'error': 'Service Unavailable', 'message': str(exc)}), 503
