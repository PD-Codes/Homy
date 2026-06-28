"""Zabbix integration (JSON-RPC API)."""

import logging
import re
from datetime import datetime, timezone

import requests

logger = logging.getLogger(__name__)

SEVERITY_LABELS = {
    0: 'Not classified',
    1: 'Information',
    2: 'Warning',
    3: 'Average',
    4: 'High',
    5: 'Disaster',
}

INTEGRATION_TYPE = {
    'name': 'Zabbix',
    'icon': 'activity',
    'fields': {
        'server_url': {
            'type': 'text',
            'label': 'Zabbix URL',
            'default': 'https://zabbix.example.com',
        },
        'api_token': {
            'type': 'password',
            'label': 'API Token',
            'default': '',
        },
        'verify_ssl': {
            'type': 'select',
            'label': 'Verify SSL certificate',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
    },
    'metrics': [
        {'path': 'host_count', 'label': 'Hosts monitored'},
        {'path': 'problems_count', 'label': 'Active problems'},
        {'path': 'problems_high', 'label': 'High severity problems'},
        {'path': 'problems_disaster', 'label': 'Disaster severity problems'},
        {'path': 'version', 'label': 'Zabbix version'},
        {'path': 'problems', 'label': 'Problems (array)'},
    ],
}


def _api_url(config):
    return config.get('server_url', '').strip().rstrip('/')


def zabbix_api_call(config, method, params=None, auth_required=True):
    """Call Zabbix JSON-RPC API. Returns result or raises ValueError."""
    base = _api_url(config)
    if not base:
        raise ValueError('Zabbix URL required')

    token = (config.get('api_token') or '').strip()
    if auth_required and not token:
        raise ValueError('Zabbix API token required')

    headers = {'Content-Type': 'application/json-rpc'}
    if auth_required and token:
        headers['Authorization'] = f'Bearer {token}'

    payload = {
        'jsonrpc': '2.0',
        'method': method,
        'params': params or {},
        'id': 1,
    }

    res = requests.post(
        f'{base}/api_jsonrpc.php',
        json=payload,
        timeout=15,
        headers=headers,
    )
    res.raise_for_status()
    data = res.json()
    if 'error' in data:
        err = data['error']
        msg = err.get('data', err.get('message', str(err)))
        raise ValueError(f'Zabbix API: {msg}')
    return data.get('result')


def _host_name_from_hosts_list(hosts):
    if not hosts or not isinstance(hosts[0], dict):
        return ''
    return hosts[0].get('name') or hosts[0].get('host') or ''


def _fetch_host_names_by_event(config, event_ids):
    """Zabbix 7+: problem.get has no selectHosts; resolve via event.get."""
    ids = [str(e) for e in event_ids if e is not None]
    if not ids:
        return {}
    try:
        raw = zabbix_api_call(config, 'event.get', {
            'output': ['eventid'],
            'eventids': ids,
            'selectHosts': ['hostid', 'host', 'name'],
        })
    except ValueError as exc:
        logger.debug('event.get selectHosts failed: %s', exc)
        return {}
    if not isinstance(raw, list):
        return {}
    out = {}
    for ev in raw:
        if not isinstance(ev, dict) or ev.get('eventid') is None:
            continue
        name = _host_name_from_hosts_list(ev.get('hosts'))
        if name:
            out[str(ev['eventid'])] = name
    return out


def _fetch_host_names_by_trigger(config, trigger_ids):
    """Fallback when event.get returns no host (older/alternate setups)."""
    ids = [str(t) for t in trigger_ids if t is not None]
    if not ids:
        return {}
    try:
        raw = zabbix_api_call(config, 'trigger.get', {
            'output': ['triggerid'],
            'triggerids': ids,
            'selectHosts': ['hostid', 'host', 'name'],
        })
    except ValueError as exc:
        logger.debug('trigger.get selectHosts failed: %s', exc)
        return {}
    if not isinstance(raw, list):
        return {}
    out = {}
    for tr in raw:
        if not isinstance(tr, dict) or tr.get('triggerid') is None:
            continue
        name = _host_name_from_hosts_list(tr.get('hosts'))
        if name:
            out[str(tr['triggerid'])] = name
    return out


def _enrich_problems_with_hosts(config, problems):
    if not problems:
        return problems
    event_ids = [p.get('eventid') for p in problems if isinstance(p, dict)]
    by_event = _fetch_host_names_by_event(config, event_ids)
    trigger_ids = [
        p.get('objectid') for p in problems
        if isinstance(p, dict) and str(p.get('object', '0')) == '0' and p.get('objectid')
    ]
    by_trigger = _fetch_host_names_by_trigger(config, trigger_ids)
    for p in problems:
        if not isinstance(p, dict):
            continue
        host = ''
        eid = p.get('eventid')
        if eid is not None:
            host = by_event.get(str(eid), '')
        if not host and p.get('objectid') is not None:
            host = by_trigger.get(str(p['objectid']), '')
        if host:
            p['hosts'] = [{'name': host, 'host': host}]
    return problems


def _normalize_problem(item):
    host_name = _host_name_from_hosts_list(item.get('hosts'))
    sev = int(item.get('severity', 0))
    clock = item.get('clock')
    started = ''
    if clock:
        try:
            started = datetime.fromtimestamp(int(clock), tz=timezone.utc).strftime('%Y-%m-%d %H:%M')
        except (TypeError, ValueError, OSError):
            started = str(clock)
    return {
        'eventid': item.get('eventid'),
        'name': item.get('name') or 'Problem',
        'severity': sev,
        'severity_label': SEVERITY_LABELS.get(sev, f'Severity {sev}'),
        'host': host_name,
        'clock': clock,
        'started': started,
        'opdata': item.get('opdata') or '',
    }


def fetch_problems(config, limit=10, min_severity=0):
    params = {
        'output': ['eventid', 'objectid', 'object', 'name', 'severity', 'clock', 'opdata'],
        'recent': True,
        'sortfield': ['eventid'],
        'sortorder': 'DESC',
        'limit': max(1, min(int(limit), 50)),
    }
    if min_severity > 0:
        params['min_severity'] = int(min_severity)

    raw = zabbix_api_call(config, 'problem.get', params)
    if not isinstance(raw, list):
        return []
    _enrich_problems_with_hosts(config, raw)
    return [_normalize_problem(p) for p in raw if isinstance(p, dict)]


def fetch_summary(config):
    version = zabbix_api_call(config, 'apiinfo.version', {}, auth_required=False)
    host_raw = zabbix_api_call(config, 'host.get', {
        'countOutput': True,
        'monitored_hosts': True,
    })
    try:
        host_count = int(host_raw)
    except (TypeError, ValueError):
        host_count = 0

    problems = fetch_problems(config, limit=100, min_severity=0)
    by_severity = {i: 0 for i in range(6)}
    for p in problems:
        sev = p.get('severity', 0)
        if 0 <= sev <= 5:
            by_severity[sev] = by_severity.get(sev, 0) + 1

    return {
        'version': version if isinstance(version, str) else str(version or ''),
        'host_count': host_count,
        'problems_count': len(problems),
        'problems_high': by_severity.get(4, 0) + by_severity.get(5, 0),
        'problems_disaster': by_severity.get(5, 0),
        'problems_average': by_severity.get(3, 0),
        'problems_warning': by_severity.get(2, 0),
        'by_severity': by_severity,
        'problems': problems,
    }


def fetch_payload(config):
    summary = fetch_summary(config)
    return summary


def fetch_hosts(config, search=None, limit=200):
    """Monitored hosts for widget host picker."""
    params = {
        'output': ['hostid', 'host', 'name'],
        'monitored_hosts': True,
        'sortfield': 'name',
        'sortorder': 'ASC',
        'limit': max(1, min(int(limit), 500)),
    }
    if search and str(search).strip():
        params['search'] = {'name': str(search).strip()}
        params['searchWildcards'] = True

    raw = zabbix_api_call(config, 'host.get', params)
    if not isinstance(raw, list):
        return []
    hosts = []
    for h in raw:
        if not isinstance(h, dict):
            continue
        hosts.append({
            'hostid': str(h.get('hostid', '')),
            'host': h.get('host') or '',
            'name': h.get('name') or h.get('host') or '',
        })
    return hosts


def _parse_last_value(item):
    raw = item.get('lastvalue')
    if raw is None or raw == '':
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _format_percent(value, decimals=1):
    if value is None:
        return None
    return round(float(value), decimals)


def _format_temp(value):
    if value is None:
        return None
    return round(float(value), 0)


def _temp_sort_key(label):
    m = re.search(r'(?:CPU|Core)\s*(\d+)', label, re.I)
    if m:
        return (0, int(m.group(1)))
    m = re.search(r'temp\s*(\d+)', label, re.I)
    if m:
        return (1, int(m.group(1)))
    return (2, label.lower())


def _temp_label_from_item(item):
    name = (item.get('name') or '').strip()
    short = name.split(':')[-1].strip() if ':' in name else name
    m = re.search(r'core\s*(\d+)', short, re.I)
    if m:
        return f'CPU {m.group(1)}'
    m = re.search(r'temp\s*(\d+)', short, re.I)
    if m:
        return f'temp{m.group(1)}'
    if short.lower().startswith('temperature'):
        return short.replace('Temperature Sensor', '').strip() or short
    return short[:32] if short else (item.get('key_') or 'Sensor')


def _is_temperature_item(item):
    key = (item.get('key_') or '').lower()
    name = (item.get('name') or '').lower()
    units = (item.get('units') or '').lower()
    if 'temperature' in name or 'temperature' in key:
        return True
    if 'sensor' in name and ('temp' in name or 'core' in name):
        return True
    if units in ('°c', 'c', '℃'):
        return True
    return False


def _pick_cpu_item(items):
    for item in items:
        key = item.get('key_', '')
        if key == 'system.cpu.util':
            return item
    for item in items:
        name = (item.get('name') or '').lower()
        units = (item.get('units') or '')
        if ('cpu utilization' in name or 'cpu utilisation' in name) and '%' in units:
            return item
    return None


def _pick_memory_item(items):
    for item in items:
        if item.get('key_') == 'vm.memory.util':
            return item
    for item in items:
        key = item.get('key_', '')
        if 'vm.memory.size' in key and 'pused' in key:
            return item
    for item in items:
        name = (item.get('name') or '').lower()
        if 'memory utilization' in name:
            return item
    return None


def _pick_disk_item(items, mount='/'):
    mount = mount or '/'
    candidates = []
    for item in items:
        key = item.get('key_', '') or ''
        if 'pused' not in key:
            continue
        if not (key.startswith('vfs.fs.size[') or key.startswith('vfs.fs.dependent.size[')):
            continue
        if f',{mount},' in key or f'[{mount},' in key or f'"{mount}"' in key:
            candidates.append((0, item))
        elif mount == '/' and (',/,pused' in key or '[/,pused' in key):
            candidates.append((1, item))
        else:
            candidates.append((2, item))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[0])
    return candidates[0][1]


