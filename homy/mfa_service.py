"""TOTP multi-factor authentication."""

import base64
import io
import secrets

from homy.admin_settings import get_setting_bool, AUTH_MFA_REQUIRED
from homy.database import db, User


def _pyotp():
    import pyotp
    return pyotp


def generate_secret():
    return _pyotp().random_base32()


def provisioning_uri(user, secret=None):
    secret = secret or user.mfa_secret
    if not secret:
        return None
    return _pyotp().TOTP(secret).provisioning_uri(name=user.username, issuer_name='Homy')


def qr_code_base64(uri):
    if not uri:
        return None
    try:
        import qrcode
        img = qrcode.make(uri)
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        return base64.b64encode(buf.getvalue()).decode('ascii')
    except Exception:
        return None


def verify_code(user, code):
    if not user or not user.mfa_secret:
        return False
    totp = _pyotp().TOTP(user.mfa_secret)
    return totp.verify(str(code).strip(), valid_window=1)


def mfa_required_for_user(user):
    if user.mfa_enabled and user.mfa_secret:
        return True
    return get_setting_bool(AUTH_MFA_REQUIRED, False)


def setup_mfa(user):
    secret = generate_secret()
    user.mfa_secret = secret
    user.mfa_enabled = False
    db.session.commit()
    uri = provisioning_uri(user, secret)
    return {
        'secret': secret,
        'uri': uri,
        'qr_base64': qr_code_base64(uri),
    }


def confirm_mfa_setup(user, code):
    if not user.mfa_secret:
        return False, 'Kein Setup gestartet'
    if not verify_code(user, code):
        return False, 'Ungültiger Code'
    user.mfa_enabled = True
    db.session.commit()
    return True, None


def disable_mfa(user):
    user.mfa_secret = None
    user.mfa_enabled = False
    db.session.commit()
