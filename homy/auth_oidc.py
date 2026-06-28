"""OpenID Connect (Azure AD, etc.) authentication."""

import json
import logging
import secrets

from authlib.integrations.flask_client import OAuth

from homy.admin_settings import AUTH_OIDC_CONFIG, get_setting_raw
from homy.auth_provision import find_or_create_user

logger = logging.getLogger(__name__)
_oauth = None


def _oidc_config():
    raw = get_setting_raw(AUTH_OIDC_CONFIG, '{}')
    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {}


def init_oidc(app):
    global _oauth
    cfg = _oidc_config()
    if not cfg.get('client_id') or not cfg.get('issuer'):
        return None
    _oauth = OAuth(app)
    issuer = cfg['issuer'].rstrip('/')
    metadata_url = cfg.get('metadata_url') or f'{issuer}/.well-known/openid-configuration'
    _oauth.register(
        name='oidc',
        client_id=cfg['client_id'],
        client_secret=cfg.get('client_secret', ''),
        server_metadata_url=metadata_url,
        client_kwargs={'scope': cfg.get('scope', 'openid profile email')},
    )
    return _oauth


def get_oauth():
    return _oauth


def login_redirect():
    cfg = _oidc_config()
    oauth = get_oauth()
    if not oauth:
        raise RuntimeError('OIDC nicht konfiguriert')
    redirect_uri = cfg.get('redirect_uri', '').strip()
    if not redirect_uri:
        raise RuntimeError('redirect_uri in auth_oidc_config fehlt')
    return oauth.oidc.authorize_redirect(redirect_uri)


def handle_callback():
    from flask import session

    oauth = get_oauth()
    if not oauth:
        return None, 'OIDC nicht konfiguriert'
    token = oauth.oidc.authorize_access_token()
    userinfo = token.get('userinfo')
    if not userinfo:
        resp = oauth.oidc.get('userinfo')
        userinfo = resp.json()

    sub = userinfo.get('sub')
    username = (
        userinfo.get('preferred_username')
        or userinfo.get('email')
        or userinfo.get('upn')
        or sub
    )
    if not username:
        return None, 'Kein Benutzername in OIDC-Antwort'
    username = str(username).split('@')[0][:80]
    email = userinfo.get('email')
    user, err = find_or_create_user(username, 'oidc', external_id=sub, email=email)
    return user, err
