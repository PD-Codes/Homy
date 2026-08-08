"""Global admin settings stored in the settings table."""

import ipaddress
import json
import re

from homy.database import db, Setting

# --- Keys ---
REGISTRATION_ENABLED = 'registration_enabled'
MAINTENANCE_MODE = 'maintenance_mode'
LAYOUT_LOCKED = 'global_layout_locked'
SITE_TITLE = 'site_title'
SITE_LOGO_URL = 'site_logo_url'
UPLOAD_MAX_AVATAR_MB = 'upload_max_avatar_mb'
UPLOAD_MAX_ICON_MB = 'upload_max_icon_mb'
UPLOAD_MAX_BACKGROUND_MB = 'upload_max_background_mb'
UPLOAD_MAX_PACKAGE_MB = 'upload_max_package_mb'
DEFAULT_LOCALE = 'default_locale'
LICENSE_TEXT = 'license_text'
AUDIT_LOG_LIMIT = 'audit_log_limit'
DEFAULT_THEME = 'default_theme'
SESSION_COOKIE_DAYS = 'session_cookie_days'
DEFAULT_WIDGET_REFRESH = 'default_widget_refresh'
GLOBAL_WEATHER_KEY = 'global_weather_key'
DEFAULT_USER_ROLE = 'default_user_role'
PASSWORD_MIN_LENGTH = 'password_min_length'
PASSWORD_REQUIRE_UPPER = 'password_require_upper'
AUTH_LDAP_ENABLED = 'auth_ldap_enabled'
AUTH_OIDC_ENABLED = 'auth_oidc_enabled'
AUTH_SAML_ENABLED = 'auth_saml_enabled'
AUTH_MFA_REQUIRED = 'auth_mfa_required'
AUTH_LDAP_CONFIG = 'auth_ldap_config'
AUTH_OIDC_CONFIG = 'auth_oidc_config'
AUTH_SAML_CONFIG = 'auth_saml_config'
CUSTOM_DNS_SERVERS = 'custom_dns_servers'
SMTP_HOST = 'smtp_host'
SMTP_PORT = 'smtp_port'
SMTP_USER = 'smtp_user'
SMTP_PASSWORD = 'smtp_password'
SMTP_FROM = 'smtp_from'
SMTP_TLS = 'smtp_tls'
SECURITY_IP_WHITELIST = 'security_ip_whitelist'
SECURITY_TRUSTED_PROXIES = 'security_trusted_proxies'
SECURITY_CSP = 'security_csp'
SECURITY_CORS_ORIGINS = 'security_cors_origins'

SECRET_KEYS = {GLOBAL_WEATHER_KEY, SMTP_PASSWORD}

DEFAULTS = {
    REGISTRATION_ENABLED: 'false',
    MAINTENANCE_MODE: 'false',
    SITE_TITLE: 'Homy',
    SITE_LOGO_URL: '',
    DEFAULT_LOCALE: 'de-DE',
    LICENSE_TEXT: 'MIT — siehe Projekt-README',
    AUDIT_LOG_LIMIT: '200',
    SESSION_COOKIE_DAYS: '7',
    DEFAULT_WIDGET_REFRESH: '30',
    DEFAULT_THEME: 'dark',
    DEFAULT_USER_ROLE: 'user',
    PASSWORD_MIN_LENGTH: '8',
    PASSWORD_REQUIRE_UPPER: 'false',
    AUTH_LDAP_ENABLED: 'false',
    AUTH_OIDC_ENABLED: 'false',
    AUTH_SAML_ENABLED: 'false',
    AUTH_MFA_REQUIRED: 'false',
    AUTH_LDAP_CONFIG: '{}',
    AUTH_OIDC_CONFIG: '{}',
    AUTH_SAML_CONFIG: '{}',
    CUSTOM_DNS_SERVERS: '',
    SMTP_HOST: '',
    SMTP_PORT: '587',
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    SMTP_FROM: '',
    SMTP_TLS: 'true',
    SECURITY_IP_WHITELIST: '',
    SECURITY_TRUSTED_PROXIES: '',
    SECURITY_CSP: '',
    SECURITY_CORS_ORIGINS: '',
    UPLOAD_MAX_AVATAR_MB: '4',
    UPLOAD_MAX_ICON_MB: '2',
    UPLOAD_MAX_BACKGROUND_MB: '8',
    UPLOAD_MAX_PACKAGE_MB: '15',
}


