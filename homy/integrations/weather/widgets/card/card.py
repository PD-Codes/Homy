"""OpenWeather forecast card — uses linked integration credentials."""

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
    'type': 'openweather_card',
    'name': 'Weather Forecast Card',
    'integration_types': ['weather'],
    'default_size_x': 8,
    'default_size_y': 6,
    'icon': 'cloud-sun',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'location_label': {'type': 'text', 'label': 'Display name (optional)', 'default': ''},
        'forecast_days': {
            'type': 'select',
            'label': 'Forecast days',
            'options': ['4', '5', '6'],
            'default': '6',
        },
        'show_sunrise': {
            'type': 'select',
            'label': 'Show sunrise',
            'options': ['Ja', 'Nein'],
            'default': 'Nein',
        },
        'show_sunset': {
            'type': 'select',
            'label': 'Show sunset',
            'options': ['Ja', 'Nein'],
            'default': 'Nein',
        },
        'show_min_max': {
            'type': 'select',
            'label': 'Show min/max',
            'options': ['Ja', 'Nein'],
            'default': 'Nein',
        },
        'show_rain_prob': {
            'type': 'select',
            'label': 'Show rain probability',
            'options': ['Ja', 'Nein'],
            'default': 'Nein',
        },
        'use_compact_layout': {
            'type': 'select',
            'label': 'Compact layout',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
        'forecast_colored_icons': {
            'type': 'select',
            'label': 'Colored forecast icons',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
        'use_app_language': {
            'type': 'select',
            'label': 'Use app language',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
    },
}

CACHE_NS = 'openweather_card'
CACHE_TTL = 900


def register(app):
    @app.route('/api/openweather_card/data', methods=['GET'], endpoint='widget_openweather_card_data')
    def openweather_card_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found', 'message': 'Widget not found'}), 404

        _, integration_config, err, code = get_integration_for_widget(widget_id, 'weather')
        if err:
            return jsonify({'error': 'Configuration Error', 'message': err}), code

        use_lang = wcfg.get('use_app_language', 'Ja') != 'Nein'
        lang = request.args.get('lang', 'de' if use_lang else 'en')
        city = integration_config.get('city', 'Berlin').strip().lower()
        units = integration_config.get('units', 'metric')
        ck = cache_key(CACHE_NS, widget_id, city, units, lang)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            ow = get_integration_plugin_module('weather')
            result = ow.fetch_weather_display(
                integration_config,
                widget_config=wcfg or {},
                lang=lang,
            )
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except ValueError as exc:
            return jsonify({'error': 'Configuration Error', 'message': str(exc)}), 400
        except Exception as exc:
            logger.error('OpenWeather card fetch failed: %s', exc, exc_info=True)
            return jsonify({'error': 'Server Error', 'message': 'Weather data unavailable.'}), 500
