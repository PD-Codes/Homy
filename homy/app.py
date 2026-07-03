import os
import uuid
import logging
import json
from flask import Flask, render_template, jsonify, request, session, send_from_directory
from homy.database import (
    db, init_db, User, WidgetInstance, FavoriteLink, Setting, AuditLog,
    Integration, UserAsset, PackageUpload, Group, UserGroup, BackgroundJob,
)
from homy.auth import check_login, logout, register, login_required, admin_required
from homy.module_manager import ModuleManager
from homy.integration_manager import init_integration_manager
from homy.session_config import apply_session_for_user, init_session_config

# Setup Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
_INSECURE_DEFAULTS = {'homy_secret_dev_key_12345', 'change_me_to_something_secure', ''}
_raw_secret = os.environ.get('SECRET_KEY', '')
if _raw_secret in _INSECURE_DEFAULTS:
    import secrets as _secrets
    _raw_secret = _secrets.token_hex(32)
    logger.warning(
        'SECRET_KEY not set or using default — generated an ephemeral key. '
        'Set the SECRET_KEY environment variable to keep sessions across restarts.'
    )
app.secret_key = _raw_secret

# Initialize DB
init_db(app)

# Initialize Module Manager
module_manager = ModuleManager(app)

# Initialize Integration Manager
integration_manager = init_integration_manager(app, module_manager=module_manager)

init_session_config(app)

with app.app_context():
    from homy.auth_oidc import init_oidc
    init_oidc(app)
    from homy.scheduler_service import init_scheduler
    init_scheduler(app)


@app.before_request
def handle_preflight():
    from homy.security_headers import handle_cors_preflight
    return handle_cors_preflight()


@app.teardown_request
def _teardown_ssl_context(exc):
    from flask import g
    from homy.integration_ssl import reset_ssl_context
    for token in reversed(getattr(g, '_ssl_ctx_tokens', [])):
        try:
            reset_ssl_context(token)
        except Exception as exc:
            logger.warning('Failed to reset SSL context: %s', exc)


@app.errorhandler(Exception)
def _handle_unhandled_exception(exc):
    import traceback
    logger.error('Unhandled exception on %s %s: %s\n%s',
                 request.method, request.path, exc, traceback.format_exc())
    if (request.path or '').startswith('/api'):
        return jsonify({'error': 'Internal Server Error',
                        'message': 'An unexpected error occurred'}), 500
    return jsonify({'error': 'Internal Server Error'}), 500


@app.after_request
def apply_response_hooks(response):
    from homy.security_headers import apply_security_headers
    from homy.api_metrics import record_api_call
    response = apply_security_headers(response)
    if request.path.startswith('/api'):
        record_api_call()
    return response


@app.before_request
def enforce_ip_whitelist():
    from homy.admin_settings import ip_allowed

    path = request.path or ''
    if not path.startswith('/api'):
        return None
    public_paths = (
        '/api/auth/status', '/api/auth/login', '/api/setup/init',
        '/api/auth/oidc/login', '/api/auth/oidc/callback',
        '/api/auth/saml/login', '/api/auth/saml/acs',
        '/api/auth/mfa/verify',
        '/api/auth/password-reset/request',
        '/api/auth/password-reset/confirm',
        '/api/branding/logo',
    )
    if path in public_paths:
        return None
    if not ip_allowed():
        return jsonify({
            'error': 'Forbidden',
            'message': 'Zugriff von dieser IP-Adresse ist nicht erlaubt.',
        }), 403
    return None


# Helper functions for layout lock and audit log
def log_activity(event_type, message):
    try:
        username = session.get('username')
        log_entry = AuditLog(username=username, event_type=event_type, message=message)
        db.session.add(log_entry)
        db.session.commit()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")

def is_layout_locked():
    setting = db.session.get(Setting, 'global_layout_locked')
    return setting and setting.value == 'true'

def check_layout_lock():
    if is_layout_locked() and session.get('role') != 'admin':
        return True
    return False


def layout_context(layout_type):
    """Resolve tabs setting key, widget owner user_id, and dashboard_layout filter."""
    if layout_type == 'public':
        return 'tabs_public', None, 'desktop'
    if layout_type == 'mobile':
        if 'user_id' in session:
            return f'tabs_mobile_user_{session["user_id"]}', session['user_id'], 'mobile'
        return 'tabs_public', None, 'mobile'
    if layout_type == 'guest' or 'user_id' not in session:
        return 'tabs_public', None, 'desktop'
    return f'tabs_user_{session["user_id"]}', session['user_id'], 'desktop'


def widgets_query(user_id, dashboard_layout):
    from sqlalchemy import or_

    q = WidgetInstance.query
    if dashboard_layout == 'desktop':
        q = q.filter(or_(
            WidgetInstance.dashboard_layout == 'desktop',
            WidgetInstance.dashboard_layout.is_(None),
            WidgetInstance.dashboard_layout == '',
        ))
    else:
        q = q.filter_by(dashboard_layout=dashboard_layout)
    if user_id is None:
        return q.filter_by(user_id=None)
    return q.filter_by(user_id=user_id)



# --- Core Web Page Routing ---

@app.route('/')
def index():
    return render_template('index.html')


# --- Auth API ---

@app.route('/api/auth/status', methods=['GET'])
def auth_status():
    from homy.admin_settings import auth_policy

    needs_setup = User.query.count() == 0
    policy = auth_policy()
    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        user_payload = user.to_dict() if user else {
            'id': session['user_id'],
            'username': session['username'],
            'role': session['role'],
        }
        return jsonify({
            'logged_in': True,
            'needs_setup': needs_setup,
            'user': user_payload,
            **policy,
        })
    return jsonify({
        'logged_in': False,
        'needs_setup': needs_setup,
        'user': None,
        **policy,
     })

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Bad Request', 'message': 'Username and password required'}), 400

    from homy.auth import is_login_throttled, record_failed_login, clear_failed_logins

    client_ip = request.remote_addr or ''
    if is_login_throttled(username, client_ip):
        return jsonify({
            'error': 'Too Many Requests',
            'message': 'Too many failed login attempts. Please try again later.',
        }), 429

    from homy.admin_settings import get_setting_bool, MAINTENANCE_MODE

    if get_setting_bool(MAINTENANCE_MODE, False):
        user_probe = User.query.filter_by(username=username).first()
        if not user_probe or user_probe.role != 'admin':
            return jsonify({
                'error': 'Service Unavailable',
                'message': 'Wartungsmodus aktiv — nur Administratoren können sich anmelden.',
            }), 503

    from homy.auth import is_user_locked

    if is_user_locked(username):
        return jsonify({
            'error': 'Forbidden',
            'message': 'Dieses Konto ist gesperrt. Bitte einen Administrator kontaktieren.',
        }), 403

    from homy.auth_login_flow import authenticate_credentials, login_response_payload
    from homy.auth import establish_session

    user, auth_err = authenticate_credentials(username, password)
    if not user:
        record_failed_login(username, client_ip)
        msg = auth_err or 'Invalid username or password'
        return jsonify({'error': 'Unauthorized', 'message': msg}), 401

    clear_failed_logins(username, client_ip)
    payload = login_response_payload(user)
    if payload.get('mfa_required'):
        return jsonify(payload), 200

    establish_session(user)
    user_widgets_count = WidgetInstance.query.filter_by(
        user_id=user.id, dashboard_layout='desktop'
    ).count()
    if user_widgets_count == 0:
        public_widgets = WidgetInstance.query.filter_by(user_id=None, dashboard_layout='desktop').all()
        for pw in public_widgets:
            db.session.add(WidgetInstance(
                id=str(uuid.uuid4()),
                user_id=user.id,
                module=pw.module,
                type=pw.type,
                title=pw.title,
                col=pw.col,
                row=pw.row,
                size_x=pw.size_x,
                size_y=pw.size_y,
                config_json=pw.config_json,
                tab_id=pw.tab_id,
                dashboard_layout='desktop',
            ))
        user_favs_count = FavoriteLink.query.filter_by(user_id=user.id).count()
        if user_favs_count == 0:
            public_favs = FavoriteLink.query.filter_by(user_id=None).all()
            for pf in public_favs:
                db.session.add(FavoriteLink(
                    user_id=user.id,
                    title=pf.title,
                    url=pf.url,
                    icon_type=pf.icon_type,
                    icon_value=pf.icon_value,
                    category=pf.category,
                    order=pf.order
                ))
        db.session.commit()
        logger.info(f"Cloned public dashboard layout for new login user {user.username}")

    log_activity('login', f"Benutzer '{user.username}' hat sich angemeldet.")
    return jsonify({
        'success': True,
        'user': user.to_dict(),
    })


@app.route('/api/auth/mfa/verify', methods=['POST'])
def auth_mfa_verify():
    from homy.mfa_service import verify_code
    from homy.auth import establish_session
    from homy.auth_login_flow import clear_mfa_pending

    pending_id = session.get('mfa_pending_user_id')
    if not pending_id:
        return jsonify({'error': 'Bad Request', 'message': 'Keine ausstehende MFA-Anmeldung'}), 400
    data = request.get_json() or {}
    code = data.get('code', '')
    user = User.query.get(pending_id)
    if not user or not verify_code(user, code):
        return jsonify({'error': 'Unauthorized', 'message': 'Ungültiger MFA-Code'}), 401
    clear_mfa_pending()
    establish_session(user)
    log_activity('login', f"Benutzer '{user.username}' hat sich angemeldet (MFA).")
    return jsonify({'success': True, 'user': user.to_dict()})


@app.route('/api/auth/mfa/setup', methods=['GET'])
@login_required
def auth_mfa_setup_get():
    from homy.mfa_service import setup_mfa
    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({'error': 'Not Found'}), 404
    data = setup_mfa(user)
    return jsonify(data)


@app.route('/api/auth/mfa/setup', methods=['POST'])
@login_required
def auth_mfa_setup_confirm():
    from homy.mfa_service import confirm_mfa_setup
    user = User.query.get(session['user_id'])
    data = request.get_json() or {}
    ok, err = confirm_mfa_setup(user, data.get('code', ''))
    if not ok:
        return jsonify({'error': 'Bad Request', 'message': err}), 400
    return jsonify({'success': True})


@app.route('/api/auth/mfa/disable', methods=['POST'])
@login_required
def auth_mfa_disable():
    from homy.mfa_service import disable_mfa
    user = User.query.get(session['user_id'])
    disable_mfa(user)
    return jsonify({'success': True})


@app.route('/api/auth/oidc/login', methods=['GET'])
def auth_oidc_login():
    from homy.admin_settings import get_setting_bool, AUTH_OIDC_ENABLED
    if not get_setting_bool(AUTH_OIDC_ENABLED, False):
        return jsonify({'error': 'Forbidden', 'message': 'OIDC deaktiviert'}), 403
    from homy.auth_oidc import login_redirect
    return login_redirect()


@app.route('/api/auth/oidc/callback', methods=['GET'])
def auth_oidc_callback():
    from homy.auth_oidc import handle_callback
    from homy.auth import establish_session
    from homy.auth_login_flow import login_response_payload, clear_mfa_pending

    user, err = handle_callback()
    if err:
        return jsonify({'error': 'Unauthorized', 'message': err}), 401
    payload = login_response_payload(user)
    if payload.get('mfa_required'):
        return jsonify(payload), 200
    clear_mfa_pending()
    establish_session(user)
    log_activity('login', f"Benutzer '{user.username}' via OIDC angemeldet.")
    return jsonify({'success': True, 'user': user.to_dict()})


