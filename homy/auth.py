from functools import wraps
from flask import session, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash
from homy.database import db, User


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Unauthorized', 'message': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Unauthorized', 'message': 'Authentication required'}), 401
        if session.get('role') != 'admin':
            return jsonify({'error': 'Forbidden', 'message': 'Admin privilege required'}), 403
        return f(*args, **kwargs)
    return decorated_function


def verify_local_password(username, password):
    user = User.query.filter_by(username=username).first()
    if not user:
        return None
    if getattr(user, 'is_locked', False):
        return None
    if check_password_hash(user.password_hash, password):
        return user
    return None


def establish_session(user):
    from flask import current_app
    from homy.session_config import apply_session_for_user

    session['user_id'] = user.id
    session['username'] = user.username
    session['role'] = user.role
    apply_session_for_user(current_app)
    return user


def check_login(username, password):
    """Verify password and establish session (legacy helper)."""
    user = verify_local_password(username, password)
    if user:
        return establish_session(user)
    return None


def is_user_locked(username):
    user = User.query.filter_by(username=username).first()
    return user is not None and bool(getattr(user, 'is_locked', False))


def logout():
    session.pop('user_id', None)
    session.pop('username', None)
    session.pop('role', None)
    session.pop('mfa_pending_user_id', None)


def register(username, password, role=None):
    from homy.admin_settings import DEFAULT_USER_ROLE, get_setting_raw, validate_password

    existing = User.query.filter_by(username=username).first()
    if existing:
        return None, "Username already exists"

    pwd_err = validate_password(password)
    if pwd_err:
        return None, pwd_err

    if role is None:
        role = get_setting_raw(DEFAULT_USER_ROLE, 'user') or 'user'
    if role not in ('admin', 'user'):
        role = 'user'

    hashed = generate_password_hash(password)
    user = User(username=username, password_hash=hashed, role=role, auth_provider='local')
    db.session.add(user)
    db.session.commit()
    return user, None
