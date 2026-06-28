"""Proxmox VE integration."""

import requests

INTEGRATION_TYPE = {
    'name': 'Proxmox VE',
    'icon': 'server',
    'fields': {
        'server_url': {
            'type': 'text',
            'label': 'Proxmox URL',
            'default': 'https://localhost:8006',
        },
        'node_name': {
            'type': 'text',
            'label': 'Node name',
            'default': 'pve',
        },
        'username': {
            'type': 'text',
            'label': 'Username (e.g. root@pam)',
            'default': 'root@pam',
        },
        'api_token': {
            'type': 'password',
            'label': 'API Token (USER@REALM!TOKENID=SECRET)',
            'default': '',
        },
        'verify_ssl': {
            'type': 'select',
            'label': 'SSL-Zertifikat prüfen',
            'options': ['Ja', 'Nein'],
            'default': 'Nein',
        },
    },
    'metrics': [
        {'path': 'cpu_usage', 'label': 'CPU %'},
        {'path': 'memory_usage', 'label': 'Memory %'},
        {'path': 'vms', 'label': 'VMs (array)'},
    ],
}


def fetch_payload(config):
    server_url = config.get('server_url', '').strip().rstrip('/')
    node_name = config.get('node_name', 'pve').strip()
    api_token = config.get('api_token', '').strip()
    if not server_url or not api_token:
        raise ValueError('Proxmox URL and API token required')

    headers = {
        'Authorization': f'PVEAPIToken={api_token}',
        'Accept': 'application/json',
    }
    node_res = requests.get(
        f'{server_url}/api2/json/nodes/{node_name}/status',
        headers=headers,
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
        headers=headers,
        timeout=4,
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
            headers=headers,
            timeout=4,
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
    return {
        'node_name': node_name,
        'cpu_usage': cpu_usage,
        'memory_usage': memory_usage,
        'vms': vms,
    }
