"""Provision local users from external auth providers."""

from werkzeug.security import generate_password_hash
import secrets

from homy.database import db, User, Group, UserGroup
from homy.admin_settings import DEFAULT_USER_ROLE, get_setting_raw


def find_or_create_user(username, provider, external_id=None, email=None, role=None):
    user = None
    if external_id:
        user = User.query.filter_by(auth_provider=provider, external_id=external_id).first()
    if not user and username:
        user = User.query.filter_by(username=username).first()
    if user:
        if external_id and not user.external_id:
            user.external_id = external_id
        if provider and user.auth_provider in (None, 'local'):
            user.auth_provider = provider
        if email and not user.email:
            user.email = email
        if user.is_locked:
            return None, 'Konto ist gesperrt'
        db.session.commit()
        return user, None

    if not username:
        return None, 'Benutzername fehlt'

    if role is None:
        role = get_setting_raw(DEFAULT_USER_ROLE, 'user') or 'user'

    random_pwd = generate_password_hash(secrets.token_urlsafe(32))
    user = User(
        username=username,
        password_hash=random_pwd,
        role=role if role in ('admin', 'user') else 'user',
        auth_provider=provider,
        external_id=external_id,
        email=email,
    )
    db.session.add(user)
    db.session.commit()
    return user, None


def apply_group_memberships(user, group_names):
    if not group_names:
        return
    for name in group_names:
        name = (name or '').strip()
        if not name:
            continue
        group = Group.query.filter_by(name=name).first()
        if not group:
            group = Group(name=name, description=f'Auto-import ({user.auth_provider})')
            db.session.add(group)
            db.session.flush()
        if not UserGroup.query.filter_by(user_id=user.id, group_id=group.id).first():
            db.session.add(UserGroup(user_id=user.id, group_id=group.id))
            if group.default_role and user.role == 'user':
                user.role = group.default_role
    db.session.commit()