@app.route('/api/auth/saml/login', methods=['GET'])
def auth_saml_login():
    from homy.admin_settings import get_setting_bool, AUTH_SAML_ENABLED
    if not get_setting_bool(AUTH_SAML_ENABLED, False):
        return jsonify({'error': 'Forbidden', 'message': 'SAML deaktiviert'}), 403
    from homy.auth_saml import login_redirect
    return login_redirect()


@app.route('/api/auth/saml/acs', methods=['POST'])
def auth_saml_acs():
    from homy.auth_saml import handle_acs
    from homy.auth import establish_session
    from homy.auth_login_flow import login_response_payload

    user, err = handle_acs()
    if err:
        return jsonify({'error': 'Unauthorized', 'message': err}), 401
    payload = login_response_payload(user)
    if payload.get('mfa_required'):
        return jsonify(payload), 200
    establish_session(user)
    log_activity('login', f"Benutzer '{user.username}' via SAML angemeldet.")
    return jsonify({'success': True, 'user': user.to_dict()})


@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    log_activity('logout', f"Benutzer '{session.get('username')}' hat sich abgemeldet.")
    logout()
    return jsonify({'success': True})

@app.route('/api/auth/password-reset/request', methods=['POST'])
def auth_password_reset_request():
    from homy.password_reset import request_reset_code

    data = request.get_json() or {}
    identifier = (data.get('username') or data.get('email') or '').strip()
    if not identifier:
        return jsonify({'error': 'Bad Request', 'message_key': 'password_reset_identifier_required'}), 400
    ok, key, params = request_reset_code(identifier)
    if not ok:
        return jsonify({'ok': False, 'message_key': key, 'message_params': params}), 400
    return jsonify({'ok': True, 'message_key': key, 'message_params': params})


@app.route('/api/auth/password-reset/confirm', methods=['POST'])
def auth_password_reset_confirm():
    from homy.password_reset import complete_reset

    data = request.get_json() or {}
    identifier = (data.get('username') or data.get('email') or '').strip()
    code = data.get('code', '')
    password = data.get('password', '')
    if not identifier or not code or not password:
        return jsonify({'error': 'Bad Request', 'message_key': 'password_reset_fields_required'}), 400
    ok, err_key = complete_reset(identifier, code, password)
    if not ok:
        return jsonify({'error': 'Bad Request', 'message_key': err_key or 'password_reset_invalid'}), 400
    return jsonify({'ok': True, 'message_key': 'password_reset_success'})


@app.route('/api/setup/init', methods=['POST'])
def auth_setup():
    # Only allow setup if no users exist in database
    db.session.expire_all()
    user_count = User.query.count()
    if user_count > 0:
        return jsonify({'error': 'Forbidden', 'message': 'System is already configured.'}), 403
        
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'error': 'Bad Request', 'message': 'Username and password required'}), 400
        
    user, err = register(username, password, 'admin')
    if err:
        return jsonify({'error': 'Conflict', 'message': err}), 409
        
    # Auto log in the new admin user
    session['user_id'] = user.id
    session['username'] = user.username
    session['role'] = user.role
    apply_session_for_user(app)

    return jsonify({
        'success': True,
        'user': user.to_dict()
    }), 201

@app.route('/api/auth/register', methods=['POST'])
def auth_register():
    from homy.admin_settings import get_setting_bool, REGISTRATION_ENABLED

    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Bad Request', 'message': 'Username and password required'}), 400

    is_admin_session = 'user_id' in session and session.get('role') == 'admin'
    if not is_admin_session and not get_setting_bool(REGISTRATION_ENABLED, False):
        return jsonify({
            'error': 'Forbidden',
            'message': 'Registrierung ist deaktiviert. Bitte einen Administrator kontaktieren.',
        }), 403

    role = 'user'
    if is_admin_session:
        role = data.get('role', 'user')
        
    user, err = register(username, password, role)
    if err:
        return jsonify({'error': 'Conflict', 'message': err}), 409
        
    return jsonify({
        'success': True,
        'user': user.to_dict()
    }), 201


# --- Widgets API (Layout Configuration) ---

@app.route('/api/widgets', methods=['GET'])
@login_required
def get_widgets():
    layout_type = request.args.get('layout', 'auto')
    _, target_user_id, dashboard_layout = layout_context(layout_type)
    widgets = widgets_query(target_user_id, dashboard_layout).all()

    vault_map = WidgetInstance.build_vault_map(widgets)
    result = []
    for w in widgets:
        d = w.to_dict(vault_map=vault_map)
        schema_def = module_manager.widgets_registry.get(w.type)
        if schema_def and 'config_schema' in schema_def:
            config_schema = schema_def['config_schema']
            for field_name, field_info in config_schema.items():
                if field_info.get('type') == 'password':
                    if field_name in d.get('config', {}):
                        d['config'][field_name] = '********'
        result.append(d)
        
    return jsonify(result)

@app.route('/api/widgets', methods=['POST'])
@login_required
def create_widget():
    if check_layout_lock():
        return jsonify({'error': 'Forbidden', 'message': 'Das Layout ist vom Administrator gesperrt.'}), 403

    data = request.get_json() or {}
    module_name = data.get('module')
    widget_type = data.get('type')
    
    if not module_name or not widget_type:
        return jsonify({'error': 'Bad Request', 'message': 'Module and Type required'}), 400
        
    target_user_id = session['user_id']
    is_public_layout = data.get('is_public', False)
    
    if is_public_layout:
        if session.get('role') != 'admin':
            return jsonify({'error': 'Forbidden', 'message': 'Only admin can edit public layout'}), 403
        target_user_id = None
        
    widget_schema = module_manager.widgets_registry.get(widget_type)
    if not widget_schema:
        return jsonify({'error': 'Bad Request', 'message': 'Invalid widget type'}), 400
        
    col = data.get('col', 0)
    row = data.get('row', 0)
    size_x = data.get('size_x', widget_schema.get('default_size_x', 3))
    size_y = data.get('size_y', widget_schema.get('default_size_y', 2))
    title = data.get('title', widget_schema.get('name'))
    config = data.get('config', {})
    tab_id = data.get('tab_id', 'default')
    dashboard_layout = data.get('dashboard_layout', 'desktop')
    if dashboard_layout not in ('desktop', 'mobile'):
        dashboard_layout = 'desktop'
    
    widget_id = str(uuid.uuid4())
    config_schema = widget_schema.get('config_schema', {})
    for field_name, field_info in config_schema.items():
        if field_info.get('type') == 'password' and field_name in config:
            val = config[field_name]
            setting_key = f"vault_{widget_id}_{field_name}"
            db.session.add(Setting(key=setting_key, value=val))
            config[field_name] = '__VAULT_SECRET__'
            
    new_widget = WidgetInstance(
        id=widget_id,
        user_id=target_user_id,
        module=module_name,
        type=widget_type,
        title=title,
        col=col,
        row=row,
        size_x=size_x,
        size_y=size_y,
        tab_id=tab_id,
        dashboard_layout=dashboard_layout,
    )
    new_widget.config = config
    
    db.session.add(new_widget)
    log_activity('widget_create', f"Widget '{title or widget_type}' hinzugefügt.")
    db.session.commit()
    
    return jsonify(new_widget.to_dict()), 201

@app.route('/api/widgets/<widget_id>', methods=['PUT'])
@login_required
def update_widget(widget_id):
    if check_layout_lock():
        return jsonify({'error': 'Forbidden', 'message': 'Das Layout ist vom Administrator gesperrt.'}), 403

    widget = WidgetInstance.query.get(widget_id)
    if not widget:
        return jsonify({'error': 'Not Found', 'message': 'Widget not found'}), 404
        
    if widget.user_id is None:
        if session.get('role') != 'admin':
            return jsonify({'error': 'Forbidden', 'message': 'Only admin can edit public layout'}), 403
    elif widget.user_id != session['user_id'] and session.get('role') != 'admin':
        return jsonify({'error': 'Forbidden', 'message': 'You do not own this widget'}), 403
        
    data = request.get_json() or {}
    
    if 'title' in data:
        widget.title = data['title']
    if 'col' in data:
        widget.col = int(data['col'])
    if 'row' in data:
        widget.row = int(data['row'])
    if 'size_x' in data:
        widget.size_x = int(data['size_x'])
    if 'size_y' in data:
        widget.size_y = int(data['size_y'])
    if 'tab_id' in data:
        widget.tab_id = data['tab_id']
    if 'config' in data:
        new_config = data['config']
        schema_def = module_manager.widgets_registry.get(widget.type)
        config_schema = schema_def.get('config_schema', {}) if schema_def else {}
        
        for field_name, field_info in config_schema.items():
            if field_info.get('type') == 'password' and field_name in new_config:
                val = new_config[field_name]
                if val in ('********', '__VAULT_SECRET__'):
                    new_config[field_name] = '__VAULT_SECRET__'
                elif isinstance(val, str) and not val.strip():
                    setting_key = f"vault_{widget.id}_{field_name}"
                    existing = db.session.get(Setting, setting_key)
                    if existing:
                        db.session.delete(existing)
                    new_config[field_name] = '__VAULT_SECRET__'
                else:
                    setting_key = f"vault_{widget.id}_{field_name}"
                    setting = db.session.get(Setting, setting_key)
                    if setting:
                        setting.value = val
                    else:
                        db.session.add(Setting(key=setting_key, value=val))
                    new_config[field_name] = '__VAULT_SECRET__'
        
        widget.config = new_config
        
    log_activity('widget_update', f"Widget '{widget.title or widget.type}' aktualisiert.")
    db.session.commit()
    return jsonify(widget.to_dict())

@app.route('/api/widgets/bulk-layout', methods=['PUT'])
@login_required
def update_widgets_bulk():
    if check_layout_lock():
        return jsonify({'error': 'Forbidden', 'message': 'Das Layout ist vom Administrator gesperrt.'}), 403

    data = request.get_json() or {}
    positions = data.get('positions', [])
    
    for pos in positions:
        w_id = pos.get('id')
        widget = WidgetInstance.query.get(w_id)
        if widget:
            if widget.user_id is None:
                if session.get('role') != 'admin':
                    continue
            elif widget.user_id != session['user_id'] and session.get('role') != 'admin':
                continue
                
            if 'col' in pos:
                widget.col = int(pos['col'])
            if 'row' in pos:
                widget.row = int(pos['row'])
            if 'size_x' in pos:
                widget.size_x = int(pos['size_x'])
            if 'size_y' in pos:
                widget.size_y = int(pos['size_y'])
            if 'tab_id' in pos:
                widget.tab_id = pos['tab_id']
                
    log_activity('layout_reorder', "Layout per Drag & Drop verschoben.")
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/widgets/<widget_id>', methods=['DELETE'])
@login_required
def delete_widget(widget_id):
    if check_layout_lock():
        return jsonify({'error': 'Forbidden', 'message': 'Das Layout ist vom Administrator gesperrt.'}), 403

    widget = WidgetInstance.query.get(widget_id)
    if not widget:
        return jsonify({'error': 'Not Found', 'message': 'Widget not found'}), 404
        
    if widget.user_id is None:
        if session.get('role') != 'admin':
            return jsonify({'error': 'Forbidden', 'message': 'Only admin can edit public layout'}), 403
    elif widget.user_id != session['user_id'] and session.get('role') != 'admin':
        return jsonify({'error': 'Forbidden', 'message': 'You do not own this widget'}), 403
        
    title = widget.title or widget.type
    schema_def = module_manager.widgets_registry.get(widget.type)
    config_schema = schema_def.get('config_schema', {}) if schema_def else {}
    for field_name, field_info in config_schema.items():
        if field_info.get('type') == 'password':
            setting_key = f"vault_{widget.id}_{field_name}"
            setting = db.session.get(Setting, setting_key)
            if setting:
                db.session.delete(setting)
                
    db.session.delete(widget)
    log_activity('widget_delete', f"Widget '{title}' gelöscht.")
    db.session.commit()
    return jsonify({'success': True})

