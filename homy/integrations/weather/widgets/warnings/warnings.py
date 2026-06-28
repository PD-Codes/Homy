"""Weather warnings feed — uses linked weather integration (NINA/DWD)."""

import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import (
    get_integration_for_widget,
    get_integration_plugin_module,
    get_widget_config,
)

logger = logging.getLogger(__name__)

SEVERITY_ORDER = {'Minor': 1, 'Moderate': 2, 'Severe': 3, 'Extreme': 4}

WIDGET = {
    'type': 'weather_warnings',
    'name': 'Weather Warnings (DWD/NINA)',
    'integration_types': ['weather'],
    'default_size_x': 8,
    'default_size_y': 5,
    'icon': 'alert-triangle',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'region_name': {
            'type': 'text',
            'label': 'Region name filter (optional)',
            'default': '',
        },
        'max_warnings': {
            'type': 'select',
            'label': 'Max warnings',
            'options': ['3', '5', '10'],
            'default': '5',
        },
        'min_level': {
            'type': 'select',
            'label': 'Minimum severity',
            'options': ['Alle', 'Minor', 'Moderate', 'Severe', 'Extreme'],
            'default': 'Alle',
        },
    },
}

CACHE_NS = 'weather_warnings'
CACHE_TTL = 300


def register(app):
    @app.route('/api/weather_warnings/data', methods=['GET'], endpoint='widget_weather_warnings_feed')
    def weather_warnings_feed():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404
        _, icfg, err, code = get_integration_for_widget(widget_id, 'weather')
        if err:
            return jsonify({'configured': False, 'message': err}), code

        region_filter = (wcfg.get('region_name') or '').strip().lower()
        max_w = int(wcfg.get('max_warnings', 5) or 5)
        min_level = wcfg.get('min_level', 'Alle')

        source_key = icfg.get('warnings_source') or icfg.get('source', 'NINA')
        region_key = icfg.get('warnings_region_code') or icfg.get('region_code', '')
        ck = cache_key(CACHE_NS, widget_id, source_key, region_key)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            weather_mod = get_integration_plugin_module('weather')
            warnings, source = weather_mod.fetch_warnings(icfg)

            if region_filter:
                warnings = [w for w in warnings if region_filter in (w.get('area') or '').lower()]

            if min_level != 'Alle':
                min_ord = SEVERITY_ORDER.get(min_level, 0)
                warnings = [
                    w for w in warnings
                    if SEVERITY_ORDER.get(w.get('severity'), 0) >= min_ord
                ]

            result = {
                'configured': True,
                'online': True,
                'source': source,
                'region_code': region_key,
                'warnings': warnings[:max_w],
                'count': len(warnings),
            }
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('Weather warnings fetch failed: %s', exc)
            return jsonify({
                'configured': True,
                'online': False,
                'message': f'Warnings unavailable: {exc}',
                'warnings': [],
            })
