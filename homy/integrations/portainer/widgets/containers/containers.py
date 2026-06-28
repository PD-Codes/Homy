"""Portainer containers widget."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'portainer_containers',
    'name': 'Portainer Containers',
    'integration_types': ['portainer'],
    'default_size_x': 8,
    'default_size_y': 6,
    'icon': 'container',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'max_items': {
            'type': 'select',
            'label': 'Max. Container',
            'options': ['8', '12', '20', '30'],
            'default': '12',
        },
        'state_filter': {
            'type': 'select',
            'label': 'Status-Filter',
            'options': ['Alle', 'Nur laufende', 'Nur gestoppte'],
            'default': 'Alle',
        },
        'show_endpoint': {
            'type': 'select',
            'label': 'Endpoint anzeigen',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
        'group_by_endpoint': {
            'type': 'select',
            'label': 'Nach Endpoint gruppieren',
            'options': ['Nein', 'Ja'],
            'default': 'Nein',
        },
    },
}

CACHE_NS = 'portainer_containers'
CACHE_TTL = 30


def register(app):
    @app.route('/api/portainer_containers/data', methods=['GET'], endpoint='widget_portainer_containers_data')
    def portainer_containers_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, ['portainer'])
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = iwf.fetch_portainer_containers(config, wcfg.get('max_items', 12))
            containers = result.get('containers', [])
            state_filter = wcfg.get('state_filter', 'Alle')
            if state_filter == 'Nur laufende':
                containers = [c for c in containers if c.get('state') == 'running']
            elif state_filter == 'Nur gestoppte':
                containers = [c for c in containers if c.get('state') != 'running']
            result['containers'] = containers
            result['show_endpoint'] = wcfg.get('show_endpoint', 'Ja') == 'Ja'
            result['group_by_endpoint'] = wcfg.get('group_by_endpoint', 'Nein') == 'Ja'
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('portainer_containers failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
