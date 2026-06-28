"""Windy map embed widget."""

import logging

from flask import jsonify, request

from homy.integration_widget_util import (
    get_integration_for_widget,
    get_widget_config,
)

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'windy_map',
    'name': 'Windy Map',
    'integration_types': ['weather'],
    'default_size_x': 8,
    'default_size_y': 7,
    'icon': 'wind',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'lat': {'type': 'text', 'label': 'Latitude', 'default': '48.1351'},
        'lon': {'type': 'text', 'label': 'Longitude', 'default': '11.5820'},
        'zoom': {
            'type': 'select',
            'label': 'Zoom',
            'options': ['5', '6', '7', '8', '9', '10', '11'],
            'default': '7',
        },
        'overlay': {
            'type': 'select',
            'label': 'Layer',
            'options': ['wind', 'rain', 'radar', 'satellite', 'temp', 'clouds', 'pressure', 'snowcover', 'thunder'],
            'default': 'wind',
        },
        'level': {
            'type': 'select',
            'label': 'Level',
            'options': ['surface', '850h', '700h', '500h', '300h'],
            'default': 'surface',
        },
        'metric_wind': {
            'type': 'select',
            'label': 'Wind unit',
            'options': ['km/h', 'm/s', 'kn', 'mph'],
            'default': 'km/h',
        },
        'metric_temp': {
            'type': 'select',
            'label': 'Temperature unit',
            'options': ['°C', '°F'],
            'default': '°C',
        },
    },
}


def register(app):
    @app.route('/api/windy_map/config', methods=['GET'], endpoint='widget_windy_map_config')
    def windy_map_config():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        _, _, err, code = get_integration_for_widget(widget_id, 'weather')
        if err:
            return jsonify({'configured': False, 'message': err}), code

        return jsonify({
            'configured': True,
            'lat': wcfg.get('lat', '48.1351'),
            'lon': wcfg.get('lon', '11.5820'),
            'zoom': wcfg.get('zoom', '7'),
            'overlay': wcfg.get('overlay', 'wind'),
            'level': wcfg.get('level', 'surface'),
            'metric_wind': wcfg.get('metric_wind', 'km/h'),
            'metric_temp': wcfg.get('metric_temp', '°C'),
        })
