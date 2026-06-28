"""Helpers for integration-linked custom widgets."""

import importlib

from homy.database import WidgetInstance, Integration
from homy.integration_service import (
    canonical_integration_type,
    fetch_integration_payload_with_overrides,
    resolve_integration_config,
)


def _set_request_ssl_context(config):
    """Set the SSL verify context for the current Flask request.

    Stores the reset token in flask.g so teardown_request can clean it up.
    Safe to call multiple times per request — each call pushes a token.
    """
    try:
        from flask import g
        from homy.integration_ssl import set_ssl_context
        token = set_ssl_context(config)
        if not hasattr(g, '_ssl_ctx_tokens'):
            g._ssl_ctx_tokens = []
        g._ssl_ctx_tokens.append(token)
    except Exception:
        pass


def _normalize_integration_type(itype):
    return canonical_integration_type(itype)


def get_integration_plugin_module(integration_type):
    """Return the integration plugin module (fetch_payload, widget helpers, etc.)."""
    canonical = canonical_integration_type(integration_type)
    from homy.integration_manager import get_integration_manager

    manager = get_integration_manager()
    if manager:
        entry = manager.integrations.get(canonical)
        if entry and entry.get('module_object'):
            return entry['module_object']
    return importlib.import_module(f'homy.integrations.{canonical}.{canonical}')


def is_preview_widget_id(widget_id):
    return str(widget_id or '').startswith('preview-')


def preview_integration_id_from_widget_id(widget_id):
    if not is_preview_widget_id(widget_id):
        return None
    try:
        return int(str(widget_id)[8:])
    except (TypeError, ValueError):
        return None


def get_widget_config(widget_id):
    """Widget config dict, or {} for preview pseudo-ids."""
    if is_preview_widget_id(widget_id):
        return {}
    widget = WidgetInstance.query.get(widget_id)
    if not widget:
        return None
    return widget.config or {}


def _type_matches(integration, integration_type):
    if integration_type is None:
        return True
    if isinstance(integration_type, (list, tuple, set)):
        allowed = {_normalize_integration_type(t) for t in integration_type}
        actual = _normalize_integration_type(integration.type)
        return actual in allowed
    expected = _normalize_integration_type(integration_type)
    actual = _normalize_integration_type(integration.type)
    return actual == expected


def get_integration_for_widget(widget_id, integration_type):
    """Return (integration, resolved_config) or (None, None, error, status_code)."""
    preview_iid = preview_integration_id_from_widget_id(widget_id)
    if preview_iid is not None:
        integration = Integration.query.get(preview_iid)
        if not integration:
            return None, None, 'Integration not found', 404
        if not _type_matches(integration, integration_type):
            label = integration_type
            if isinstance(integration_type, (list, tuple, set)):
                label = ', '.join(integration_type)
            return None, None, f'Widget requires integration type: {label}', 400
        return integration, resolve_integration_config(integration), None, 200

    widget = WidgetInstance.query.get(widget_id)
    if not widget:
        return None, None, 'Widget not found', 404

    integration_id = (widget.config or {}).get('integration_id')
    if not integration_id:
        return None, None, 'No integration linked — configure under Integrations.', 400

    integration = Integration.query.get(int(integration_id))
    if not integration:
        return None, None, 'Integration not found', 404

    if not _type_matches(integration, integration_type):
        label = integration_type
        if isinstance(integration_type, (list, tuple, set)):
            label = ', '.join(integration_type)
        return None, None, f'Widget requires integration type: {label}', 400

    config = resolve_integration_config(integration)
    _set_request_ssl_context(config)
    return integration, config, None, 200


def fetch_integration_for_widget(widget_id, integration_type, endpoint_key, extra_overrides=None):
    integration, _, err, code = get_integration_for_widget(widget_id, integration_type)
    if err:
        return None, err, code

    overrides = {'endpoint': endpoint_key}
    wcfg = get_widget_config(widget_id)
    if wcfg is None:
        return None, 'Widget not found', 404
    cfg_endpoint = wcfg.get('endpoint')
    if cfg_endpoint:
        overrides['endpoint'] = cfg_endpoint
    if extra_overrides:
        overrides.update(extra_overrides)

    try:
        payload = fetch_integration_payload_with_overrides(integration, overrides=overrides)
        return payload, None, 200
    except Exception as exc:
        return None, str(exc), 502
