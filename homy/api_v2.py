"""Homy API v2 — one clean surface for the new web app and the browser add-on.

* ``GET  /api/v2/catalog``    every widget type with a normalized config schema
* ``GET  /api/v2/bootstrap``  everything a dashboard needs in one request
* ``PUT  /api/v2/layout``     save tabs + widget positions atomically
* ``/api/v2/tokens``          personal access tokens (add-on, scripts)
* ``GET  /embed/widget/<id>`` a single widget as a frameable page (add-on iframes)

Bearer tokens (``Authorization: Bearer homy_pat_...``) authenticate a request
without ever setting a cookie, so every existing ``login_required`` route works
for the add-on too.
"""
import hashlib
import json
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from flask import Blueprint, current_app, g, jsonify, request, send_from_directory, session
from flask.sessions import SecureCookieSessionInterface

from homy.auth import login_required
from homy.database import ApiToken, FavoriteLink, Setting, User, WidgetInstance, db
from homy.layout_service import (
    check_layout_lock, is_layout_locked, layout_context, log_activity, widgets_query,
)

logger = logging.getLogger(__name__)

bp = Blueprint('api_v2', __name__)

TOKEN_PREFIX = 'homy_pat_'
MASK = '********'
VAULT_MARKER = '__VAULT_SECRET__'
YES_NO = {'Ja', 'Nein'}
APP_DIST = os.path.join(os.path.dirname(__file__), 'static', 'app')

_module_manager = None


# --------------------------------------------------------------------------- tokens

def hash_token(raw):
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TokenAwareSessionInterface(SecureCookieSessionInterface):
    """Never write a session cookie for token-authenticated requests."""

    def should_set_cookie(self, app, sess):
        if g.get('homy_token_auth'):
            return False
        return super().should_set_cookie(app, sess)

    def save_session(self, app, sess, response):
        if g.get('homy_token_auth'):
            return None
        return super().save_session(app, sess, response)


def authenticate_bearer():
    header = request.headers.get('Authorization', '')
    if not header.startswith('Bearer '):
        return None
    raw = header[7:].strip()
    if not raw.startswith(TOKEN_PREFIX):
        return None
    token = ApiToken.query.filter_by(token_hash=hash_token(raw)).first()
    now = _utcnow()
    if not token or (token.expires_at and token.expires_at < now):
        return jsonify({'error': 'Unauthorized', 'message': 'Invalid or expired token'}), 401
    user = db.session.get(User, token.user_id)
    if not user or getattr(user, 'is_locked', False):
        return jsonify({'error': 'Unauthorized', 'message': 'Account unavailable'}), 401

    g.homy_token_auth = True
    g.homy_token_id = token.id
    session.clear()
    session['user_id'] = user.id
    session['username'] = user.username
    session['role'] = user.role

    # Touch last_used at most once a minute to keep writes cheap.
    if not token.last_used_at or now - token.last_used_at > timedelta(minutes=1):
        token.last_used_at = now
        try:
            db.session.commit()
        except Exception:  # pragma: no cover - never fail a request over bookkeeping
            db.session.rollback()
    return None


@bp.route('/api/v2/tokens', methods=['GET'])
@login_required
def list_tokens():
    tokens = ApiToken.query.filter_by(user_id=session['user_id']).order_by(ApiToken.created_at.desc()).all()
    return jsonify([t.to_dict() for t in tokens])


@bp.route('/api/v2/tokens', methods=['POST'])
@login_required
def create_token():
    if g.get('homy_token_auth'):
        return jsonify({'error': 'Forbidden', 'message': 'Tokens cannot mint tokens'}), 403
    data = request.get_json(silent=True) or {}
    name = str(data.get('name') or 'Browser-Add-on').strip()[:100] or 'Token'
    days = data.get('expires_days')
    expires_at = None
    if days not in (None, '', 0, '0'):
        try:
            expires_at = _utcnow() + timedelta(days=max(1, min(int(days), 3650)))
        except (TypeError, ValueError):
            return jsonify({'error': 'Bad Request', 'message': 'expires_days must be a number'}), 400
    raw = TOKEN_PREFIX + secrets.token_urlsafe(32)
    token = ApiToken(
        user_id=session['user_id'], name=name, token_hash=hash_token(raw),
        prefix=raw[:len(TOKEN_PREFIX) + 4], expires_at=expires_at,
    )
    db.session.add(token)
    log_activity('token_create', f"API-Token '{name}' erstellt.", commit=False)
    db.session.commit()
    return jsonify({'token': raw, **token.to_dict()}), 201