def fetch_host_status(config, host_id, disk_mount='/'):
    """CPU, RAM, disk % and dynamic temperature rows for one host."""
    host_id = str(host_id or '').strip()
    if not host_id:
        raise ValueError('Host required')

    hosts = zabbix_api_call(config, 'host.get', {
        'output': ['hostid', 'host', 'name'],
        'hostids': [host_id],
    })
    if not isinstance(hosts, list) or not hosts:
        raise ValueError('Host not found')
    host_info = hosts[0]

    items = zabbix_api_call(config, 'item.get', {
        'output': ['itemid', 'key_', 'name', 'lastvalue', 'units', 'value_type'],
        'hostids': [host_id],
        'monitored': True,
        'sortfield': 'name',
        'sortorder': 'ASC',
        'limit': 5000,
    })
    if not isinstance(items, list):
        items = []

    cpu_item = _pick_cpu_item(items)
    mem_item = _pick_memory_item(items)
    disk_item = _pick_disk_item(items, disk_mount)

    temperatures = []
    seen_labels = set()
    for item in items:
        if not _is_temperature_item(item):
            continue
        if cpu_item and item.get('itemid') == cpu_item.get('itemid'):
            continue
        if mem_item and item.get('itemid') == mem_item.get('itemid'):
            continue
        if disk_item and item.get('itemid') == disk_item.get('itemid'):
            continue
        label = _temp_label_from_item(item)
        if label in seen_labels:
            continue
        val = _format_temp(_parse_last_value(item))
        if val is None:
            continue
        seen_labels.add(label)
        temperatures.append({'label': label, 'value': val, 'unit': '°C'})
    temperatures.sort(key=lambda t: _temp_sort_key(t['label']))

    return {
        'hostid': host_id,
        'host': host_info.get('host') or '',
        'name': host_info.get('name') or host_info.get('host') or '',
        'cpu_percent': _format_percent(_parse_last_value(cpu_item)) if cpu_item else None,
        'memory_percent': _format_percent(_parse_last_value(mem_item)) if mem_item else None,
        'disk_percent': _format_percent(_parse_last_value(disk_item)) if disk_item else None,
        'disk_mount': disk_mount or '/',
        'temperatures': temperatures,
    }


