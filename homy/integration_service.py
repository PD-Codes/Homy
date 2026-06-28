"""Central integration service: vault, fetch dispatch, and shared helpers."""

import json
import logging

from homy.database import db, Setting

logger = logging.getLogger(__name__)

# Populated at runtime by IntegrationManager
INTEGRATION_TYPES = {}
_FETCH_HANDLERS = {}

# Old integration type ids → canonical type (fetch only; hidden from "new integration" UI).
LEGACY_INTEGRATION_TYPE_ALIASES = {
    'openweather': 'weather',
}

# Old integration folders under integrations/ — skip if canonical folder exists.
SUPERSEDED_INTEGRATION_FOLDERS = frozenset({'openweather'})


def canonical_integration_type(itype):
    return LEGACY_INTEGRATION_TYPE_ALIASES.get(itype, itype)


def get_integration_type_def(itype):
    return INTEGRATION_TYPES.get(canonical_integration_type(itype), {})


def integration_vault_key(integration_id, field_name):
    return f'integration_vault_{integration_id}_{field_name}'


def resolve_integration_config(integration):
    try:
        data = json.loads(integration.config_json or '{}')
    except Exception:
        data = {}
    for k, v in list(data.items()):
        if v == '__VAULT_SECRET__':
            setting = db.session.get(Setting, integration_vault_key(integration.id, k))
            if setting:
                data[k] = setting.value
    return data


def mask_integration_config(integration, config):
    type_def = get_integration_type_def(integration.type)
    fields = type_def.get('fields', {})
    masked = dict(config)
    for fname, finfo in fields.items():
        if finfo.get('type') == 'password' and fname in masked and masked[fname]:
            masked[fname] = '********'
    return masked


def get_nested_value(obj, path):
    if not path or path == '_raw':
        return obj
    parts = path.split('.')
    cur = obj
    for p in parts:
        if cur is None:
            return None
        if isinstance(cur, dict):
            cur = cur.get(p)
        elif isinstance(cur, list) and p.isdigit():
            cur = cur[int(p)]
        else:
            return None
    return cur


def _fetch_payload_by_type(itype, config):
    """Fetch payload for a resolved integration type+config."""
    handler = _FETCH_HANDLERS.get(itype)
    if handler:
        return handler(dict(config or {}))

    from homy.integration_manager import get_integration_manager
    manager = get_integration_manager()
    if manager:
        return manager.fetch_payload(itype, config)

    raise ValueError(f'Unbekannter Integrationstyp: {itype}')


def fetch_integration_payload(integration):
    config = resolve_integration_config(integration)
    return _fetch_payload_by_type(integration.type, config)


def fetch_integration_payload_with_overrides(integration, overrides=None):
    """Fetch payload, temporarily overriding integration config keys for this request."""
    config = resolve_integration_config(integration)
    if overrides:
        for k, v in overrides.items():
            if v is None:
                continue
            config[k] = v
    return _fetch_payload_by_type(integration.type, config)


def list_available_integrations(user_id, is_admin, include_global=True):
    from homy.database import Integration

    q = Integration.query.filter_by(enabled=True)
    items = []
    if user_id:
        items.extend(q.filter_by(user_id=user_id).all())
    if include_global:
        items.extend(q.filter_by(user_id=None).all())
    elif is_admin:
        items.extend(q.filter_by(user_id=None).all())

    seen = set()
    result = []
    for item in items:
        if item.id in seen:
            continue
        seen.add(item.id)
        result.append(item)
    return result
