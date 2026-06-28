"""Apply CSP and CORS from admin settings."""

from flask import request

from homy.admin_settings import (
    SECURITY_CSP,
    SECURITY_CORS_ORIGINS,
    get_setting_raw,
)


def apply_security_headers(response):
    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    response.headers.setdefault('X-Frame-Options', 'SAMEORIGIN')
    response.headers.setdefault('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.setdefault('X-XSS-Protection', '1; mode=block')

    csp = (get_setting_raw(SECURITY_CSP, '') or '').strip()
    if csp:
        response.headers['Content-Security-Policy'] = csp

    origins_raw = (get_setting_raw(SECURITY_CORS_ORIGINS, '') or '').strip()
    if not origins_raw:
        return response

    allowed = {o.strip() for o in origins_raw.split(',') if o.strip()}
    origin = request.headers.get('Origin')
    extension_origin = origin and (
        origin.startswith('moz-extension://')
        or origin.startswith('chrome-extension://')
        or origin.startswith('extension://')
    )
    if origin and (origin in allowed or '*' in allowed or extension_origin):
        response.headers['Access-Control-Allow-Origin'] = origin if (origin in allowed or extension_origin) else '*'
        response.headers['Vary'] = 'Origin'
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response


def handle_cors_preflight():
    if request.method != 'OPTIONS':
        return None
    path = request.path or ''
    if not path.startswith('/api'):
        return None
    from flask import make_response
    resp = make_response('', 204)
    return apply_security_headers(resp)