def get_upload_limits():
    """Max upload sizes in bytes (from admin settings)."""
    def _mb(key, default_mb):
        raw = str(default_mb)
        try:
            from flask import has_app_context
            if has_app_context():
                raw = get_setting_raw(key, str(default_mb))
        except Exception:
            pass
        try:
            return max(1, int(float(raw))) * 1024 * 1024
        except (TypeError, ValueError):
            return default_mb * 1024 * 1024

    return {
        'avatar': _mb(UPLOAD_MAX_AVATAR_MB, 4),
        'icon': _mb(UPLOAD_MAX_ICON_MB, 2),
        'background': _mb(UPLOAD_MAX_BACKGROUND_MB, 8),
        'package': _mb(UPLOAD_MAX_PACKAGE_MB, 15),
    }

# Settings exposed per admin UI tab (group id -> keys)
ADMIN_GROUPS = {
    'system': [
        SITE_TITLE, SITE_LOGO_URL, DEFAULT_LOCALE, MAINTENANCE_MODE, LICENSE_TEXT,
        DEFAULT_THEME, DEFAULT_WIDGET_REFRESH, AUDIT_LOG_LIMIT,
        UPLOAD_MAX_AVATAR_MB, UPLOAD_MAX_ICON_MB, UPLOAD_MAX_BACKGROUND_MB, UPLOAD_MAX_PACKAGE_MB,
    ],
    'users': [DEFAULT_USER_ROLE, REGISTRATION_ENABLED],
    'auth': [
        SESSION_COOKIE_DAYS, PASSWORD_MIN_LENGTH, PASSWORD_REQUIRE_UPPER,
        AUTH_LDAP_ENABLED, AUTH_OIDC_ENABLED, AUTH_SAML_ENABLED, AUTH_MFA_REQUIRED,
        AUTH_LDAP_CONFIG, AUTH_OIDC_CONFIG, AUTH_SAML_CONFIG,
    ],
    'api': [GLOBAL_WEATHER_KEY, CUSTOM_DNS_SERVERS],
    'notify': [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_TLS],
    'security': [
        SECURITY_IP_WHITELIST, SECURITY_TRUSTED_PROXIES, SECURITY_CSP, SECURITY_CORS_ORIGINS,
        LAYOUT_LOCKED,
    ],
}


def _parse_bool(value, default=False):
    if value is None:
        return default
    return str(value).strip().lower() in ('1', 'true', 'yes', 'on', 'ja')


def get_setting_raw(key, default=None):
    try:
        from flask import g, has_request_context
        if has_request_context():
            cache = g.get('_settings_cache')
            if cache is None:
                g._settings_cache = {}
                cache = g._settings_cache
            if key in cache:
                val = cache[key]
                return default if val is None else val
            row = Setting.query.filter_by(key=key).first()
            val = row.value if (row is not None and row.value is not None) else None
            cache[key] = val
            return default if val is None else val
    except Exception:
        pass
    row = Setting.query.filter_by(key=key).first()
    if row is None or row.value is None:
        return default
    return row.value


def get_setting_bool(key, default=False):
    raw = get_setting_raw(key, 'true' if default else 'false')
    return _parse_bool(raw, default)


def get_setting_int(key, default, min_val=None, max_val=None):
    try:
        value = int(str(get_setting_raw(key, default)).strip())
    except (TypeError, ValueError):
        value = default
    if min_val is not None:
        value = max(min_val, value)
    if max_val is not None:
        value = min(max_val, value)
    return value