@app.route('/api/widgets/<widget_id>/duplicate', methods=['POST'])
@login_required
def duplicate_widget(widget_id):
    if check_layout_lock():
        return jsonify({'error': 'Forbidden', 'message': 'Das Layout ist vom Administrator gesperrt.'}), 403

    widget = WidgetInstance.query.get(widget_id)
    if not widget:
        return jsonify({'error': 'Not Found', 'message': 'Widget not found'}), 404

    if widget.user_id is None:
        if session.get('role') != 'admin':
            return jsonify({'error': 'Forbidden', 'message': 'Only admin can duplicate public layout widgets'}), 403
    elif widget.user_id != session['user_id'] and session.get('role') != 'admin':
        return jsonify({'error': 'Forbidden', 'message': 'You do not own this widget'}), 403

    new_id = str(uuid.uuid4())
    new_widget = WidgetInstance(
        id=new_id,
        user_id=widget.user_id,
        module=widget.module,
        type=widget.type,
        title=widget.title,
        col=widget.col,
        row=widget.row + widget.size_y,
        size_x=widget.size_x,
        size_y=widget.size_y,
        config_json=widget.config_json,
        tab_id=widget.tab_id,
        dashboard_layout=widget.dashboard_layout,
    )
    db.session.add(new_widget)
    db.session.flush()

    vault_settings = Setting.query.filter(Setting.key.like(f'vault_{widget_id}_%')).all()
    for vs in vault_settings:
        new_key = vs.key.replace(f'vault_{widget_id}_', f'vault_{new_id}_', 1)
        db.session.add(Setting(key=new_key, value=vs.value))

    log_activity('widget_duplicate', f"Widget '{widget.title or widget.type}' dupliziert (#{new_id})")
    db.session.commit()
    return jsonify(new_widget.to_dict()), 201


@app.route('/api/tabs', methods=['GET'])
def get_tabs():
    layout_type = request.args.get('layout', 'auto')
    key, _, _ = layout_context(layout_type)
    setting = Setting.query.get(key)
    if setting and setting.value:
        try:
            return jsonify(json.loads(setting.value))
        except Exception:
            pass
            
    # Default tabs if setting is empty
    return jsonify([
        {'id': 'default', 'name': 'Main'}
    ])

@app.route('/api/tabs', methods=['POST'])
@login_required
def save_tabs():
    if check_layout_lock():
        return jsonify({'error': 'Forbidden', 'message': 'Das Layout ist vom Administrator gesperrt.'}), 403

    data = request.get_json() or {}
    tabs = data.get('tabs', [])
    is_public = data.get('is_public', False)
    layout_type = data.get('layout', 'public' if is_public else 'auto')
    
    if is_public or layout_type == 'public':
        if session.get('role') != 'admin':
            return jsonify({'error': 'Forbidden', 'message': 'Only admin can edit public tabs'}), 403
        key, target_user_id, dashboard_layout = layout_context('public')
    else:
        key, target_user_id, dashboard_layout = layout_context(layout_type)
        
    if not isinstance(tabs, list):
        return jsonify({'error': 'Bad Request', 'message': 'Tabs must be a list'}), 400
        
    setting = Setting.query.get(key)
    if setting:
        setting.value = json.dumps(tabs)
    else:
        setting = Setting(key=key, value=json.dumps(tabs))
        db.session.add(setting)
        
    current_tab_ids = [t.get('id') for t in tabs if t.get('id')]
    if current_tab_ids:
        widgets_to_delete = widgets_query(target_user_id, dashboard_layout).filter(
            ~WidgetInstance.tab_id.in_(current_tab_ids)
        ).all()
    else:
        widgets_to_delete = widgets_query(target_user_id, dashboard_layout).all()
        
    for w in widgets_to_delete:
        db.session.delete(w)
        
    log_activity('tabs_update', "Dashboard-Tabs aktualisiert.")
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/tabs/duplicate', methods=['POST'])
@login_required
def duplicate_tab():
    if check_layout_lock():
        return jsonify({'error': 'Forbidden', 'message': 'Das Layout ist vom Administrator gesperrt.'}), 403

    data = request.get_json() or {}
    source_layout = data.get('source_layout', 'auto')
    target_layout = data.get('target_layout', 'auto')
    source_tab_id = data.get('source_tab_id')
    new_tab_id = data.get('new_tab_id') or f'tab_{uuid.uuid4().hex[:12]}'
    name = (data.get('name') or 'Copy').strip() or 'Copy'

    if not source_tab_id:
        return jsonify({'error': 'Bad Request', 'message': 'source_tab_id required'}), 400

    _, src_uid, src_dl = layout_context(source_layout)
    tgt_tabs_key, tgt_uid, tgt_dl = layout_context(target_layout)

    if src_uid != tgt_uid and session.get('role') != 'admin':
        return jsonify({'error': 'Forbidden', 'message': 'Cannot duplicate across users'}), 403

    src_tabs_setting = Setting.query.get(layout_context(source_layout)[0])
    src_tabs = []
    if src_tabs_setting and src_tabs_setting.value:
        try:
            src_tabs = json.loads(src_tabs_setting.value)
        except Exception:
            pass
    src_tab_meta = next((t for t in src_tabs if t.get('id') == source_tab_id), None)

    tgt_tabs_setting = Setting.query.get(tgt_tabs_key)
    tgt_tabs = []
    if tgt_tabs_setting and tgt_tabs_setting.value:
        try:
            tgt_tabs = json.loads(tgt_tabs_setting.value)
        except Exception:
            pass

    new_tab = {'id': new_tab_id, 'name': name}
    if src_tab_meta and src_tab_meta.get('background'):
        new_tab['background'] = src_tab_meta['background']
    tgt_tabs.append(new_tab)

    if tgt_tabs_setting:
        tgt_tabs_setting.value = json.dumps(tgt_tabs)
    else:
        db.session.add(Setting(key=tgt_tabs_key, value=json.dumps(tgt_tabs)))

    src_widgets = widgets_query(src_uid, src_dl).filter_by(tab_id=source_tab_id).all()
    vault_map = WidgetInstance.build_vault_map(src_widgets)

    for sw in src_widgets:
        w_id = str(uuid.uuid4())
        config = sw.resolve_config(vault_map)
        schema_def = module_manager.widgets_registry.get(sw.type)
        config_schema = schema_def.get('config_schema', {}) if schema_def else {}
        for field_name, field_info in config_schema.items():
            if field_info.get('type') == 'password' and field_name in config:
                val = config[field_name]
                if val:
                    setting_key = f"vault_{w_id}_{field_name}"
                    db.session.add(Setting(key=setting_key, value=val))
                    config[field_name] = '__VAULT_SECRET__'

        col = int(sw.col)
        row = int(sw.row)
        size_x = int(sw.size_x)
        size_y = int(sw.size_y)
        if tgt_dl == 'mobile':
            size_x = min(size_x, 12)
            size_y = max(size_y, 2)

        db.session.add(WidgetInstance(
            id=w_id,
            user_id=tgt_uid,
            module=sw.module,
            type=sw.type,
            title=sw.title,
            col=col,
            row=row,
            size_x=size_x,
            size_y=size_y,
            config_json=json.dumps(config),
            tab_id=new_tab_id,
            dashboard_layout=tgt_dl,
        ))

    log_activity('tab_duplicate', f"Tab '{name}' dupliziert.")
    db.session.commit()
    return jsonify({'success': True, 'tab': new_tab})


@app.route('/api/extension/sync', methods=['GET'])
@login_required
def extension_sync():
    """Desktop dashboard bundle for browser extension (new tab cache, local backup)."""
    from datetime import datetime, timezone

    layout_type = request.args.get('layout', 'auto')
    if layout_type == 'mobile':
        layout_type = 'auto'
    tabs_key, target_user_id, dashboard_layout = layout_context(layout_type)
    widgets = widgets_query(target_user_id, dashboard_layout).all()
    favs = FavoriteLink.query.filter_by(user_id=target_user_id).order_by(FavoriteLink.order).all()
    tabs = []
    setting = Setting.query.get(tabs_key)
    if setting and setting.value:
        try:
            tabs = json.loads(setting.value)
        except Exception:
            pass
    vault_map = WidgetInstance.build_vault_map(widgets)
    return jsonify({
        'version': '1.0',
        'layout': dashboard_layout,
        'exported_at': datetime.now(timezone.utc).isoformat(),
        'tabs': tabs,
        'widgets': [w.to_dict(vault_map=vault_map) for w in widgets],
        'favorites': [f.to_dict() for f in favs],
    })


@app.route('/api/layout/export', methods=['GET'])
@login_required
def export_layout():
    layout_type = request.args.get('layout', 'auto')
    
    if layout_type == 'public':
        if session.get('role') != 'admin':
            return jsonify({'error': 'Forbidden', 'message': 'Only admin can export public layout'}), 403
    tabs_key, target_user_id, dashboard_layout = layout_context(layout_type)
        
    widgets = widgets_query(target_user_id, dashboard_layout).all()
    favorites = FavoriteLink.query.filter_by(user_id=target_user_id).all()
    
    tabs = []
    setting = Setting.query.get(tabs_key)
    if setting and setting.value:
        try:
            tabs = json.loads(setting.value)
        except Exception:
            pass
            
    export_data = {
        'version': '1.0',
        'widgets': [w.to_dict() for w in widgets],
        'favorites': [f.to_dict() for f in favorites],
        'tabs': tabs
    }
    
    return jsonify(export_data)

@app.route('/api/layout/import', methods=['POST'])
@login_required
def import_layout():
    if check_layout_lock():
        return jsonify({'error': 'Forbidden', 'message': 'Das Layout ist vom Administrator gesperrt.'}), 403

    data = request.get_json() or {}
    layout_type = request.args.get('layout', 'auto')
    
    if layout_type == 'public':
        if session.get('role') != 'admin':
            return jsonify({'error': 'Forbidden', 'message': 'Only admin can import public layout'}), 403
    tabs_key, target_user_id, dashboard_layout = layout_context(layout_type)
        
    widgets_data = data.get('widgets', [])
    favorites_data = data.get('favorites', [])
    tabs_data = data.get('tabs', [])
    
    widgets_query(target_user_id, dashboard_layout).delete()
    FavoriteLink.query.filter_by(user_id=target_user_id).delete()
    
    setting = Setting.query.get(tabs_key)
    if setting:
        setting.value = json.dumps(tabs_data)
    else:
        setting = Setting(key=tabs_key, value=json.dumps(tabs_data))
        db.session.add(setting)
        
    for w in widgets_data:
        w_id = str(uuid.uuid4())
        config = w.get('config', {})
        schema_def = module_manager.widgets_registry.get(w.get('type'))
        config_schema = schema_def.get('config_schema', {}) if schema_def else {}
        
        for field_name, field_info in config_schema.items():
            if field_info.get('type') == 'password' and field_name in config:
                val = config[field_name]
                if val != '********' and val != '__VAULT_SECRET__':
                    setting_key = f"vault_{w_id}_{field_name}"
                    db.session.add(Setting(key=setting_key, value=val))
                    config[field_name] = '__VAULT_SECRET__'
                    
        db.session.add(WidgetInstance(
            id=w_id,
            user_id=target_user_id,
            module=w.get('module'),
            type=w.get('type'),
            title=w.get('title'),
            col=w.get('col', 0),
            row=w.get('row', 0),
            size_x=w.get('size_x', 3),
            size_y=w.get('size_y', 2),
            config_json=json.dumps(config),
            tab_id=w.get('tab_id', 'default'),
            dashboard_layout=dashboard_layout,
        ))
        
    log_activity('layout_import', "Dashboard-Backup erfolgreich eingespielt.")
    db.session.commit()
        
    # 4. Add favorites
    for idx, f in enumerate(favorites_data):
        db.session.add(FavoriteLink(
            user_id=target_user_id,
            title=f.get('title'),
            url=f.get('url'),
            icon_type=f.get('icon_type', 'icon'),
            icon_value=f.get('icon_value', 'link'),
            category=f.get('category', 'General'),
            order=f.get('order', idx)
        ))
        
    db.session.commit()
    return jsonify({'success': True})


