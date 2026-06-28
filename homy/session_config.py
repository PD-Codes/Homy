"""Session cookie lifetime (admin-configurable) with sliding renewal on each request."""

from datetime import timedelta

from flask import session

from homy.database import Setting

SETTING_KEY = 'session_cookie_days'
DEFAULT_SESSION_DAYS = 7
MIN_SESSION_DAYS = 1
MAX_SESSION_DAYS = 365


def clamp_session_days(days):
    """Clamp configured days to a safe range (1–365)."""
    try:
        value = int(days)
    except (TypeError, ValueError):
        value = DEFAULT_SESSION_DAYS
    return max(MIN_SESSION_DAYS, min(MAX_SESSION_DAYS, value))


def get_session_lifetime_days():
    """Read session lifetime in days from settings (clamped)."""
    try:
        row = Setting.query.filter_by(key=SETTING_KEY).first()
        if row and str(row.value).strip():
            days = int(str(row.value).strip())
        else:
            days = DEFAULT_SESSION_DAYS
    except (TypeError, ValueError):
        days = DEFAULT_SESSION_DAYS
    return clamp_session_days(days)


def get_session_timedelta():
    return timedelta(days=get_session_lifetime_days())


def apply_session_for_user(app):
    """Mark session permanent and use configured max-age (call after login)."""
    session.permanent = True
    session.modified = True
    app.permanent_session_lifetime = get_session_timedelta()


def init_session_config(app):
    """Register hooks for persistent, sliding session cookies."""
    app.config.setdefault('PERMANENT_SESSION_LIFETIME', timedelta(days=DEFAULT_SESSION_DAYS))
    app.config.setdefault('SESSION_COOKIE_HTTPONLY', True)
    app.config.setdefault('SESSION_COOKIE_SAMESITE', 'Lax')

    @app.before_request
    def _renew_session_cookie():
        if 'user_id' not in session:
            return None
        session.permanent = True
        app.permanent_session_lifetime = get_session_timedelta()
        session.modified = True
        return None
