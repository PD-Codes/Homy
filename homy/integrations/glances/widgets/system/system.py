"""Glances system monitor widget — bars, processes, network."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'glances_system',
    'name': 'Glances System',
    'integration_types': ['glances'],
    'default_size_x': 6,
    'default_size_y': 5,
    'icon': 'cpu',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'show_processes': {
            'type': 'select',
            'label': 'Prozesse anzeigen',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
        'show_network': {
            'type': 'select',
            'label': 'Netzwerk anzeigen',
            'options': ['Ja', 'Nein'],
            'default': 'Nein',
        },
        'show_swap': {
            'type': 'select',
            'label': 'Swap anzeigen',
            'options': ['Ja', 'Nein'],
            'default': 'Nein',
        },
        'max_processes': {
            'type': 'select',
            'label': 'Max. Prozesse',
            'options': ['3', '5', '8'],
            'default': '5',
        },
    },
}

CACHE_NS = 'glances_system'
CACHE_TTL = 20


def register(app):
    @app.route('/api/glances_system/data', methods=['GET'], endpoint='widget_glances_system_data')
    def glances_system_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, ['glances'])
        if err:
            return jsonify({'configured': False, 'online': False, 'message': err}), code

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = iwf.fetch_glances_extended(config)
            try:
                max_proc = max(1, min(int(wcfg.get('max_processes', 5) or 5), 8))
            except (TypeError, ValueError):
                max_proc = 5
            result['processes'] = result.get('processes', [])[:max_proc]
            result['show_processes'] = wcfg.get('show_processes', 'Ja') == 'Ja'
            result['show_network'] = wcfg.get('show_network', 'Nein') == 'Ja'
            result['show_swap'] = wcfg.get('show_swap', 'Nein') == 'Ja'
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('glances_system failed: %s', exc)
            return jsonify({'configured': True, 'online': False, 'message': str(exc)}), 200