# --- Favorites API ---

BROWSER_SYNC_CATEGORY = 'Aus Browser synchronisiert'
BROWSER_SYNC_CATEGORY_EN = 'Synced from browser'


def _favorite_category_order_key(user_id):
    return f'favorite_category_order_{user_id}'


@app.route('/api/favorites/category-order', methods=['GET', 'PUT'])
@login_required
def favorite_category_order():
    key = _favorite_category_order_key(session['user_id'])
    if request.method == 'GET':
        setting = Setting.query.get(key)
        order = []
        if setting and setting.value:
            try:
                order = json.loads(setting.value)
            except Exception:
                order = []
        if not isinstance(order, list):
            order = []
        return jsonify({'order': order, 'browser_sync_category': BROWSER_SYNC_CATEGORY})

    data = request.get_json() or {}
    order = data.get('order', [])
    if not isinstance(order, list):
        return jsonify({'error': 'Bad Request', 'message': 'order must be a list'}), 400
    cleaned = []
    seen = set()
    for item in order:
        name = str(item).strip()
        if not name or name in seen:
            continue
        seen.add(name)
        cleaned.append(name)
    setting = Setting.query.get(key)
    if setting:
        setting.value = json.dumps(cleaned)
    else:
        db.session.add(Setting(key=key, value=json.dumps(cleaned)))
    db.session.commit()
    return jsonify({'success': True, 'order': cleaned})


@app.route('/api/favorites/import-browser', methods=['POST'])
@login_required
def import_browser_favorites():
    """Create/update user favorites imported from the browser extension."""
    data = request.get_json() or {}
    items = data.get('items', [])
    if not isinstance(items, list) or not items:
        return jsonify({'error': 'Bad Request', 'message': 'items required'}), 400

    category = (data.get('category') or BROWSER_SYNC_CATEGORY).strip()
    if category in (BROWSER_SYNC_CATEGORY, BROWSER_SYNC_CATEGORY_EN):
        category = BROWSER_SYNC_CATEGORY

    uid = session['user_id']
    existing = FavoriteLink.query.filter_by(user_id=uid).all()
    by_url = {f.url.rstrip('/').lower(): f for f in existing}
    max_order = db.session.query(db.func.max(FavoriteLink.order)).filter_by(user_id=uid).scalar() or 0

    created = 0
    updated = 0
    for raw in items:
        title = (raw.get('title') or '').strip()
        url = (raw.get('url') or '').strip()
        if not title or not url or not url.startswith(('http://', 'https://')):
            continue
        norm = url.rstrip('/').lower()
        if norm in by_url:
            fav = by_url[norm]
            fav.title = title
            fav.category = category
            updated += 1
        else:
            max_order += 1
            fav = FavoriteLink(
                user_id=uid,
                title=title[:100],
                url=url[:512],
                icon_type='auto',
                icon_value='',
                category=category,
                order=max_order,
                is_private=False,
            )
            db.session.add(fav)
            by_url[norm] = fav
            created += 1

    db.session.commit()
    return jsonify({
        'success': True,
        'created': created,
        'updated': updated,
        'category': category,
    })


@app.route('/api/favorites', methods=['GET'])
@login_required
def get_favorites():
    layout_type = request.args.get('layout', 'auto')
    
    if layout_type == 'public':
        favs = FavoriteLink.query.filter_by(user_id=None).order_by(FavoriteLink.order).all()
    elif 'user_id' in session and layout_type != 'guest':
        favs = FavoriteLink.query.filter_by(user_id=session['user_id']).order_by(FavoriteLink.order).all()
    else:
        favs = FavoriteLink.query.filter_by(user_id=None).order_by(FavoriteLink.order).all()
        
    return jsonify([f.to_dict() for f in favs])

def _is_safe_url(url):
    """Only allow http and https schemes to prevent XSS via javascript:/data: links."""
    if not url:
        return False
    return url.strip().lower().startswith(('http://', 'https://'))


@app.route('/api/favorites', methods=['POST'])
@login_required
def create_favorite():
    data = request.get_json() or {}
    title = data.get('title')
    url = data.get('url')

    if not title or not url:
        return jsonify({'error': 'Bad Request', 'message': 'Title and URL required'}), 400
    if not _is_safe_url(url):
        return jsonify({'error': 'Bad Request', 'message': 'URL muss mit http:// oder https:// beginnen'}), 400
        
    target_user_id = session['user_id']
    is_public = data.get('is_public', False)
    is_private = data.get('is_private', False)
    
    if is_public:
        if session.get('role') != 'admin':
            return jsonify({'error': 'Forbidden', 'message': 'Only admin can edit public links'}), 403
        target_user_id = None
        is_private = False # Public links cannot be private
        
    # Get highest order
    max_order = db.session.query(db.func.max(FavoriteLink.order)).filter_by(user_id=target_user_id).scalar() or 0
    
    norm_type, norm_value = _normalize_favorite_icon_fields(
        data.get('icon_type', 'auto'),
        data.get('icon_value', ''),
    )
    new_fav = FavoriteLink(
        user_id=target_user_id,
        title=title,
        url=url,
        icon_type=norm_type,
        icon_value=norm_value,
        category=data.get('category', 'General'),
        order=max_order + 1,
        is_private=is_private
    )
    db.session.add(new_fav)
    db.session.commit()
    
    return jsonify(new_fav.to_dict()), 201

@app.route('/api/favorites/<int:fav_id>', methods=['PUT'])
@login_required
def update_favorite(fav_id):
    fav = FavoriteLink.query.get(fav_id)
    if not fav:
        return jsonify({'error': 'Not Found', 'message': 'Favorite link not found'}), 404
        
    # Check permissions
    if fav.user_id is None:
        if session.get('role') != 'admin':
            return jsonify({'error': 'Forbidden', 'message': 'Only admin can edit public links'}), 403
    elif fav.user_id != session['user_id'] and session.get('role') != 'admin':
        return jsonify({'error': 'Forbidden', 'message': 'You do not own this link'}), 403
        
    data = request.get_json() or {}

    if 'title' in data:
        fav.title = data['title']
    if 'url' in data:
        if not _is_safe_url(data['url']):
            return jsonify({'error': 'Bad Request', 'message': 'URL muss mit http:// oder https:// beginnen'}), 400
        fav.url = data['url']
    if 'icon_type' in data or 'icon_value' in data:
        norm_type, norm_value = _normalize_favorite_icon_fields(
            data.get('icon_type', fav.icon_type),
            data.get('icon_value', fav.icon_value),
        )
        fav.icon_type = norm_type
        fav.icon_value = norm_value
    if 'category' in data:
        fav.category = data['category']
    if 'order' in data:
        fav.order = int(data['order'])
    if 'is_private' in data:
        fav.is_private = bool(data['is_private'])
        
    db.session.commit()
    return jsonify(fav.to_dict())

@app.route('/api/favorites/<int:fav_id>', methods=['DELETE'])
@login_required
def delete_favorite(fav_id):
    fav = FavoriteLink.query.get(fav_id)
    if not fav:
        return jsonify({'error': 'Not Found', 'message': 'Favorite link not found'}), 404
        
    # Check permissions
    if fav.user_id is None:
        if session.get('role') != 'admin':
            return jsonify({'error': 'Forbidden', 'message': 'Only admin can edit public links'}), 403
    elif fav.user_id != session['user_id'] and session.get('role') != 'admin':
        return jsonify({'error': 'Forbidden', 'message': 'You do not own this link'}), 403
        
    db.session.delete(fav)
    db.session.commit()
    return jsonify({'success': True})


# --- User Assets (Icons / Backgrounds) ---

@app.route('/api/assets', methods=['GET'])
def list_assets_api():
    from homy.asset_service import list_assets
    category = request.args.get('category')
    scope = request.args.get('scope', 'all')
    return jsonify(list_assets(session, category=category, scope=scope))


@app.route('/api/assets', methods=['POST'])
@login_required
def upload_asset_api():
    from homy.asset_service import save_asset
    if 'file' not in request.files:
        return jsonify({'error': 'Bad Request', 'message': 'Keine Datei'}), 400

    category = request.form.get('category', 'icon')
    is_global = request.form.get('is_global', 'false').lower() == 'true'
    asset, err, code = save_asset(request.files['file'], session, category, is_global=is_global)
    if err:
        return jsonify({'error': 'Upload failed', 'message': err}), code

    log_activity('asset_upload', f"Asset hochgeladen: {asset.original_name} ({category})")
    return jsonify(asset.to_dict({'user_id': session['user_id'], 'role': session.get('role')})), code


@app.route('/api/assets/<int:asset_id>', methods=['PUT'])
@login_required
def update_asset_api(asset_id):
    from homy.asset_service import update_asset
    data = request.get_json() or {}
    asset, err, code = update_asset(asset_id, session, data)
    if err:
        return jsonify({'error': 'Update failed', 'message': err}), code
    log_activity('asset_update', f"Asset #{asset_id} aktualisiert")
    return jsonify(asset.to_dict({'user_id': session['user_id'], 'role': session.get('role')}))


@app.route('/api/assets/<int:asset_id>/file', methods=['GET'])
def serve_asset_file(asset_id):
    from flask import send_file
    from homy.asset_service import can_access_asset, asset_file_path

    asset = db.session.get(UserAsset, asset_id)
    if not asset:
        return jsonify({'error': 'Not Found'}), 404
    if not can_access_asset(asset, session):
        return jsonify({'error': 'Forbidden'}), 403

    path = asset_file_path(asset)
    if not os.path.isfile(path):
        return jsonify({'error': 'Not Found', 'message': 'Datei fehlt auf dem Server'}), 404

    return send_file(path, mimetype=asset.mime_type, max_age=86400)


@app.route('/api/assets/<int:asset_id>', methods=['DELETE'])
@login_required
def delete_asset_api(asset_id):
    from homy.asset_service import delete_asset
    ok, err, code = delete_asset(asset_id, session)
    if not ok:
        return jsonify({'error': 'Delete failed', 'message': err}), code
    log_activity('asset_delete', f"Asset #{asset_id} gelöscht")
    return jsonify({'success': True})


def _normalize_favorite_icon_fields(icon_type, icon_value):
    """Persist auto-favicon rows consistently (not legacy icon+link)."""
    itype = (icon_type or 'auto').strip().lower()
    val = (icon_value or '').strip()
    if itype == 'auto' or (itype == 'icon' and val in ('', 'auto', 'link')):
        return 'auto', ''
    if itype == 'asset' and not val:
        return 'auto', ''
    if itype == 'image' and not val:
        return 'auto', ''
    return itype, val


