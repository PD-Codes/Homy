"""Proxmox cluster widget — credentials from linked integration."""

import logging

import requests
from flask import jsonify, request

from homy.cache import cache_key, invalidate_widget, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'proxmox',
    'name': 'Proxmox Cluster Monitor',
    'integration_types': ['proxmox'],
    'default_size_x': 8,
    'default_size_y': 6,
    'icon': 'server',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'max_items': {
            'type': 'select',
            'label': 'Max. VMs/Container',
            'options': ['5', '10', '15', '20'],
            'default': '10',
        },
        'show_stopped': {
            'type': 'select',
            'label': 'Gestoppte VMs zeigen',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
    },
}

CACHE_NS = 'proxmox'
CACHE_TTL = 30


def _mock(node_name='pve', online=True):
    return {
        'configured': not online,
        'online': online,
        'node_name': node_name,
        'cpu_usage': 14.5 if online else 12.0,
        'memory_usage': 52.8 if online else 48.0,
        'vms': [
            {'vmid': 100, 'name': 'pfSense-Router', 'status': 'running', 'cpu': 3.4, 'ram': 18.2},
            {'vmid': 101, 'name': 'TrueNAS-Core', 'status': 'running', 'cpu': 18.5, 'ram': 72.4},
        ],
    }


def register(app):
    @app.route('/api/proxmox/status', methods=['GET'], endpoint='widget_proxmox_cluster')
    def proxmox_cluster_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        _, icfg, err, code = get_integration_for_widget(widget_id, 'proxmox')
        if err:
            return jsonify(_mock()), code if code < 500 else 200

        server_url = icfg.get('server_url', '').strip().rstrip('/')
        node_name = icfg.get('node_name', 'pve').strip()
        api_token = icfg.get('api_token', '').strip()
        if not server_url or not api_token:
            return jsonify(_mock(node_name, online=True))

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        headers = {
            'Authorization': f'PVEAPIToken={api_token}',
            'Accept': 'application/json',
        }
        try:
            node_res = requests.get(
                f'{server_url}/api2/json/nodes/{node_name}/status',
                headers=headers,
                verify=False,
                timeout=4,
            )
            node_res.raise_for_status()
            node_data = node_res.json().get('data', {})
            cpu_usage = round(node_data.get('cpu', 0.0) * 100, 1)
            memory_data = node_data.get('memory', {})
            mem_used = memory_data.get('used', 0)
            mem_total = memory_data.get('total', 1)
            memory_usage = round((mem_used / mem_total) * 100, 1)

            vms_res = requests.get(
                f'{server_url}/api2/json/nodes/{node_name}/qemu',
                headers=headers, verify=False, timeout=4,
            )
            vms_res.raise_for_status()
            vms = []
            for item in vms_res.json().get('data', []):
                vms.append({
                    'vmid': item.get('vmid'),
                    'name': item.get('name', 'Unknown VM'),
                    'status': item.get('status', 'stopped'),
                    'kind': 'vm',
                    'cpu': round(item.get('cpu', 0.0) * 100, 1),
                    'ram': round((item.get('mem', 0) / max(1, item.get('maxmem', 1))) * 100, 1)
                    if item.get('status') == 'running' else 0.0,
                })
            try:
                lxc_res = requests.get(
                    f'{server_url}/api2/json/nodes/{node_name}/lxc',
                    headers=headers, verify=False, timeout=4,
                )
                lxc_res.raise_for_status()
                for item in lxc_res.json().get('data', []):
                    vms.append({
                        'vmid': item.get('vmid'),
                        'name': item.get('name', 'Unknown CT'),
                        'status': item.get('status', 'stopped'),
                        'kind': 'ct',
                        'cpu': round(item.get('cpu', 0.0) * 100, 1),
                        'ram': round((item.get('mem', 0) / max(1, item.get('maxmem', 1))) * 100, 1)
                        if item.get('status') == 'running' else 0.0,
                    })
            except Exception:
                pass
            vms = sorted(vms, key=lambda x: x['vmid'])[:10]
            result = {
                'configured': True,
                'online': True,
                'node_name': node_name,
                'cpu_usage': cpu_usage,
                'memory_usage': memory_usage,
                'vms': vms,
            }
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('Proxmox fetch failed: %s', exc)
            fallback = _mock(node_name, online=False)
            fallback['message'] = 'Proxmox connection failed (demo)'
            return jsonify(fallback)

    @app.route('/api/proxmox/vm/toggle', methods=['POST'], endpoint='widget_proxmox_vm_toggle')
    def proxmox_vm_toggle():
        data = request.get_json() or {}
        widget_id = data.get('widget_id')
        vmid = data.get('vmid')
        action = data.get('action')

        if not widget_id or not vmid or not action:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id, vmid, action required'}), 400

        _, icfg, err, code = get_integration_for_widget(widget_id, 'proxmox')
        if err:
            return jsonify({'success': True})

        invalidate_widget(CACHE_NS, widget_id)
        server_url = icfg.get('server_url', '').strip().rstrip('/')
        node_name = icfg.get('node_name', 'pve').strip()
        api_token = icfg.get('api_token', '').strip()
        if not server_url or not api_token:
            return jsonify({'success': True})

        try:
            headers = {
                'Authorization': f'PVEAPIToken={api_token}',
                'Accept': 'application/json',
            }
            pve_action = 'start' if action == 'start' else 'stop'
            kind = data.get('kind', 'vm')
            resource = 'lxc' if kind == 'ct' else 'qemu'
            url = f'{server_url}/api2/json/nodes/{node_name}/{resource}/{vmid}/status/{pve_action}'
            res = requests.post(url, headers=headers, verify=False, timeout=5)
            res.raise_for_status()
            return jsonify({'success': True})
        except Exception as exc:
            logger.error('Proxmox %s toggle failed: %s', kind, exc)
            return jsonify({'error': 'Internal Server Error', 'message': str(exc)}), 500