@bp.route('/api/v2/tokens/<int:token_id>', methods=['DELETE'])
@login_required
def delete_token(token_id):
    token = db.session.get(ApiToken, token_id)
    if not token or token.user_id != session['user_id']:
        return jsonify({'error': 'Not Found'}), 404
    db.session.delete(token)
    log_activity('token_delete', f"API-Token '{token.name}' widerrufen.", commit=False)
    db.session.commit()
    return jsonify({'success': True})


# --------------------------------------------------------------------------- tab backgrounds

def clean_background(bg):
    """Validate a tab background object; anything unexpected is dropped."""
    if not isinstance(bg, dict):
        return None
    kind = bg.get('type')
    if kind not in ('none', 'asset', 'url'):
        return None
    out = {'type': kind}
    if kind == 'asset':
        try:
            out['asset_id'] = int(bg.get('asset_id'))
        except (TypeError, ValueError):
            return None
    if kind == 'url':
        url = str(bg.get('url') or '').strip()
        if not url.lower().startswith(('http://', 'https://')) or len(url) > 1000:
            return None
        out['url'] = url
    try:
        out['opacity'] = max(0, min(100, int(bg.get('opacity', 100))))
    except (TypeError, ValueError):
        out['opacity'] = 100
    if bg.get('size') in ('cover', 'contain', 'auto'):
        out['size'] = bg['size']
    if bg.get('position') in ('center', 'top', 'bottom'):
        out['position'] = bg['position']
    if 'fixed' in bg:
        out['fixed'] = bool(bg['fixed'])
    return out


# --------------------------------------------------------------------------- catalog

def normalize_field(key, field):
    ftype = field.get('type', 'text')
    out = {'key': key, 'type': ftype, 'label': field.get('label', key), 'default': field.get('default')}
    options = field.get('options')
    if ftype == 'select' and options and {str(o) for o in options} <= YES_NO:
        # Legacy widgets store "Ja"/"Nein"; the UI shows a switch but keeps the values.
        out.update(type='toggle', on='Ja', off='Nein')
    elif options:
        out['options'] = [
            o if isinstance(o, dict) else {'value': o, 'label': str(o)} for o in options
        ]
    for extra in ('help', 'placeholder', 'min', 'max', 'step', 'rows'):
        if extra in field:
            out[extra] = field[extra]
    if key == 'integration_id':
        out['type'] = 'integration'
    return out


def catalog_entry(wdef):
    schema = wdef.get('config_schema') or {}
    assets = {}
    module = wdef.get('module')
    if wdef.get('widget_source') == 'integration':
        if wdef.get('js_file'):
            assets['js'] = wdef['js_file']
        if wdef.get('css_file'):
            assets['css'] = wdef['css_file']
    elif module:
        assets['js'] = f'/modules/{module}/{module}.js'
        assets['css'] = f'/modules/{module}/{module}.css'
    return {
        'type': wdef['type'],
        'module': module,
        'name': wdef.get('name', wdef['type']),
        'icon': wdef.get('icon', 'box'),
        'source': wdef.get('widget_source', 'module'),
        'role': wdef.get('widget_role', 'display'),
        'integration_types': wdef.get('integration_types', []),
        'size': {'w': wdef.get('default_size_x', 3), 'h': wdef.get('default_size_y', 2)},
        'refresh': wdef.get('default_refresh_interval', 0),
        'schema': [normalize_field(k, v) for k, v in schema.items()],
        'assets': assets,
    }