@app.route('/api/favicon', methods=['GET'])
@login_required
def favicon_proxy():
    from flask import Response
    from homy.favicon_service import fetch_favicon
    from homy.debug_config import is_debug, debug_log

    url = request.args.get('url', '').strip()
    if not url:
        return jsonify({'error': 'Bad Request'}), 400

    result = fetch_favicon(url)
    if result.get('ok') and result.get('data'):
        if is_debug():
            debug_log(
                logger,
                'serving favicon domain=%s cache=%s source=%s bytes=%d',
                result.get('domain'),
                'HIT' if result.get('from_cache') else 'MISS',
                result.get('source'),
                len(result['data']),
            )
        resp = Response(result['data'], mimetype=result.get('content_type', 'image/png'))
        resp.headers['Cache-Control'] = 'public, max-age=86400'
        resp.headers['X-Homy-Favicon-Source'] = result.get('source', '')
        resp.headers['X-Homy-Favicon-Cache'] = 'hit' if result.get('from_cache') else 'miss'
        return resp

    if is_debug():
        debug_log(logger, 'favicon fallback for url=%s error=%s', url, result.get('error'))

    return send_from_directory(
        os.path.join(app.root_path, 'static', 'media'),
        'fallback-icon.svg',
        mimetype='image/svg+xml',
    )


@app.route('/api/favicon/debug', methods=['GET'])
def favicon_debug_info():
    """Debug-only: inspect cache entry for a URL (requires HOMY_DEBUG or --debug)."""
    from homy.debug_config import is_debug
    from homy.favicon_service import debug_info

    if not is_debug():
        return jsonify({'error': 'Forbidden', 'message': 'Start with homy --debug'}), 403

    url = request.args.get('url', '').strip()
    if not url:
        return jsonify({'error': 'url parameter required'}), 400
    return jsonify(debug_info(url))


# --- Package Uploads (Module / Integration / Template ZIPs) ---

def _package_zip_path(pkg):
    from homy.asset_service import _packages_subdir
    sub = _packages_subdir(pkg.user_id, pkg.user_id is None)
    return os.path.join(sub, pkg.stored_filename)


def _can_access_package(pkg, session):
    if pkg.user_id is None:
        return True
    user_id = session.get('user_id')
    if not user_id:
        return False
    if session.get('role') == 'admin':
        return True
    return pkg.user_id == user_id


def _can_delete_package(pkg, session):
    if session.get('role') == 'admin':
        return True
    user_id = session.get('user_id')
    if not user_id:
        return False
    if pkg.user_id is None:
        return session.get('role') == 'admin'
    return pkg.user_id == user_id


@app.route('/api/packages', methods=['GET'])
def list_packages_api():
    package_type = request.args.get('type')
    scope = request.args.get('scope', 'all')
    query = PackageUpload.query
    if package_type:
        query = query.filter_by(package_type=package_type)

    user_id = session.get('user_id')
    if scope == 'mine':
        if not user_id:
            return jsonify([])
        query = query.filter(PackageUpload.user_id == user_id)
    elif scope == 'global':
        query = query.filter(PackageUpload.user_id.is_(None))
    elif user_id:
        from sqlalchemy import or_
        query = query.filter(or_(PackageUpload.user_id.is_(None), PackageUpload.user_id == user_id))
    else:
        query = query.filter(PackageUpload.user_id.is_(None))

    items = query.order_by(PackageUpload.created_at.desc()).all()
    is_admin = session.get('role') == 'admin'
    return jsonify([p.to_dict(is_admin) for p in items])


@app.route('/api/packages', methods=['POST'])
@login_required
def upload_package_api():
    from werkzeug.utils import secure_filename
    from homy.asset_service import _packages_subdir
    from homy.package_validator import validate_package_zip, extract_preview_from_zip
    import uuid as uuid_mod

    if 'file' not in request.files:
        return jsonify({'error': 'Bad Request', 'message': 'Keine Datei'}), 400

    package_type = request.form.get('package_type', 'template')
    is_global = request.form.get('is_global', 'false').lower() == 'true'
    if is_global and session.get('role') != 'admin':
        return jsonify({'error': 'Forbidden', 'message': 'Nur Admins können globale Pakete hochladen'}), 403

    file_storage = request.files['file']
    ok, msg, manifest = validate_package_zip(file_storage, package_type)
    if not ok:
        return jsonify({
            'error': 'Validation failed',
            'message': msg,
            'status': 'invalid',
        }), 400

    original = secure_filename(file_storage.filename) or 'package.zip'
    stored = f'{uuid_mod.uuid4().hex}.zip'
    target_user_id = None if is_global else session['user_id']
    subdir = _packages_subdir(target_user_id, is_global)
    os.makedirs(subdir, exist_ok=True)
    full_path = os.path.join(subdir, stored)

    file_storage.stream.seek(0)
    file_storage.save(full_path)
    size = os.path.getsize(full_path)

    preview_filename = None
    if ok and manifest and manifest.get('preview_in_zip'):
        preview_filename = f'{uuid_mod.uuid4().hex}.png'
        preview_path = os.path.join(subdir, preview_filename)
        if not extract_preview_from_zip(full_path, preview_path):
            preview_filename = None

    pkg = PackageUpload(
        user_id=target_user_id,
        package_type=package_type,
        stored_filename=stored,
        original_name=original,
        status='valid',
        validation_message=msg,
        manifest_json=json.dumps(manifest or {}),
        preview_filename=preview_filename,
        size_bytes=size,
    )
    db.session.add(pkg)
    db.session.commit()
    log_activity('package_upload', f"Paket hochgeladen: {original} ({package_type}) — {msg}")
    return jsonify(pkg.to_dict(session.get('role') == 'admin')), 201


@app.route('/api/packages/<int:pkg_id>/preview', methods=['GET'])
def package_preview(pkg_id):
    pkg = db.session.get(PackageUpload, pkg_id)
    if not pkg or not pkg.preview_filename:
        return jsonify({'error': 'Not Found'}), 404
    if not _can_access_package(pkg, session):
        return jsonify({'error': 'Forbidden'}), 403
    path = os.path.join(os.path.dirname(_package_zip_path(pkg)), pkg.preview_filename)
    if not os.path.isfile(path):
        return jsonify({'error': 'Not Found'}), 404
    return send_from_directory(os.path.dirname(path), os.path.basename(path), max_age=86400)


@app.route('/api/packages/<int:pkg_id>', methods=['DELETE'])
@login_required
def delete_package_api(pkg_id):
    pkg = db.session.get(PackageUpload, pkg_id)
    if not pkg:
        return jsonify({'error': 'Not Found'}), 404
    if not _can_delete_package(pkg, session):
        return jsonify({'error': 'Forbidden'}), 403

    base_dir = os.path.dirname(_package_zip_path(pkg))
    for fname in (pkg.stored_filename, pkg.preview_filename):
        if fname:
            fpath = os.path.join(base_dir, fname)
            if os.path.isfile(fpath):
                try:
                    os.remove(fpath)
                except OSError:
                    pass

    db.session.delete(pkg)
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/packages/<int:pkg_id>/install', methods=['POST'])
@admin_required
def install_package_api(pkg_id):
    from homy.package_validator import extract_module_package, extract_integration_package

    pkg = db.session.get(PackageUpload, pkg_id)
    if not pkg:
        return jsonify({'error': 'Not Found'}), 404
    if pkg.status != 'valid':
        return jsonify({'error': 'Bad Request', 'message': 'Paket ist nicht gültig'}), 400

    zip_path = _package_zip_path(pkg)
    from homy.package_validator import validate_package_zip_on_disk

    ok, msg, _ = validate_package_zip_on_disk(zip_path, pkg.package_type)
    if not ok:
        return jsonify({'error': 'Validation failed', 'message': msg}), 400

    if pkg.package_type == 'module':
        module_id, err = extract_module_package(zip_path, module_manager.modules_dir)
        if err:
            return jsonify({'error': 'Install failed', 'message': err}), 400
        try:
            module_manager.load_module(module_id)
        except Exception as e:
            logger.error(f'Module load after install failed: {e}', exc_info=True)
            return jsonify({
                'error': 'Install failed',
                'message': f'Modul extrahiert, aber Laden fehlgeschlagen: {e}',
            }), 400
        pkg.status = 'installed'
        db.session.commit()
        log_activity('package_install', f'Modul "{module_id}" installiert')
        return jsonify({'success': True, 'module_id': module_id})

    if pkg.package_type == 'integration':
        integration_id, err = extract_integration_package(zip_path, integration_manager.integrations_dir)
        if err:
            return jsonify({'error': 'Install failed', 'message': err}), 400
        try:
            integration_manager.load_integration(integration_id)
        except Exception as e:
            logger.error(f'Integration load after install failed: {e}', exc_info=True)
            return jsonify({
                'error': 'Install failed',
                'message': f'Integration extrahiert, aber Laden fehlgeschlagen: {e}',
            }), 400
        pkg.status = 'installed'
        db.session.commit()
        log_activity('package_install', f'Integration "{integration_id}" installiert')
        return jsonify({'success': True, 'integration_id': integration_id})

    return jsonify({'error': 'Bad Request', 'message': 'Nur Modul- oder Integrations-Pakete können installiert werden'}), 400


# --- Admin Panel APIs (Modules & User Management) ---

@app.route('/api/admin/modules', methods=['GET'])
@admin_required
def admin_get_modules():
    from homy.module_manager import _get_disabled_module_ids
    disabled_modules = _get_disabled_module_ids()
        
    modules_list = []
    for name, m in module_manager.modules.items():
        info = m['info'].copy()
        info['enabled'] = name not in disabled_modules
        modules_list.append(info)
        
    return jsonify(modules_list)

@app.route('/api/admin/modules/toggle', methods=['POST'])
@admin_required
def admin_toggle_module():
    data = request.get_json() or {}
    module_id = data.get('module_id')
    enabled = data.get('enabled')
    
    if not module_id or enabled is None:
        return jsonify({'error': 'Bad Request', 'message': 'module_id and enabled fields are required'}), 400
        
    if module_id not in module_manager.modules:
        return jsonify({'error': 'Not Found', 'message': 'Module not found'}), 404
        
    setting_key = f'module_disabled_{module_id}'
    setting = Setting.query.get(setting_key)
    
    val = 'false' if enabled else 'true'
    
    if setting:
        setting.value = val
    else:
        setting = Setting(key=setting_key, value=val)
        db.session.add(setting)
        
    db.session.commit()
    return jsonify({'success': True, 'module_id': module_id, 'enabled': enabled})


@app.route('/api/admin/integrations', methods=['GET'])
@admin_required
def admin_get_integrations():
    from homy.integration_disable import get_disabled_integration_ids
    from homy.integration_manager import get_integration_manager

    mgr = get_integration_manager()
    if not mgr:
        return jsonify([])

    disabled = set(get_disabled_integration_ids())
    out = []
    for iid, item in mgr.integrations.items():
        info = item['info'].copy()
        info['enabled'] = iid not in disabled
        out.append(info)
    out.sort(key=lambda x: (x.get('name') or x.get('id', '')).lower())
    return jsonify(out)


@app.route('/api/admin/integrations/toggle', methods=['POST'])
@admin_required
def admin_toggle_integration():
    from homy.integration_disable import set_integration_enabled
    from homy.integration_manager import get_integration_manager

    data = request.get_json() or {}
    integration_id = data.get('integration_id')
    enabled = data.get('enabled')

    if not integration_id or enabled is None:
        return jsonify({'error': 'Bad Request', 'message': 'integration_id and enabled required'}), 400

    mgr = get_integration_manager()
    if not mgr or integration_id not in mgr.integrations:
        return jsonify({'error': 'Not Found', 'message': 'Integration not found'}), 404

    set_integration_enabled(integration_id, bool(enabled))
    log_activity(
        'integration_toggle',
        f"Integration '{integration_id}' {'aktiviert' if enabled else 'deaktiviert'}",
    )
    return jsonify({'success': True, 'integration_id': integration_id, 'enabled': bool(enabled)})


