"""Home Assistant entities widget."""

import logging

import requests
from flask import jsonify, request

from homy.cache import cache_key, invalidate_widget, should_bypass_cache, widget_cache
from homy.database import WidgetInstance
from homy.integration_widget_util import get_integration_for_widget, get_widget_config

logger = logging.getLogger(__name__)

DEFAULT_ENTITIES = [
    'light.living_room',
    'light.kitchen',
    'switch.smart_plug_server',
    'switch.tv',
    'sensor.kitchen_temperature',
    'sensor.living_room_temperature',
    'sensor.balcony_humidity',
]

WIDGET = {
    'type': 'homeassistant',
    'name': 'Home Assistant Entities',
    'integration_types': ['homeassistant'],
    'default_size_x': 6,
    'default_size_y': 4,
    'icon': 'home',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'entity_ids': {
            'type': 'textarea',
            'label': 'Entity IDs (comma-separated, empty = defaults)',
            'default': '',
        },
    },
}

CACHE_NS = 'homeassistant'
CACHE_TTL = 15


def _parse_entity_ids(wcfg):
    raw = (wcfg.get('entity_ids') or '').strip()
    if not raw:
        return DEFAULT_ENTITIES
    return [e.strip() for e in raw.split(',') if e.strip()]


def _mock_entities():
    return [
        {'entity_id': 'light.living_room', 'name': 'Living room', 'state': 'on', 'type': 'switch'},
        {'entity_id': 'switch.smart_plug_server', 'name': 'Server plug', 'state': 'off', 'type': 'switch'},
        {'entity_id': 'sensor.kitchen_temperature', 'name': 'Kitchen temp', 'state': '22.8', 'unit': '°C', 'type': 'sensor'},
    ]


def register(app):
    @app.route('/api/homeassistant/status', methods=['GET'], endpoint='widget_homeassistant_entities')
    def homeassistant_entities_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404
        _, icfg, err, code = get_integration_for_widget(widget_id, 'homeassistant')
        if err:
            return jsonify({'configured': False, 'online': True, 'entities': _mock_entities()}), code

        server_url = icfg.get('server_url', '').strip().rstrip('/')
        api_key = icfg.get('api_key', '').strip()
        if not server_url or not api_key:
            return jsonify({'configured': False, 'online': True, 'entities': _mock_entities()})

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        expose = _parse_entity_ids(wcfg)
        headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        }
        try:
            res = requests.get(f'{server_url}/api/states', headers=headers, timeout=4)
            res.raise_for_status()
            states_raw = res.json()
            entities = []
            for item in states_raw:
                entity_id = item.get('entity_id')
                if entity_id not in expose:
                    continue
                attributes = item.get('attributes', {})
                ent_type = 'sensor'
                if entity_id.startswith(('light', 'switch')):
                    ent_type = 'switch'
                entities.append({
                    'entity_id': entity_id,
                    'name': attributes.get('friendly_name', entity_id),
                    'state': item.get('state', 'unknown'),
                    'unit': attributes.get('unit_of_measurement', ''),
                    'type': ent_type,
                })
            if not entities:
                entities = _mock_entities()
            result = {'configured': True, 'online': True, 'entities': entities}
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('Home Assistant fetch failed: %s', exc)
            return jsonify({
                'configured': True,
                'online': False,
                'entities': _mock_entities(),
                'message': 'Home Assistant offline (demo)',
            })

    @app.route('/api/homeassistant/toggle', methods=['POST'], endpoint='widget_homeassistant_toggle')
    def homeassistant_toggle():
        data = request.get_json() or {}
        widget_id = data.get('widget_id')
        entity_id = data.get('entity_id')
        action = data.get('action')

        if not widget_id or not entity_id or not action:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id, entity_id, action required'}), 400

        _, icfg, err, code = get_integration_for_widget(widget_id, 'homeassistant')
        if err:
            return jsonify({'success': True})

        invalidate_widget(CACHE_NS, widget_id)
        server_url = icfg.get('server_url', '').strip().rstrip('/')
        api_key = icfg.get('api_key', '').strip()
        if not server_url or not api_key:
            return jsonify({'success': True})

        try:
            headers = {
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
            }
            domain = entity_id.split('.')[0]
            service = 'turn_on' if action == 'turn_on' else 'turn_off'
            res = requests.post(
                f'{server_url}/api/services/{domain}/{service}',
                headers=headers,
                json={'entity_id': entity_id},
                timeout=4,
            )
            res.raise_for_status()
            return jsonify({'success': True})
        except Exception as exc:
            logger.error('HA toggle failed: %s', exc)
            return jsonify({'error': 'Internal Server Error', 'message': str(exc)}), 500