def set_setting(key, value):
    from homy.database import db

    setting = db.session.get(Setting, key)
    text = str(value) if value is not None else ''
    if setting:
        setting.value = text
    else:
        db.session.add(Setting(key=key, value=text))

    try:
        from flask import g, has_request_context
        if has_request_context() and hasattr(g, '_settings_cache'):
            g._settings_cache.pop(key, None)
    except Exception:
        pass


def ensure_default_settings():
    from homy.database import db

    added = False
    for key, value in DEFAULTS.items():
        if not Setting.query.filter_by(key=key).first():
            db.session.add(Setting(key=key, value=value))
            added = True
    if added:
        db.session.commit()


def mask_setting_value(key, value):
    if key in SECRET_KEYS and value:
        return '********'
    return value


def settings_dict_for_admin():
    """All admin-managed settings for GET /api/admin/config."""
    out = {}
    all_keys = set(DEFAULTS.keys())
    for keys in ADMIN_GROUPS.values():
        all_keys.update(keys)
    for key in sorted(all_keys):
        raw = get_setting_raw(key, DEFAULTS.get(key, ''))
        out[key] = mask_setting_value(key, raw)
    return out


def save_admin_settings(data, skip_masked=True):
    """Persist settings from admin POST body. Returns list of changed keys."""
    from homy.database import db

    changed = []
    allowed = set(DEFAULTS.keys())
    for keys in ADMIN_GROUPS.values():
        allowed.update(keys)

    for key, value in (data or {}).items():
        if key not in allowed:
            continue
        if key == LICENSE_TEXT:
            continue
        if skip_masked and key in SECRET_KEYS and (not value or value == '********'):
            continue
        set_setting(key, value)
        changed.append(key)
    db.session.commit()
    return changed


def validate_password(password):
    """Return error message or None if valid."""
    if not password or not str(password).strip():
        return 'Passwort ist erforderlich.'
    pwd = str(password).strip()
    min_len = get_setting_int(PASSWORD_MIN_LENGTH, 8, 4, 128)
    if len(pwd) < min_len:
        return f'Passwort muss mindestens {min_len} Zeichen lang sein.'
    if get_setting_bool(PASSWORD_REQUIRE_UPPER, False) and not re.search(r'[A-Z]', pwd):
        return 'Passwort muss mindestens einen Großbuchstaben enthalten.'
    return None


def client_ip():
    from flask import request

    proxies = get_setting_raw(SECURITY_TRUSTED_PROXIES, '') or ''
    trusted = {p.strip() for p in proxies.split(',') if p.strip()}
    if trusted and request.remote_addr in trusted:
        forwarded = request.headers.get('X-Forwarded-For', '')
        if forwarded:
            return forwarded.split(',')[0].strip()
    return request.remote_addr or ''


def ip_allowed():
    whitelist = get_setting_raw(SECURITY_IP_WHITELIST, '') or ''
    if not whitelist.strip():
        return True
    entries = [x.strip() for x in whitelist.split(',') if x.strip()]
    ip = client_ip()
    if ip in entries:
        return True

    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False

    for entry in entries:
        try:
            # strict=False so "10.0.0.1/8" is accepted like a plain network entry
            network = ipaddress.ip_network(entry, strict=False)
        except ValueError:
            continue
        if addr.version == network.version and addr in network:
            return True
    return False


def resolve_site_logo_url():
    """External URL setting, or uploaded branding logo if present."""
    from homy.asset_service import branding_logo_url

    uploaded = branding_logo_url()
    if uploaded:
        return uploaded
    return get_setting_raw(SITE_LOGO_URL, '') or ''