@app.route('/api/admin/health/thresholds', methods=['GET'])
@admin_required
def admin_get_health_thresholds():
    from homy.health_thresholds import DEFAULT_THRESHOLDS, get_health_thresholds

    return jsonify({
        'thresholds': get_health_thresholds(),
        'schema': DEFAULT_THRESHOLDS,
    })


@app.route('/api/admin/health/thresholds', methods=['POST'])
@admin_required
def admin_save_health_thresholds():
    from homy.health_thresholds import save_health_thresholds

    data = request.get_json() or {}
    thresholds = data.get('thresholds', data)
    saved = save_health_thresholds(thresholds)
    log_activity('health_thresholds', 'System-Health-Grenzwerte aktualisiert')
    return jsonify({'success': True, 'thresholds': saved})


@app.route('/api/admin/users', methods=['GET'])
@admin_required
def admin_get_users():
    users = User.query.all()
    return jsonify([u.to_dict() for u in users])

@app.route('/api/admin/users', methods=['POST'])
@admin_required
def admin_create_user():
    data = request.get_json() or {}
    username = data.get('username')
    password = data.get('password')
    role = data.get('role', 'user')
    
    if not username or not password:
        return jsonify({'error': 'Bad Request', 'message': 'Username and password required'}), 400
        
    existing = User.query.filter_by(username=username).first()
    if existing:
        return jsonify({'error': 'Conflict', 'message': 'Username already exists'}), 409

    from homy.admin_settings import validate_password, DEFAULT_USER_ROLE, get_setting_raw

    pwd_err = validate_password(password)
    if pwd_err:
        return jsonify({'error': 'Bad Request', 'message': pwd_err}), 400

    if not role:
        role = get_setting_raw(DEFAULT_USER_ROLE, 'user') or 'user'

    from werkzeug.security import generate_password_hash
    new_user = User(
        username=username,
        password_hash=generate_password_hash(password),
        role=role,
    )
    db.session.add(new_user)
    db.session.commit()
    log_activity('user_create', f"Benutzer '{username}' angelegt (Rolle: {role}).")

    return jsonify(new_user.to_dict()), 201

@app.route('/api/admin/users/<int:user_id>', methods=['PUT'])
@admin_required
def admin_update_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Not Found', 'message': 'User not found'}), 404
        
    data = request.get_json() or {}
    role = data.get('role')
    password = data.get('password')

    old_role = user.role
    if role:
        if user.id == session.get('user_id') and role != 'admin':
            return jsonify({'error': 'Forbidden', 'message': 'You cannot demote yourself'}), 403
        user.role = role
        
    if password and password.strip() and password.strip() != '********':
        from homy.admin_settings import validate_password
        from werkzeug.security import generate_password_hash

        pwd_err = validate_password(password.strip())
        if pwd_err:
            return jsonify({'error': 'Bad Request', 'message': pwd_err}), 400
        user.password_hash = generate_password_hash(password.strip())
        log_activity('user_password', f"Passwort für '{user.username}' zurückgesetzt/geändert.")

    if 'is_locked' in data:
        new_locked = bool(data.get('is_locked'))
        if user.is_locked != new_locked:
            user.is_locked = new_locked
            action = 'gesperrt' if new_locked else 'entsperrt'
            log_activity('user_lock', f"Benutzer '{user.username}' wurde {action}.")

    db.session.commit()
    if role and role != old_role:
        log_activity('user_role', f"Rolle von '{user.username}' geändert: '{old_role}' → '{user.role}'.")
    return jsonify(user.to_dict())

@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def admin_delete_user(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Not Found', 'message': 'User not found'}), 404
        
    if user.id == session.get('user_id'):
        return jsonify({'error': 'Forbidden', 'message': 'You cannot delete yourself'}), 403
        
    uname = user.username
    db.session.delete(user)
    db.session.commit()
    log_activity('user_delete', f"Benutzer '{uname}' gelöscht.")
    return jsonify({'success': True})


# --- Admin config, system, backup, notifications ---

AUDIT_CATEGORIES = {
    'login': ('login', 'logout'),
    'user': ('user_create', 'user_delete', 'user_lock', 'user_role', 'user_password'),
    'config': (
        'layout_import', 'layout_export', 'layout_lock_toggle', 'tabs_update',
        'settings_update', 'module_toggle',
    ),
    'api': ('cache_clear', 'asset_upload', 'asset_delete', 'package_install'),
}


@app.route('/api/admin/system', methods=['GET'])
@admin_required
def admin_system_info():
    from homy.admin_settings import system_info
    return jsonify(system_info())


@app.route('/api/admin/health', methods=['GET'])
@admin_required
def admin_system_health():
    from homy.system_health import get_system_health
    return jsonify(get_system_health())


@app.route('/api/admin/config', methods=['GET'])
@admin_required
def admin_get_config():
    from homy.admin_settings import settings_dict_for_admin, ADMIN_GROUPS
    return jsonify({
        'settings': settings_dict_for_admin(),
        'groups': ADMIN_GROUPS,
    })


@app.route('/api/admin/config', methods=['POST'])
@admin_required
def admin_save_config():
    from homy.admin_settings import save_admin_settings

    data = request.get_json() or {}
    changed = save_admin_settings(data)
    if changed:
        log_activity('settings_update', f"Einstellungen aktualisiert: {', '.join(changed[:8])}" +
                     ('…' if len(changed) > 8 else ''))
    return jsonify({'success': True, 'changed': changed})


@app.route('/api/branding/logo', methods=['GET'])
def serve_branding_logo():
    from flask import send_file
    from homy.asset_service import find_site_logo_path

    path = find_site_logo_path()
    if not path:
        return jsonify({'error': 'Not Found'}), 404
    return send_file(path, max_age=3600)


@app.route('/api/admin/site-logo', methods=['POST'])
@admin_required
def admin_upload_site_logo():
    from homy.asset_service import save_site_logo

    if 'file' not in request.files:
        return jsonify({'error': 'Bad Request', 'message': 'Keine Datei'}), 400
    url, err, code = save_site_logo(request.files['file'])
    if err:
        return jsonify({'error': 'Upload failed', 'message': err}), code
    log_activity('site_logo_upload', 'Site-Logo hochgeladen')
    return jsonify({'success': True, 'site_logo_url': url})


@app.route('/api/admin/site-logo', methods=['DELETE'])
@admin_required
def admin_delete_site_logo():
    from homy.asset_service import clear_site_logo_files

    clear_site_logo_files()
    log_activity('site_logo_delete', 'Site-Logo entfernt')
    return jsonify({'success': True})


@app.route('/api/admin/backup/settings', methods=['GET'])
@admin_required
def admin_backup_settings():
    from homy.admin_settings import settings_dict_for_admin
    from datetime import datetime, timezone

    return jsonify({
        'version': '1.0',
        'exported_at': datetime.now(timezone.utc).isoformat(),
        'settings': settings_dict_for_admin(),
    })


@app.route('/api/admin/backup/audit', methods=['GET'])
@admin_required
def admin_backup_audit():
    from homy.admin_settings import get_setting_int, AUDIT_LOG_LIMIT
    from datetime import datetime, timezone

    limit = get_setting_int(AUDIT_LOG_LIMIT, 500, 10, 5000)
    logs = AuditLog.query.order_by(AuditLog.timestamp.desc()).limit(limit).all()
    return jsonify({
        'version': '1.0',
        'exported_at': datetime.now(timezone.utc).isoformat(),
        'logs': [l.to_dict() for l in logs],
    })


@app.route('/api/admin/backup/full', methods=['GET'])
@admin_required
def admin_backup_full():
    from flask import send_file
    import io
    from homy.backup_service import create_full_backup

    data, filename = create_full_backup()
    log_activity('backup_export', 'Vollständiges Backup erstellt.')
    return send_file(
        io.BytesIO(data),
        mimetype='application/zip',
        as_attachment=True,
        download_name=filename,
    )


@app.route('/api/admin/backup/restore', methods=['POST'])
@admin_required
def admin_backup_restore():
    from homy.backup_service import restore_full_backup

    f = request.files.get('file')
    if not f:
        return jsonify({'error': 'Bad Request', 'message': 'Keine Datei hochgeladen'}), 400
    try:
        summary = restore_full_backup(f.read())
        log_activity('backup_restore', f"Backup eingespielt: {summary}")
        return jsonify({'success': True, 'summary': summary})
    except Exception as e:
        return jsonify({'error': 'Bad Request', 'message': str(e)}), 400


@app.route('/api/admin/groups', methods=['GET'])
@admin_required
def admin_list_groups():
    return jsonify([g.to_dict() for g in Group.query.order_by(Group.name).all()])


@app.route('/api/admin/groups', methods=['POST'])
@admin_required
def admin_create_group():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Bad Request', 'message': 'Name erforderlich'}), 400
    if Group.query.filter_by(name=name).first():
        return jsonify({'error': 'Conflict', 'message': 'Gruppe existiert bereits'}), 409
    group = Group(
        name=name,
        description=data.get('description', ''),
        default_role=data.get('default_role', 'user'),
    )
    db.session.add(group)
    db.session.commit()
    log_activity('group_create', f"Gruppe '{name}' erstellt.")
    return jsonify(group.to_dict()), 201


@app.route('/api/admin/groups/<int:group_id>', methods=['PUT'])
@admin_required
def admin_update_group(group_id):
    group = Group.query.get(group_id)
    if not group:
        return jsonify({'error': 'Not Found'}), 404
    data = request.get_json() or {}
    if 'name' in data and data['name']:
        group.name = data['name'].strip()
    if 'description' in data:
        group.description = data['description']
    if 'default_role' in data:
        group.default_role = data['default_role']
    db.session.commit()
    return jsonify(group.to_dict())


@app.route('/api/admin/groups/<int:group_id>', methods=['DELETE'])
@admin_required
def admin_delete_group(group_id):
    group = Group.query.get(group_id)
    if not group:
        return jsonify({'error': 'Not Found'}), 404
    name = group.name
    UserGroup.query.filter_by(group_id=group_id).delete()
    db.session.delete(group)
    db.session.commit()
    log_activity('group_delete', f"Gruppe '{name}' gelöscht.")
    return jsonify({'success': True})


@app.route('/api/admin/users/<int:user_id>/groups', methods=['PUT'])
@admin_required
def admin_set_user_groups(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'Not Found'}), 404
    data = request.get_json() or {}
    group_ids = data.get('group_ids', [])
    UserGroup.query.filter_by(user_id=user_id).delete()
    for gid in group_ids:
        if Group.query.get(gid):
            db.session.add(UserGroup(user_id=user_id, group_id=gid))
    db.session.commit()
    return jsonify(user.to_dict(include_groups=True))


@app.route('/api/admin/jobs', methods=['GET'])
@admin_required
def admin_list_jobs():
    from homy.scheduler_service import scheduler_status
    limit = min(100, int(request.args.get('limit', 50) or 50))
    jobs = BackgroundJob.query.order_by(BackgroundJob.id.desc()).limit(limit).all()
    return jsonify({
        'scheduler': scheduler_status(),
        'jobs': [j.to_dict() for j in jobs],
    })


@app.route('/api/admin/jobs', methods=['POST'])
@admin_required
def admin_enqueue_job():
    from homy.jobs import enqueue_job
    data = request.get_json() or {}
    job_type = data.get('job_type')
    if not job_type:
        return jsonify({'error': 'Bad Request', 'message': 'job_type erforderlich'}), 400
    job = enqueue_job(job_type, payload=data.get('payload'), priority=int(data.get('priority', 0)))
    return jsonify(job.to_dict()), 201