def _catalog():
    from homy.module_manager import _get_disabled_module_ids

    disabled = set(_get_disabled_module_ids())
    entries = []
    for wdef in _module_manager.widgets_registry.values():
        if wdef.get('widget_source') != 'integration' and wdef.get('module') in disabled:
            continue
        entries.append(catalog_entry(wdef))
    entries.sort(key=lambda e: (e['source'] != 'module', e['name'].lower()))
    return entries


@bp.route('/api/v2/catalog', methods=['GET'])
@login_required
def get_catalog():
    return jsonify(_catalog())


# --------------------------------------------------------------------------- widgets

def _password_fields(widget_type):
    wdef = _module_manager.widgets_registry.get(widget_type) if _module_manager else None
    schema = (wdef or {}).get('config_schema') or {}
    return {k for k, v in schema.items() if v.get('type') == 'password'}


def public_widget_dict(widget):
    """Widget as sent to clients: vault secrets are masked, never resolved."""
    try:
        config = json.loads(widget.config_json or '{}')
    except (TypeError, ValueError):
        config = {}
    secret_keys = _password_fields(widget.type)
    for key, value in list(config.items()):
        if value == VAULT_MARKER or (key in secret_keys and value):
            config[key] = MASK
    return {
        'id': widget.id,
        'module': widget.module,
        'type': widget.type,
        'title': widget.title,
        'col': widget.col,
        'row': widget.row,
        'w': widget.size_x,
        'h': widget.size_y,
        'tab_id': widget.tab_id or 'default',
        'config': config,
        'owner': 'public' if widget.user_id is None else 'user',
    }


def _load_tabs(key):
    setting = db.session.get(Setting, key)
    if setting and setting.value:
        try:
            tabs = json.loads(setting.value)
            if isinstance(tabs, list) and tabs:
                return tabs
        except (TypeError, ValueError):
            logger.warning("Corrupt tabs JSON for '%s'", key)
    return [{'id': 'default', 'name': 'Main'}]


@bp.route('/api/v2/bootstrap', methods=['GET'])
@login_required
def bootstrap():
    from homy.admin_settings import get_user_preferences

    layout = request.args.get('layout', 'desktop')
    if layout not in ('desktop', 'mobile', 'public'):
        layout = 'desktop'
    tabs_key, owner_id, dashboard_layout = layout_context('auto' if layout == 'desktop' else layout)
    widgets = widgets_query(owner_id, dashboard_layout).all()
    favorites = FavoriteLink.query.filter_by(user_id=owner_id).order_by(FavoriteLink.order).all()
    user = db.session.get(User, session['user_id'])
    return jsonify({
        'api': 2,
        'server_time': datetime.now(timezone.utc).isoformat(),
        'user': user.to_dict() if user else None,
        'preferences': get_user_preferences(session['user_id']),
        'layout': {
            'key': layout,
            'locked': bool(is_layout_locked()) and session.get('role') != 'admin',
            'tabs': _load_tabs(tabs_key),
            'widgets': [public_widget_dict(w) for w in widgets],
        },
        'favorites': [f.to_dict() for f in favorites],
        'catalog': _catalog(),
    })


