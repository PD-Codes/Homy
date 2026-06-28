"""LDAP / Active Directory authentication."""

import json
import logging

from homy.admin_settings import AUTH_LDAP_CONFIG, get_setting_raw
from homy.auth_provision import apply_group_memberships, find_or_create_user

logger = logging.getLogger(__name__)


def _ldap_config():
    raw = get_setting_raw(AUTH_LDAP_CONFIG, '{}')
    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {}


def authenticate_ldap(username, password):
    if not username or not password:
        return None, 'Benutzername und Passwort erforderlich'
    try:
        from ldap3 import Connection, Server, ALL
    except ImportError:
        return None, 'ldap3 nicht installiert — pip install homy[ldap]'

    cfg = _ldap_config()
    server_url = cfg.get('server', '').strip()
    base_dn = cfg.get('base_dn', '').strip()
    if not server_url or not base_dn:
        return None, 'LDAP nicht konfiguriert (server, base_dn)'

    user_filter = cfg.get('user_filter', '(uid={username})')
    filter_str = user_filter.replace('{username}', username)
    bind_dn = cfg.get('bind_dn', '').strip()
    bind_password = cfg.get('bind_password', '')
    username_attr = cfg.get('username_attr', 'uid')
    email_attr = cfg.get('email_attr', 'mail')
    group_attr = cfg.get('group_attr', 'memberOf')

    server = Server(server_url, get_info=ALL)
    try:
        email = None
        groups = []
        user_dn = username
        entry = None

        if bind_dn:
            conn = Connection(server, user=bind_dn, password=bind_password, auto_bind=True)
            if not conn.search(base_dn, filter_str, attributes=[username_attr, email_attr, group_attr]):
                return None, 'LDAP-Benutzer nicht gefunden'
            entry = conn.entries[0]
            user_dn = str(entry.entry_dn)
            conn.unbind()
            Connection(server, user=user_dn, password=password, auto_bind=True).unbind()
        else:
            user_dn = cfg.get('user_dn_template', '').replace('{username}', username)
            if not user_dn:
                return None, 'bind_dn oder user_dn_template erforderlich'
            Connection(server, user=user_dn, password=password, auto_bind=True).unbind()
            conn = Connection(server, user=bind_dn, password=bind_password, auto_bind=True) if bind_dn else None
            if conn:
                conn.search(base_dn, filter_str, attributes=[username_attr, email_attr, group_attr])
                entry = conn.entries[0] if conn.entries else None

        if entry is not None:
            if hasattr(entry, email_attr):
                email = str(getattr(entry, email_attr).value or '') or None
            if hasattr(entry, group_attr):
                raw_groups = getattr(entry, group_attr).values or []
                groups = [str(g) for g in raw_groups]

        user, err = find_or_create_user(username, 'ldap', external_id=user_dn, email=email)
        if err:
            return None, err
        if groups:
            short_groups = [g.split(',')[0].replace('CN=', '') for g in groups[:20]]
            apply_group_memberships(user, short_groups)
        return user, None
    except Exception as e:
        logger.warning('LDAP auth failed: %s', e)
        return None, str(e)