@app.route('/api/admin/test/smtp', methods=['POST'])
@admin_required
def admin_test_smtp():
    from homy.admin_settings import (
        SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_TLS,
        get_setting_raw,
    )

    data = request.get_json() or {}
    host = (data.get('host') or get_setting_raw(SMTP_HOST, '')).strip()
    port = int(data.get('port') or get_setting_raw(SMTP_PORT, '587') or 587)
    user = (data.get('user') or get_setting_raw(SMTP_USER, '')).strip()
    password = data.get('password') or get_setting_raw(SMTP_PASSWORD, '')
    if password == '********':
        password = get_setting_raw(SMTP_PASSWORD, '')
    use_tls = str(data.get('tls', get_setting_raw(SMTP_TLS, 'true'))).lower() in ('1', 'true', 'yes')

    if not host:
        return jsonify({'ok': False, 'message': 'SMTP-Host fehlt.'}), 400

    try:
        import smtplib
        if use_tls:
            server = smtplib.SMTP(host, port, timeout=10)
            server.starttls()
        else:
            server = smtplib.SMTP(host, port, timeout=10)
        if user:
            server.login(user, password or '')
        server.quit()
        return jsonify({'ok': True, 'message': 'SMTP-Verbindung erfolgreich.'})
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 502


@app.route('/api/admin/test/weather', methods=['POST'])
@admin_required
def admin_test_weather():
    from homy.admin_settings import GLOBAL_WEATHER_KEY, get_setting_raw
    import requests as http_requests

    data = request.get_json() or {}
    api_key = data.get('api_key') or get_setting_raw(GLOBAL_WEATHER_KEY, '')
    if api_key == '********':
        api_key = get_setting_raw(GLOBAL_WEATHER_KEY, '')
    if not api_key:
        return jsonify({'ok': False, 'message': 'API-Key fehlt.'}), 400
    try:
        r = http_requests.get(
            'https://api.openweathermap.org/data/2.5/weather',
            params={'q': 'Berlin', 'appid': api_key, 'units': 'metric'},
            timeout=10,
        )
        if r.status_code == 200:
            return jsonify({'ok': True, 'message': 'OpenWeather API erreichbar.'})
        return jsonify({'ok': False, 'message': f'HTTP {r.status_code}: {r.text[:120]}'}), 502
    except Exception as e:
        return jsonify({'ok': False, 'message': str(e)}), 502


@app.route('/api/user/profile', methods=['GET'])
@login_required
def user_get_profile():
    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({'error': 'Not Found'}), 404
    from homy.admin_settings import get_user_preferences
    return jsonify({
        'user': user.to_dict(),
        'preferences': get_user_preferences(user.id),
    })


@app.route('/api/user/profile', methods=['PUT'])
@login_required
def user_update_profile():
    from homy.admin_settings import save_user_preferences

    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({'error': 'Not Found'}), 404
    data = request.get_json() or {}

    if 'display_name' in data:
        user.display_name = (data.get('display_name') or '').strip()[:120] or None
    if 'email' in data:
        email = (data.get('email') or '').strip()
        user.email = email[:255] if email else None
    if 'profile_asset_id' in data:
        raw = data.get('profile_asset_id')
        if raw in (None, '', 0, '0'):
            user.profile_asset_id = None
        else:
            try:
                aid = int(raw)
                asset = UserAsset.query.get(aid)
                if asset and asset.category in ('avatar', 'icon') and (
                    asset.user_id == user.id or asset.user_id is None
                ):
                    user.profile_asset_id = aid
            except (TypeError, ValueError):
                pass

    prefs_patch = {}
    if 'custom_theme' in data:
        prefs_patch['custom_theme'] = data.get('custom_theme')
    if 'sidebar_collapsed' in data:
        prefs_patch['sidebar_collapsed'] = bool(data.get('sidebar_collapsed'))
    from homy.admin_settings import get_user_preferences

    prefs = save_user_preferences(user.id, prefs_patch) if prefs_patch else get_user_preferences(user.id)

    db.session.commit()
    session['username'] = user.username
    log_activity('profile_update', f"Profil '{user.username}' aktualisiert.")
    return jsonify({
        'success': True,
        'user': user.to_dict(),
        'preferences': get_user_preferences(user.id),
    })


@app.route('/api/user/password', methods=['PUT'])
@login_required
def user_change_password():
    from homy.admin_settings import validate_password
    from werkzeug.security import generate_password_hash

    user = User.query.get(session['user_id'])
    if not user:
        return jsonify({'error': 'Not Found'}), 404
    if (user.auth_provider or 'local') != 'local':
        return jsonify({'error': 'Forbidden', 'message_key': 'profile_password_external'}), 403

    data = request.get_json() or {}
    current = data.get('current_password', '')
    new_pwd = data.get('new_password', '')
    from homy.auth import verify_local_password
    if not verify_local_password(user.username, current):
        return jsonify({'error': 'Unauthorized', 'message_key': 'profile_password_wrong'}), 401
    err = validate_password(new_pwd)
    if err:
        return jsonify({'error': 'Bad Request', 'message': err}), 400
    user.password_hash = generate_password_hash(new_pwd)
    db.session.commit()
    log_activity('password_change', f"Passwort für '{user.username}' geändert.")
    return jsonify({'success': True, 'message_key': 'profile_password_changed'})


@app.route('/api/user/preferences', methods=['GET'])
@login_required
def user_get_preferences():
    from homy.admin_settings import get_user_preferences
    return jsonify(get_user_preferences(session['user_id']))


@app.route('/api/user/preferences', methods=['POST'])
@login_required
def user_save_preferences():
    from homy.admin_settings import save_user_preferences
    data = request.get_json() or {}
    saved = save_user_preferences(session['user_id'], data)
    return jsonify({'success': True, 'preferences': saved})


@app.route('/api/user/notifications', methods=['GET'])
@login_required
def user_get_notifications():
    from homy.admin_settings import get_user_notifications
    return jsonify(get_user_notifications(session['user_id']))


@app.route('/api/user/notifications', methods=['POST'])
@login_required
def user_save_notifications():
    from homy.admin_settings import save_user_notifications

    data = request.get_json() or {}
    saved = save_user_notifications(session['user_id'], data)
    log_activity('notify_update', f"Benachrichtigungen für '{session.get('username')}' aktualisiert.")
    return jsonify({'success': True, 'notifications': saved})


@app.route('/api/user/notifications/test', methods=['POST'])
@login_required
def user_test_notification():
    from homy.notification_service import send_test_notification

    data = request.get_json() or {}
    channel = data.get('channel', '')
    config = data.get('config', {})
    if not channel:
        return jsonify({'error': 'Bad Request', 'message': 'channel erforderlich'}), 400
    ok, detail = send_test_notification(session['user_id'], channel, config)
    if not ok:
        return jsonify({'ok': False, 'message': detail}), 502
    return jsonify({'ok': True, 'message': detail})


# --- Integrations API ---

@app.route('/api/integrations/types', methods=['GET'])
def get_integration_types():
    from homy.integration_disable import get_disabled_integration_ids
    from homy.integration_service import (
        INTEGRATION_TYPES,
        LEGACY_INTEGRATION_TYPE_ALIASES,
    )

    disabled = set(get_disabled_integration_ids())
    types = []
    for tid, tdef in INTEGRATION_TYPES.items():
        if tid in LEGACY_INTEGRATION_TYPE_ALIASES:
            continue
        if tid in disabled:
            continue
        types.append({
            'id': tid,
            'name': tdef['name'],
            'icon': tdef.get('icon', 'plug'),
            'fields': tdef.get('fields', {}),
            'metrics': tdef.get('metrics', []),
            'widget_endpoints': tdef.get('widget_endpoints', []),
            'default_widget_endpoint': tdef.get('default_widget_endpoint', ''),
            'default_language': tdef.get('default_language', 'enUS'),
            'lang_files': tdef.get('lang_files', {}),
        })
    return jsonify(types)


def _integration_query_scope(*, enabled_only=False):
    """Integrations visible to the current session (own + global; guests: global only)."""
    from sqlalchemy import or_

    user_id = session.get('user_id')
    q = Integration.query
    if enabled_only:
        q = q.filter_by(enabled=True)
    if user_id:
        return q.filter(or_(Integration.user_id == user_id, Integration.user_id.is_(None)))
    return q.filter(Integration.user_id.is_(None))


@app.route('/api/integrations', methods=['GET'])
@login_required
def list_integrations():
    from homy.integration_service import get_integration_type_def
    items = _integration_query_scope(enabled_only=True).order_by(Integration.name).all()
    return jsonify([{
        **i.to_dict(),
        'type_name': get_integration_type_def(i.type).get('name', i.type),
    } for i in items])


@app.route('/api/integrations', methods=['POST'])
@login_required
def create_integration():
    from homy.integration_service import (
        INTEGRATION_TYPES,
        canonical_integration_type,
        integration_vault_key,
    )
    data = request.get_json() or {}
    itype = canonical_integration_type(data.get('type'))
    if itype not in INTEGRATION_TYPES:
        return jsonify({'error': 'Bad Request', 'message': 'Ungültiger Typ'}), 400
    from homy.integration_disable import is_integration_enabled

    if not is_integration_enabled(itype):
        return jsonify({'error': 'Bad Request', 'message': 'Integrationstyp ist deaktiviert'}), 400

    is_global = data.get('is_global', False)
    if is_global and session.get('role') != 'admin':
        return jsonify({'error': 'Forbidden', 'message': 'Nur Admins können globale Integrationen anlegen'}), 403

    config = data.get('config', {})
    type_fields = INTEGRATION_TYPES[itype].get('fields', {})
    for fname, finfo in type_fields.items():
        if finfo.get('type') == 'password' and fname in config and config[fname] and config[fname] != '********':
            pass

    integration = Integration(
        name=data.get('name', INTEGRATION_TYPES[itype]['name']),
        type=itype,
        user_id=None if is_global else session['user_id'],
        enabled=True,
    )
    db.session.add(integration)
    db.session.flush()

    for fname, finfo in type_fields.items():
        if finfo.get('type') == 'password' and fname in config:
            val = config[fname]
            if val and val != '********':
                db.session.add(Setting(key=integration_vault_key(integration.id, fname), value=val))
                config[fname] = '__VAULT_SECRET__'
    integration.config_json = json.dumps(config)
    db.session.commit()
    return jsonify(integration.to_dict()), 201


@app.route('/api/integrations/<int:integration_id>', methods=['PUT'])
@login_required
def update_integration(integration_id):
    from homy.integration_service import get_integration_type_def, integration_vault_key
    integration = Integration.query.get(integration_id)
    if not integration:
        return jsonify({'error': 'Not Found'}), 404
    if integration.user_id is None and session.get('role') != 'admin':
        return jsonify({'error': 'Forbidden'}), 403
    if integration.user_id and integration.user_id != session.get('user_id') and session.get('role') != 'admin':
        return jsonify({'error': 'Forbidden'}), 403

    data = request.get_json() or {}
    if 'name' in data:
        integration.name = data['name']
    if 'enabled' in data:
        integration.enabled = bool(data['enabled'])
    if 'config' in data:
        config = data['config']
        type_fields = get_integration_type_def(integration.type).get('fields', {})
        for fname, finfo in type_fields.items():
            if finfo.get('type') == 'password' and fname in config:
                val = config[fname]
                if val == '********':
                    config[fname] = '__VAULT_SECRET__'
                elif val:
                    key = integration_vault_key(integration.id, fname)
                    setting = db.session.get(Setting, key)
                    if setting:
                        setting.value = val
                    else:
                        db.session.add(Setting(key=key, value=val))
                    config[fname] = '__VAULT_SECRET__'
        integration.config_json = json.dumps(config)
    db.session.commit()
    return jsonify(integration.to_dict())


