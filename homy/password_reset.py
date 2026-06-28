"""Password reset via SMTP (6-digit code)."""

from __future__ import annotations

import json
import logging
import secrets
import re
from datetime import datetime, timedelta, timezone

from homy.admin_settings import get_setting_bool, get_setting_raw, SMTP_HOST
from homy.database import Setting, User, db
from homy.notification_service import send_smtp

logger = logging.getLogger(__name__)

CODE_TTL_MINUTES = 15
CODE_LENGTH = 6


def _reset_key(identifier: str) -> str:
    return f'pwd_reset_{identifier.strip().lower()}'


def _smtp_configured() -> bool:
    host = (get_setting_raw(SMTP_HOST, '') or '').strip()
    return bool(host)


def find_user_by_identifier(identifier: str):
    ident = (identifier or '').strip()
    if not ident:
        return None
    user = User.query.filter_by(username=ident).first()
    if user:
        return user
    if '@' in ident:
        return User.query.filter_by(email=ident.lower()).first()
    return None


def request_reset_code(identifier: str):
    """Send 6-digit code. Returns (ok, message_key, message_params)."""
    if not _smtp_configured():
        return False, 'password_reset_smtp_required', {}

    user = find_user_by_identifier(identifier)
    if not user:
        return True, 'password_reset_sent_generic', {}
    if not (user.email or '').strip():
        return False, 'password_reset_no_email', {}

    if (user.auth_provider or 'local') != 'local':
        return False, 'password_reset_external_auth', {}

    code = f'{secrets.randbelow(10 ** CODE_LENGTH):0{CODE_LENGTH}d}'
    payload = {
        'user_id': user.id,
        'code': code,
        'expires': (datetime.now(timezone.utc) + timedelta(minutes=CODE_TTL_MINUTES)).isoformat(),
    }
    key = _reset_key(user.username)
    existing = Setting.query.filter_by(key=key).first()
    if existing:
        existing.value = json.dumps(payload)
    else:
        db.session.add(Setting(key=key, value=json.dumps(payload)))
    db.session.commit()

    subject = 'Homy — Password reset code'
    body = (
        f'Your password reset code is: {code}\n\n'
        f'This code expires in {CODE_TTL_MINUTES} minutes.\n'
        'If you did not request this, ignore this email.'
    )
    try:
        send_smtp(user.email, subject, body)
    except Exception as exc:
        logger.warning('Password reset mail failed: %s', exc)
        return False, 'password_reset_mail_failed', {}

    return True, 'password_reset_sent_generic', {}


def _load_pending(username: str):
    user = User.query.filter_by(username=username).first()
    if not user:
        return None, None
    row = Setting.query.filter_by(key=_reset_key(username)).first()
    if not row or not row.value:
        return user, None
    try:
        data = json.loads(row.value)
    except (TypeError, json.JSONDecodeError):
        return user, None
    if not isinstance(data, dict):
        return user, None
    if int(data.get('user_id', 0)) != user.id:
        return user, None
    exp_raw = data.get('expires')
    if exp_raw:
        try:
            exp = datetime.fromisoformat(str(exp_raw).replace('Z', '+00:00'))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > exp:
                return user, None
        except ValueError:
            return user, None
    return user, data


def verify_reset_code(identifier: str, code: str):
    user = find_user_by_identifier(identifier)
    if not user:
        return False, 'password_reset_invalid'
    _, data = _load_pending(user.username)
    if not data:
        return False, 'password_reset_expired'
    submitted = re.sub(r'\D', '', str(code or ''))
    if submitted != str(data.get('code', '')):
        return False, 'password_reset_invalid'
    return True, None


def complete_reset(identifier: str, code: str, new_password: str):
    from homy.admin_settings import validate_password
    from werkzeug.security import generate_password_hash

    user = find_user_by_identifier(identifier)
    if not user:
        return False, 'password_reset_invalid'

    ok, err_key = verify_reset_code(identifier, code)
    if not ok:
        return False, err_key

    pwd_err = validate_password(new_password)
    if pwd_err:
        return False, 'password_reset_weak'

    user.password_hash = generate_password_hash(new_password)
    row = Setting.query.filter_by(key=_reset_key(user.username)).first()
    if row:
        db.session.delete(row)
    db.session.commit()
    return True, None
