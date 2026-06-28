"""Shared login completion and multi-provider authentication."""

from flask import session

from homy.admin_settings import get_setting_bool, AUTH_LDAP_ENABLED
from homy.auth import establish_session, verify_local_password
from homy.database import User
from homy.mfa_service import mfa_required_for_user


def authenticate_credentials(username, password):
    """Try LDAP (if enabled) then local password."""
    user = None
    ldap_error = None

    if get_setting_bool(AUTH_LDAP_ENABLED, False):
        from homy.auth_ldap import authenticate_ldap
        user, ldap_error = authenticate_ldap(username, password)
        if user:
            return user, None

    user = verify_local_password(username, password)
    if user:
        return user, None

    if ldap_error:
        return None, ldap_error
    return None, None


def login_response_payload(user):
    """Return JSON payload; may require MFA step first."""
    if mfa_required_for_user(user):
        session['mfa_pending_user_id'] = user.id
        session.pop('user_id', None)
        session.pop('username', None)
        session.pop('role', None)
        return {
            'success': False,
            'mfa_required': True,
            'message': 'MFA-Code erforderlich',
        }
    return {'success': True, 'mfa_required': False, 'user': user.to_dict()}


def clear_mfa_pending():
    session.pop('mfa_pending_user_id', None)