@app.route('/api/integrations/<int:integration_id>', methods=['DELETE'])
@login_required
def delete_integration(integration_id):
    from homy.integration_service import get_integration_type_def, integration_vault_key

    integration = Integration.query.get(integration_id)
    if not integration:
        return jsonify({'error': 'Not Found'}), 404
    if integration.user_id is None and session.get('role') != 'admin':
        return jsonify({'error': 'Forbidden'}), 403
    if integration.user_id and integration.user_id != session.get('user_id') and session.get('role') != 'admin':
        return jsonify({'error': 'Forbidden'}), 403

    type_def = get_integration_type_def(integration.type)
    for fname, finfo in type_def.get('fields', {}).items():
        if finfo.get('type') == 'password':
            setting = db.session.get(Setting, integration_vault_key(integration_id, fname))
            if setting:
                db.session.delete(setting)

    db.session.delete(integration)
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/integrations/<int:integration_id>/fetch', methods=['GET'])
def fetch_integration(integration_id):
    from homy.integration_service import fetch_integration_payload_with_overrides, get_nested_value
    integration = Integration.query.get(integration_id)
    if not integration or not integration.enabled:
        return jsonify({'error': 'Not Found'}), 404

    user_id = session.get('user_id')
    is_admin = session.get('role') == 'admin'
    if integration.user_id is not None and integration.user_id != user_id and not is_admin:
        return jsonify({'error': 'Forbidden'}), 403

    path = request.args.get('path', '')
    overrides = {}
    for key, value in request.args.items():
        if key.startswith('override_'):
            cfg_key = key[len('override_'):]
            if cfg_key:
                overrides[cfg_key] = value
    try:
        payload = fetch_integration_payload_with_overrides(integration, overrides=overrides)
        value = get_nested_value(payload, path) if path else payload
        return jsonify({'ok': True, 'value': value, 'payload': payload})
    except Exception as e:
        logger.warning(f"Integration fetch failed: {e}")
        return jsonify({'ok': False, 'message': str(e)}), 502


# --- Settings API ---

@app.route('/api/admin/cache/stats', methods=['GET'])
@admin_required
def admin_cache_stats():
    from homy.cache import widget_cache
    return jsonify(widget_cache.stats())


@app.route('/api/admin/cache/clear', methods=['POST'])
@admin_required
def admin_cache_clear():
    from homy.cache import widget_cache

    widget_cache.clear()
    log_activity('cache_clear', 'Widget-Cache geleert')
    return jsonify({'success': True, 'cache': widget_cache.stats()})


# Setting keys whose values must never be returned in clear text.
_SENSITIVE_SETTING_MARKERS = ('password', 'secret', 'token', 'key')


def _is_sensitive_setting(name):
    n = (name or '').lower()
    return n.endswith('_pass') or any(m in n for m in _SENSITIVE_SETTING_MARKERS)


@app.route('/api/settings', methods=['GET'])
def get_settings():
    settings = Setting.query.all()

    settings_dict = {}
    for s in settings:
        # Mask secrets (smtp_password, *_secret, *_token, *_pass, *key*) for everyone
        if _is_sensitive_setting(s.key):
            settings_dict[s.key] = '********' if s.value else ''
        else:
            settings_dict[s.key] = s.value

    return jsonify(settings_dict)

@app.route('/api/settings', methods=['POST'])
@admin_required
def save_settings():
    from homy.session_config import SETTING_KEY, clamp_session_days

    data = request.get_json() or {}
    for k, v in data.items():
        # Ignore masked placeholders echoed back for sensitive settings
        if _is_sensitive_setting(k) and (not v or v == '********'):
            continue
        if k == SETTING_KEY:
            v = str(clamp_session_days(v))
        setting = Setting.query.get(k)
        if setting:
            setting.value = str(v)
        else:
            setting = Setting(key=k, value=str(v))
            db.session.add(setting)
            
    db.session.commit()
    return jsonify({'success': True})


# --- Themes API & Static Assets ---

@app.route('/lang/<path:filename>')
def serve_app_lang(filename):
    lang_dir = os.path.join(app.root_path, 'lang')
    if not filename.endswith('.js'):
        return jsonify({'error': 'Not Found'}), 404
    return send_from_directory(lang_dir, filename)


@app.route('/themes/<theme_name>/<path:filename>')
def serve_theme_static(theme_name, filename):
    themes_dir = os.path.join(app.root_path, 'themes')
    theme_path = os.path.join(themes_dir, theme_name)
    return send_from_directory(theme_path, filename)

@app.route('/api/themes', methods=['GET'])
def get_themes():
    themes_dir = os.path.join(app.root_path, 'themes')
    themes_list = []
    
    if os.path.exists(themes_dir):
        import configparser
        for entry in os.scandir(themes_dir):
            if entry.is_dir() and not entry.name.startswith('_'):
                theme_id = entry.name
                info_file = os.path.join(entry.path, 'info.cfg')
                
                # Parse info.cfg if exists
                name = theme_id.capitalize()
                author = 'System'
                description = ''
                
                if os.path.exists(info_file):
                    try:
                        config = configparser.ConfigParser()
                        config.read(info_file, encoding='utf-8')
                        if 'info' in config:
                            name = config.get('info', 'name', fallback=name)
                            author = config.get('info', 'author', fallback=author)
                            description = config.get('info', 'description', fallback=description)
                    except Exception as e:
                        logger.error(f"Failed to parse theme info.cfg for {theme_id}: {e}")
                
                css_file = f'/themes/{theme_id}/{theme_id}.css'
                js_file = f'/themes/{theme_id}/{theme_id}.js'
                
                # Check if files exist to avoid broken refs
                has_css = os.path.exists(os.path.join(entry.path, f'{theme_id}.css'))
                has_js = os.path.exists(os.path.join(entry.path, f'{theme_id}.js'))
                
                themes_list.append({
                    'id': theme_id,
                    'name': name,
                    'author': author,
                    'description': description,
                    'css_file': css_file if has_css else None,
                    'js_file': js_file if has_js else None
                })

    themes_list.append({
        'id': 'custom',
        'name': 'Custom',
        'author': 'User',
        'description': 'Personal colors stored in your account',
        'css_file': None,
        'js_file': None,
    })

    return jsonify(themes_list)


# --- Layout Lock Admin API ---

@app.route('/api/admin/layout-lock', methods=['GET'])
def get_layout_lock():
    setting = db.session.get(Setting, 'global_layout_locked')
    locked = (setting.value == 'true') if setting else False
    return jsonify({'locked': locked})

@app.route('/api/admin/layout-lock', methods=['POST'])
@admin_required
def set_layout_lock():
    data = request.get_json() or {}
    locked = bool(data.get('locked', False))
    
    setting = db.session.get(Setting, 'global_layout_locked')
    if setting:
        setting.value = 'true' if locked else 'false'
    else:
        setting = Setting(key='global_layout_locked', value='true' if locked else 'false')
        db.session.add(setting)
        
    log_activity('layout_lock_toggle', f"Layout-Sperre wurde {'aktiviert' if locked else 'deaktiviert'}.")
    db.session.commit()
    return jsonify({'success': True, 'locked': locked})

# --- Audit Logs Admin API ---

@app.route('/api/admin/audit-logs', methods=['GET'])
@admin_required
def get_audit_logs():
    from homy.admin_settings import get_setting_int, AUDIT_LOG_LIMIT
    from homy.database import User

    username = (request.args.get('username') or '').strip()
    event_type = (request.args.get('event_type') or '').strip()
    try:
        limit = int(request.args.get('limit', 0) or 0)
    except (TypeError, ValueError):
        limit = 0
    if limit <= 0:
        limit = get_setting_int(AUDIT_LOG_LIMIT, 200, 10, 1000)
    limit = max(10, min(1000, limit))

    query = AuditLog.query
    if username and username != '__all__':
        query = query.filter(AuditLog.username == username)
    if event_type and event_type != '__all__':
        query = query.filter(AuditLog.event_type == event_type)

    category = (request.args.get('category') or '').strip()
    if category and category != '__all__' and category in AUDIT_CATEGORIES:
        types = AUDIT_CATEGORIES[category]
        query = query.filter(AuditLog.event_type.in_(types))

    logs = query.order_by(AuditLog.timestamp.desc()).limit(limit).all()
    usernames = sorted({
        u.username for u in User.query.with_entities(User.username).all() if u.username
    })
    event_types = sorted({
        row[0] for row in db.session.query(AuditLog.event_type).distinct().all() if row[0]
    })
    return jsonify({
        'logs': [l.to_dict() for l in logs],
        'usernames': usernames,
        'event_types': event_types,
        'limit': limit,
    })


@app.route('/api/admin/stats', methods=['GET'])
@admin_required
def admin_stats():
    from homy.cache import widget_cache

    user_count = User.query.count()
    widget_count = WidgetInstance.query.count()
    integration_count = Integration.query.count()
    audit_count = AuditLog.query.count()
    module_count = len(module_manager.modules)
    enabled_modules = sum(1 for m in module_manager.modules.values() if m.get('enabled', True))

    return jsonify({
        'users': user_count,
        'widgets': widget_count,
        'integrations': integration_count,
        'audit_logs': audit_count,
        'modules_total': module_count,
        'modules_enabled': enabled_modules,
        'cache': widget_cache.stats(),
    })


# --- Main Command Entry Point ---

def _waitress_thread_count():
    """Worker threads for Waitress (parallel HTTP requests)."""
    try:
        n = int(os.environ.get('WAITRESS_THREADS', '8'))
    except ValueError:
        n = 8
    return max(1, min(n, 64))


def _configure_waitress_logging():
    """Waitress logs queue depth ≥1 as WARNING; that is normal for SPA-style parallel API calls."""
    level_name = os.environ.get('WAITRESS_QUEUE_LOG', 'ERROR').strip().upper()
    level = getattr(logging, level_name, logging.ERROR)
    logging.getLogger('waitress.queue').setLevel(level)


def _parse_cli():
    import argparse
    parser = argparse.ArgumentParser(
        prog='homy',
        description='Homy dashboard',
    )
    parser.add_argument(
        '--debug',
        action='store_true',
        help='Verbose logging to terminal (favicon cache, modules, HTTP)',
    )
    parser.add_argument('-p', '--port', type=int, default=None, dest='port', help='Listen port (default: 8080)')
    parser.add_argument('--host', default=None, help='Listen host (default: 0.0.0.0)')
    parser.add_argument(
        '--dev',
        action='store_true',
        help='Flask development server (hot reload, browser debugger)',
    )
    parser.add_argument(
        '-rP', '--reset-password',
        dest='reset_password',
        metavar='USERNAME',
        help='Reset a local user password (CLI only, then exit)',
    )
    return parser.parse_args()


def main():
    args = _parse_cli()

    if args.reset_password:
        from homy.cli_admin import reset_password_interactive
        raise SystemExit(reset_password_interactive(args.reset_password))

    if args.debug:
        from homy.debug_config import enable_debug
        enable_debug()

    port = args.port or int(os.environ.get('PORT', 8080))
    host = args.host or os.environ.get('HOST', '0.0.0.0')
    env = os.environ.get('FLASK_ENV', 'production').strip().lower()

    if args.dev or env == 'development':
        logger.info('Starting Flask dev server on %s:%s (debug=%s)', host, port, args.debug)
        app.run(host=host, port=port, debug=args.debug or env == 'development')
        return

    from waitress import serve

    _configure_waitress_logging()
    threads = _waitress_thread_count()
    logger.info('Starting Waitress on %s:%s (threads=%s, debug=%s)', host, port, threads, args.debug)
    serve(app, host=host, port=port, threads=threads)


if __name__ == '__main__':
    main()
