"""SAML 2.0 authentication (optional python3-saml)."""

import json
import logging
import os

from flask import request

from homy.admin_settings import AUTH_SAML_CONFIG, get_setting_raw
from homy.auth_provision import find_or_create_user

logger = logging.getLogger(__name__)


def _saml_config():
    raw = get_setting_raw(AUTH_SAML_CONFIG, '{}')
    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {}


def _prepare_request():
    url = request.url.replace('http://', 'https://') if request.headers.get('X-Forwarded-Proto') == 'https' else request.url
    return {
        'https': 'on' if request.scheme == 'https' or request.headers.get('X-Forwarded-Proto') == 'https' else 'off',
        'http_host': request.host,
        'script_name': request.path,
        'server_port': request.environ.get('SERVER_PORT', '443' if request.scheme == 'https' else '80'),
        'get_data': request.args.copy(),
        'post_data': request.form.copy(),
        'query_string': request.query_string.decode('utf-8') if request.query_string else '',
    }


def login_redirect():
    try:
        from onelogin.saml2.auth import OneLogin_Saml2_Auth
    except ImportError:
        raise RuntimeError('python3-saml nicht installiert — pip install homy[saml]')
    cfg = _saml_config()
    auth = OneLogin_Saml2_Auth(_prepare_request(), cfg.get('settings', {}))
    return auth.login()


def handle_acs():
    try:
        from onelogin.saml2.auth import OneLogin_Saml2_Auth
    except ImportError:
        return None, 'python3-saml nicht installiert'
    cfg = _saml_config()
    auth = OneLogin_Saml2_Auth(_prepare_request(), cfg.get('settings', {}))
    auth.process_response()
    if auth.get_errors():
        return None, '; '.join(auth.get_errors())
    if not auth.is_authenticated():
        return None, 'SAML-Authentifizierung fehlgeschlagen'
    attrs = auth.get_attributes()
    name_id = auth.get_nameid()
    username = (
        (attrs.get('username') or attrs.get('uid') or [None])[0]
        or (attrs.get('http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name') or [None])[0]
        or name_id
    )
    email = (attrs.get('email') or attrs.get('mail') or [None])[0]
    if isinstance(username, list):
        username = username[0]
    if isinstance(email, list):
        email = email[0]
    user, err = find_or_create_user(str(username)[:80], 'saml', external_id=name_id, email=email)
    return user, err
