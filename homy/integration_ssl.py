"""Core SSL-verification support for all integrations.

Patches requests.Session.request once at import time so that all HTTP calls
made inside a fetch_payload invocation automatically respect the integration's
verify_ssl config value — without any integration needing to know about it.

Usage in IntegrationManager:
    token = set_ssl_context(config)
    try:
        result = handler(config)
    finally:
        reset_ssl_context(token)
"""

import contextvars

import urllib3
import requests as _requests

VERIFY_SSL_FIELD = {
    'type': 'select',
    'label': 'SSL-Zertifikat prüfen',
    'options': ['Ja', 'Nein'],
    'default': 'Ja',
}

_ctx_verify = contextvars.ContextVar('homy_ssl_verify', default=True)

_orig_session_request = _requests.Session.request


def _patched_session_request(self, method, url, **kwargs):
    if 'verify' not in kwargs:
        kwargs['verify'] = _ctx_verify.get()
    return _orig_session_request(self, method, url, **kwargs)


_requests.Session.request = _patched_session_request


def set_ssl_context(config):
    """Activate the SSL verify flag for this execution context. Returns a reset token."""
    val = config.get('verify_ssl', 'Ja') != 'Nein'
    if not val:
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    return _ctx_verify.set(val)


def reset_ssl_context(token):
    """Restore the previous SSL context."""
    _ctx_verify.reset(token)
