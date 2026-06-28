"""Grafana panel widget — credentials from linked integration."""

import logging

import requests
from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.database import WidgetInstance
from homy.integration_widget_util import get_integration_for_widget, get_widget_config

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'grafana',
    'name': 'Grafana',
    'integration_types': ['grafana'],
    'default_size_x': 8,
    'default_size_y': 6,
    'icon': 'bar-chart-2',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'view_mode': {
            'type': 'select',
            'label': 'View mode',
            'options': ['Health', 'Dashboard list', 'Panels'],
            'default': 'Dashboard list',
        },
        'dashboard_uid': {'type': 'text', 'label': 'Dashboard UID (Panels mode)', 'default': ''},
        'panel_ids': {
            'type': 'textarea',
            'label': 'Panel IDs (comma-separated)',
            'default': '',
        },
        'max_dashboards': {
            'type': 'select',
            'label': 'Max dashboards in list',
            'options': ['5', '10', '15', '20'],
            'default': '10',
        },
    },
}

CACHE_NS = 'grafana'
CACHE_TTL = 60


def register(app):
    @app.route('/api/grafana/status', methods=['GET'], endpoint='widget_grafana_panel')
    def grafana_panel_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404
        _, icfg, err, code = get_integration_for_widget(widget_id, 'grafana')
        if err:
            return jsonify({'configured': False, 'message': err}), code

        base = (icfg.get('server_url') or '').strip().rstrip('/')
        api_key = (icfg.get('api_key') or '').strip()
        if not base or not api_key:
            return jsonify({
                'configured': False,
                'message': 'Grafana URL and API key required on integration.',
            })

        view_mode = wcfg.get('view_mode', 'Dashboard list')
        max_dashboards = int(wcfg.get('max_dashboards', 10) or 10)

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        headers = {'Authorization': f'Bearer {api_key}', 'Accept': 'application/json'}
        try:
            health_res = requests.get(f'{base}/api/health', headers=headers, timeout=5)
            health_res.raise_for_status()
            health = health_res.json() if health_res.content else {}

            dashboards = []
            if view_mode in ('Dashboard list', 'Panels'):
                dash_res = requests.get(
                    f'{base}/api/search',
                    params={'type': 'dash-db'},
                    headers=headers,
                    timeout=10,
                )
                dash_res.raise_for_status()
                raw = dash_res.json() if dash_res.content else []
                dashboards = [
                    {'uid': d.get('uid'), 'title': d.get('title'), 'uri': d.get('uri', '')}
                    for d in (raw if isinstance(raw, list) else [])
                ][:max_dashboards]

            panels = []
            if view_mode == 'Panels':
                uid = (wcfg.get('dashboard_uid') or '').strip()
                panel_raw = (wcfg.get('panel_ids') or '').strip()
                panel_ids = [p.strip() for p in panel_raw.split(',') if p.strip()]
                if uid and panel_ids:
                    dash_detail = requests.get(
                        f'{base}/api/dashboards/uid/{uid}',
                        headers=headers,
                        timeout=10,
                    )
                    dash_detail.raise_for_status()
                    dashboard = dash_detail.json().get('dashboard', {}) or {}
                    title_map = {}
                    for row in dashboard.get('panels', []) or []:
                        pid = str(row.get('id', ''))
                        if pid:
                            title_map[pid] = row.get('title') or f'Panel {pid}'
                    for pid in panel_ids:
                        panels.append({
                            'id': pid,
                            'title': title_map.get(pid, f'Panel {pid}'),
                            'render_url': (
                                f'{base}/render/d-solo/{uid}?panelId={pid}&width=480&height=240'
                                f'&auth_token={api_key}'
                            ),
                        })

            result = {
                'configured': True,
                'online': True,
                'view_mode': view_mode,
                'health': health,
                'dashboards': dashboards,
                'panels': panels,
            }
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.error('Grafana widget fetch failed: %s', exc, exc_info=True)
            return jsonify({
                'configured': True,
                'online': False,
                'view_mode': view_mode,
                'health': {},
                'dashboards': [],
                'panels': [],
                'message': 'Could not connect to Grafana.',
            })