def auth_policy():
    return {
        'registration_enabled': get_setting_bool(REGISTRATION_ENABLED, False),
        'maintenance_mode': get_setting_bool(MAINTENANCE_MODE, False),
        'site_title': get_setting_raw(SITE_TITLE, DEFAULTS[SITE_TITLE]) or DEFAULTS[SITE_TITLE],
        'default_locale': get_setting_raw(DEFAULT_LOCALE, DEFAULTS[DEFAULT_LOCALE]),
        'site_logo_url': resolve_site_logo_url(),
        'auth_ldap_enabled': get_setting_bool(AUTH_LDAP_ENABLED, False),
        'auth_oidc_enabled': get_setting_bool(AUTH_OIDC_ENABLED, False),
        'auth_saml_enabled': get_setting_bool(AUTH_SAML_ENABLED, False),
        'auth_mfa_required': get_setting_bool(AUTH_MFA_REQUIRED, False),
    }


def user_preferences_key(user_id):
    return f'user_prefs_{user_id}'


def get_user_preferences(user_id):
    raw = get_setting_raw(user_preferences_key(user_id), '{}')
    try:
        data = json.loads(raw) if raw else {}
        return data if isinstance(data, dict) else {}
    except (TypeError, json.JSONDecodeError):
        return {}


def save_user_preferences(user_id, data):
    from homy.database import db

    if not isinstance(data, dict):
        data = {}
    current = get_user_preferences(user_id)
    current.update(data)
    if 'custom_theme' in current and isinstance(current['custom_theme'], dict):
        theme = current['custom_theme']
        allowed = (
            'bg_base', 'bg_surface', 'bg_card', 'text_primary', 'text_secondary',
            'text_muted', 'primary', 'border_color', 'success', 'danger',
        )
        current['custom_theme'] = {k: str(v) for k, v in theme.items() if k in allowed and v}
    set_setting(user_preferences_key(user_id), json.dumps(current))
    db.session.commit()
    return current


def user_notifications_key(user_id):
    return f'user_notify_{user_id}'


def get_user_notifications(user_id):
    raw = get_setting_raw(user_notifications_key(user_id), '{}')
    try:
        data = json.loads(raw) if raw else {}
        return data if isinstance(data, dict) else {}
    except (TypeError, json.JSONDecodeError):
        return {}


def save_user_notifications(user_id, data):
    from homy.database import db

    if not isinstance(data, dict):
        data = {}
    allowed_channels = (
        'smtp', 'discord', 'teams', 'telegram', 'ntfy', 'pushover',
    )
    cleaned = {}
    for ch in allowed_channels:
        if ch not in data:
            continue
        val = data[ch]
        if isinstance(val, dict):
            cleaned[ch] = {k: str(v) for k, v in val.items() if v is not None}
        elif val:
            cleaned[ch] = {'enabled': True, 'url': str(val)}
    set_setting(user_notifications_key(user_id), json.dumps(cleaned))
    db.session.commit()
    return cleaned


def system_info():
    import sys
    from importlib.metadata import version, PackageNotFoundError

    try:
        pkg_version = version('homy')
    except PackageNotFoundError:
        pkg_version = 'dev'

    from homy.database import db, User, WidgetInstance, Integration, AuditLog
    from homy.cache import widget_cache

    return {
        'version': pkg_version,
        'python': sys.version.split()[0],
        'license': get_setting_raw(LICENSE_TEXT, DEFAULTS[LICENSE_TEXT]),
        'database': 'sqlite',
        'counts': {
            'users': User.query.count(),
            'widgets': WidgetInstance.query.count(),
            'integrations': Integration.query.count(),
            'audit_logs': AuditLog.query.count(),
        },
        'cache': widget_cache.stats(),
        'features': {
            'ldap': get_setting_bool(AUTH_LDAP_ENABLED, False),
            'oidc': get_setting_bool(AUTH_OIDC_ENABLED, False),
            'saml': get_setting_bool(AUTH_SAML_ENABLED, False),
            'mfa': get_setting_bool(AUTH_MFA_REQUIRED, False),
        },
    }
