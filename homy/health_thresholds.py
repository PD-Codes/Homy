"""Configurable warn/error thresholds for system health checks."""

import copy
import json

from homy.admin_settings import get_setting_raw, set_setting

HEALTH_THRESHOLDS_KEY = 'health_thresholds'

# Defaults exposed to admin UI (metric_key -> fields)
DEFAULT_THRESHOLDS = {
    'storage': {
        'label_key': 'health_threshold_storage',
        'warn': 85,
        'error': 95,
        'unit': 'percent',
    },
    'api_calls': {
        'label_key': 'health_threshold_api_calls',
        'warn': 10000,
        'error': 50000,
        'unit': 'per_hour',
    },
    'database': {
        'label_key': 'health_threshold_database',
        'warn_latency_ms': 500,
        'error_latency_ms': 2000,
        'unit': 'latency_ms',
    },
}


def _deep_merge(base, override):
    out = copy.deepcopy(base)
    for key, val in (override or {}).items():
        if key not in out or not isinstance(val, dict):
            out[key] = val
        elif isinstance(out.get(key), dict):
            out[key] = {**out[key], **val}
        else:
            out[key] = val
    return out


def get_health_thresholds():
    raw = get_setting_raw(HEALTH_THRESHOLDS_KEY, '') or ''
    if not raw.strip():
        return copy.deepcopy(DEFAULT_THRESHOLDS)
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return copy.deepcopy(DEFAULT_THRESHOLDS)
        return _deep_merge(DEFAULT_THRESHOLDS, parsed)
    except (json.JSONDecodeError, TypeError):
        return copy.deepcopy(DEFAULT_THRESHOLDS)


def save_health_thresholds(data):
    from homy.database import db

    merged = _deep_merge(DEFAULT_THRESHOLDS, data or {})
    set_setting(HEALTH_THRESHOLDS_KEY, json.dumps(merged))
    db.session.commit()
    return merged


def _status_from_high(value, warn, error):
    if value is None:
        return 'ok'
    try:
        v = float(value)
        w = float(warn)
        e = float(error)
    except (TypeError, ValueError):
        return 'ok'
    if v >= e:
        return 'error'
    if v >= w:
        return 'warn'
    return 'ok'


def status_storage(used_percent):
    t = get_health_thresholds().get('storage', {})
    return _status_from_high(used_percent, t.get('warn', 85), t.get('error', 95))


def status_api_calls(count):
    t = get_health_thresholds().get('api_calls', {})
    return _status_from_high(count, t.get('warn', 10000), t.get('error', 50000))


def status_database_latency(latency_ms):
    if latency_ms is None:
        return 'ok'
    t = get_health_thresholds().get('database', {})
    return _status_from_high(
        latency_ms,
        t.get('warn_latency_ms', 500),
        t.get('error_latency_ms', 2000),
    )