@bp.route('/api/v2/layout', methods=['PUT'])
@login_required
def save_layout():
    if check_layout_lock():
        return jsonify({'error': 'Forbidden', 'message': 'Das Layout ist vom Administrator gesperrt.'}), 403
    data = request.get_json(silent=True) or {}
    layout = data.get('layout', 'desktop')
    tabs_key, owner_id, _ = layout_context('auto' if layout == 'desktop' else layout)
    is_admin = session.get('role') == 'admin'

    tabs = data.get('tabs')
    if tabs is not None:
        if not isinstance(tabs, list) or not all(isinstance(t, dict) and t.get('id') for t in tabs):
            return jsonify({'error': 'Bad Request', 'message': 'tabs must be a list of {id, name}'}), 400
        clean = []
        for t in tabs[:50]:
            row = {k: str(t[k])[:80] for k in ('id', 'name', 'icon') if k in t}
            bg = clean_background(t.get('background'))
            if bg:
                row['background'] = bg
            clean.append(row)
        setting = db.session.get(Setting, tabs_key)
        if setting:
            setting.value = json.dumps(clean)
        else:
            db.session.add(Setting(key=tabs_key, value=json.dumps(clean)))

    for pos in data.get('positions') or []:
        widget = db.session.get(WidgetInstance, str(pos.get('id', '')))
        if not widget:
            continue
        if widget.user_id is None and not is_admin:
            continue
        if widget.user_id is not None and widget.user_id != session['user_id'] and not is_admin:
            continue
        try:
            widget.col = max(0, min(int(pos.get('col', widget.col)), 23))
            widget.row = max(0, int(pos.get('row', widget.row)))
            widget.size_x = max(1, min(int(pos.get('w', widget.size_x)), 24))
            widget.size_y = max(1, min(int(pos.get('h', widget.size_y)), 40))
        except (TypeError, ValueError):
            return jsonify({'error': 'Bad Request', 'message': 'invalid position'}), 400
        if pos.get('tab_id'):
            widget.tab_id = str(pos['tab_id'])[:50]

    log_activity('layout_save', 'Layout gespeichert (v2).', commit=False)
    db.session.commit()
    return jsonify({'success': True})


@bp.route('/api/v2/widgets/<widget_id>', methods=['GET'])
@login_required
def get_widget(widget_id):
    """One widget (masked) plus its catalog entry, for embed pages."""
    widget = db.session.get(WidgetInstance, widget_id)
    if not widget:
        return jsonify({'error': 'Not Found'}), 404
    if widget.user_id is not None and widget.user_id != session['user_id'] and session.get('role') != 'admin':
        return jsonify({'error': 'Forbidden'}), 403
    wdef = _module_manager.widgets_registry.get(widget.type)
    return jsonify({
        'widget': public_widget_dict(widget),
        'entry': catalog_entry(wdef) if wdef else None,
    })


# --------------------------------------------------------------------------- guests

#: Widget types that render without any server data (safe for anonymous visitors).
GUEST_TYPES = {'clock', 'search_bar', 'quick_weather', 'note', 'countdown', 'spacer', 'favorites'}


@bp.route('/api/v2/public', methods=['GET'])
def public_board():
    """Start page for visitors who are not signed in (admin setting guest_dashboard_enabled)."""
    from homy.admin_settings import GUEST_DASHBOARD_ENABLED, auth_policy, get_setting_bool

    policy = auth_policy()
    if not get_setting_bool(GUEST_DASHBOARD_ENABLED, False):
        return jsonify({'enabled': False, 'site_title': policy.get('site_title')})
    widgets = [
        public_widget_dict(w) for w in widgets_query(None, 'desktop').all()
        if w.type in GUEST_TYPES
    ]
    favorites = FavoriteLink.query.filter_by(user_id=None, is_private=False).order_by(FavoriteLink.order).all()
    return jsonify({
        'enabled': True,
        'site_title': policy.get('site_title'),
        'tabs': _load_tabs('tabs_public'),
        'widgets': widgets,
        'favorites': [f.to_dict() for f in favorites],
    })


# --------------------------------------------------------------------------- embed

@bp.route('/embed/widget/<widget_id>', methods=['GET'])
def embed_widget(widget_id):
    """Static shell; the page authenticates its API calls with the token in the URL fragment."""
    index = os.path.join(APP_DIST, 'embed.html')
    if not os.path.exists(index):
        return 'Homy web app not built (frontend/: npm run build)', 503
    resp = send_from_directory(APP_DIST, 'embed.html', max_age=0)
    resp.headers['X-Homy-Embed'] = '1'
    return resp


def init_api_v2(app, module_manager):
    global _module_manager
    _module_manager = module_manager
    app.session_interface = TokenAwareSessionInterface()
    # Run token auth before every other hook (IP allow-list, session renewal, ...).
    app.before_request_funcs.setdefault(None, []).insert(0, authenticate_bearer)
    app.register_blueprint(bp)
    return bp
