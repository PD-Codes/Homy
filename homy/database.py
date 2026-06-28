import os
import json
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='user')  # 'admin' or 'user'
    is_locked = db.Column(db.Boolean, nullable=False, default=False)
    email = db.Column(db.String(255), nullable=True)
    auth_provider = db.Column(db.String(30), nullable=True)  # local, ldap, oidc, saml
    external_id = db.Column(db.String(255), nullable=True, index=True)
    mfa_secret = db.Column(db.String(64), nullable=True)
    mfa_enabled = db.Column(db.Boolean, nullable=False, default=False)
    display_name = db.Column(db.String(120), nullable=True)
    profile_asset_id = db.Column(db.Integer, nullable=True)

    def to_dict(self, include_groups=False):
        data = {
            'id': self.id,
            'username': self.username,
            'display_name': self.display_name or '',
            'role': self.role,
            'is_locked': bool(self.is_locked),
            'email': self.email or '',
            'auth_provider': self.auth_provider or 'local',
            'mfa_enabled': bool(self.mfa_enabled),
            'profile_asset_id': self.profile_asset_id,
        }
        if include_groups:
            from sqlalchemy import select
            stmt = (
                select(Group.name)
                .join(UserGroup, UserGroup.group_id == Group.id)
                .where(UserGroup.user_id == self.id)
            )
            data['groups'] = [row[0] for row in db.session.execute(stmt).all()]
        return data


class Group(db.Model):
    __tablename__ = 'groups'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), unique=True, nullable=False, index=True)
    description = db.Column(db.String(255), nullable=True)
    default_role = db.Column(db.String(20), nullable=False, default='user')

    def to_dict(self):
        member_count = UserGroup.query.filter_by(group_id=self.id).count()
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description or '',
            'default_role': self.default_role,
            'member_count': member_count,
        }


class UserGroup(db.Model):
    __tablename__ = 'user_groups'

    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id', ondelete='CASCADE'), primary_key=True)


class BackgroundJob(db.Model):
    __tablename__ = 'background_jobs'

    id = db.Column(db.Integer, primary_key=True)
    job_type = db.Column(db.String(50), nullable=False)
    payload_json = db.Column(db.Text, nullable=False, default='{}')
    status = db.Column(db.String(20), nullable=False, default='pending')  # pending, running, done, failed
    priority = db.Column(db.Integer, nullable=False, default=0)
    scheduled_at = db.Column(db.DateTime, nullable=True)
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=db.func.now())

    def to_dict(self):
        return {
            'id': self.id,
            'job_type': self.job_type,
            'payload': self._parse_payload(),
            'status': self.status,
            'priority': self.priority,
            'scheduled_at': self._iso(self.scheduled_at),
            'started_at': self._iso(self.started_at),
            'completed_at': self._iso(self.completed_at),
            'error_message': self.error_message,
            'created_at': self._iso(self.created_at),
        }

    def _parse_payload(self):
        try:
            return json.loads(self.payload_json or '{}')
        except Exception:
            return {}

    @staticmethod
    def _iso(dt):
        return dt.isoformat() + 'Z' if dt else None

class WidgetInstance(db.Model):
    __tablename__ = 'widgets'
    
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=True) # Null represents public layout
    module = db.Column(db.String(50), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    title = db.Column(db.String(100), nullable=True)
    col = db.Column(db.Integer, nullable=False)
    row = db.Column(db.Integer, nullable=False)
    size_x = db.Column(db.Integer, nullable=False)
    size_y = db.Column(db.Integer, nullable=False)
    config_json = db.Column(db.Text, nullable=False, default='{}')
    tab_id = db.Column(db.String(50), nullable=False, default='default')
    dashboard_layout = db.Column(db.String(20), nullable=False, default='desktop')

    @staticmethod
    def _parse_config_json(config_json):
        try:
            return json.loads(config_json)
        except Exception:
            return {}

    def resolve_config(self, vault_map=None):
        data = self._parse_config_json(self.config_json)
        from flask import has_app_context
        if not has_app_context():
            return data
        for k, v in list(data.items()):
            if v != '__VAULT_SECRET__':
                continue
            vault_key = f"vault_{self.id}_{k}"
            secret = None
            if vault_map is not None:
                secret = vault_map.get(vault_key)
            else:
                setting = db.session.get(Setting, vault_key)
                if setting and setting.value:
                    secret = setting.value
            if secret:
                data[k] = secret
            else:
                import logging
                logging.getLogger(__name__).warning(
                    'Vault secret missing for widget %s field %s (key=%s)',
                    self.id,
                    k,
                    vault_key,
                )
                data[k] = ''
        return data

    @property
    def config(self):
        return self.resolve_config()

    @config.setter
    def config(self, value):
        self.config_json = json.dumps(value)

    @classmethod
    def build_vault_map(cls, widgets):
        vault_keys = []
        for w in widgets:
            data = cls._parse_config_json(w.config_json)
            for k, v in data.items():
                if v == '__VAULT_SECRET__':
                    vault_keys.append(f"vault_{w.id}_{k}")
        if not vault_keys:
            return {}
        settings = Setting.query.filter(Setting.key.in_(vault_keys)).all()
        return {s.key: s.value for s in settings}

    def to_dict(self, vault_map=None):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'module': self.module,
            'type': self.type,
            'title': self.title,
            'col': self.col,
            'row': self.row,
            'size_x': self.size_x,
            'size_y': self.size_y,
            'config': self.resolve_config(vault_map),
            'tab_id': self.tab_id,
            'dashboard_layout': self.dashboard_layout or 'desktop',
        }

class FavoriteLink(db.Model):
    __tablename__ = 'favorites'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=True) # Null represents public favorites
    title = db.Column(db.String(100), nullable=False)
    url = db.Column(db.String(512), nullable=False)
    icon_type = db.Column(db.String(20), nullable=False, default='icon') # 'icon' (lucide/font class) or 'image' (url)
    icon_value = db.Column(db.String(255), nullable=True)
    category = db.Column(db.String(50), nullable=True, default='General')
    order = db.Column(db.Integer, nullable=False, default=0)
    is_private = db.Column(db.Boolean, nullable=False, default=False)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'url': self.url,
            'icon_type': self.icon_type,
            'icon_value': self.icon_value,
            'category': self.category,
            'order': self.order,
            'is_private': self.is_private
        }

class Integration(db.Model):
    __tablename__ = 'integrations'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    config_json = db.Column(db.Text, nullable=False, default='{}')
    enabled = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())

    def to_dict(self, mask_secrets=True):
        from homy.integration_service import resolve_integration_config, mask_integration_config
        cfg = resolve_integration_config(self) if not mask_secrets else mask_integration_config(self, resolve_integration_config(self))
        return {
            'id': self.id,
            'user_id': self.user_id,
            'name': self.name,
            'type': self.type,
            'config': cfg,
            'enabled': self.enabled,
            'is_global': self.user_id is None,
        }


class Setting(db.Model):
    __tablename__ = 'settings'
    
    key = db.Column(db.String(100), primary_key=True)
    value = db.Column(db.Text, nullable=True)

class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    
    id = db.Column(db.Integer, primary_key=True)
    timestamp = db.Column(db.DateTime, nullable=False, default=db.func.now())
    username = db.Column(db.String(80), nullable=True)
    event_type = db.Column(db.String(50), nullable=False)
    message = db.Column(db.String(255), nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'timestamp': self.timestamp.isoformat() + 'Z' if self.timestamp else '',
            'username': self.username or 'Gast/System',
            'event_type': self.event_type,
            'message': self.message
        }


class UserAsset(db.Model):
    __tablename__ = 'user_assets'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=True)
    category = db.Column(db.String(50), nullable=False, default='icon')
    stored_filename = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255), nullable=False)
    mime_type = db.Column(db.String(100), nullable=False)
    size_bytes = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())

    def to_dict(self, session_user=None):
        data = {
            'id': self.id,
            'category': self.category,
            'original_name': self.original_name,
            'mime_type': self.mime_type,
            'size_bytes': self.size_bytes,
            'url': f'/api/assets/{self.id}/file',
            'is_global': self.user_id is None,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else '',
        }
        if session_user:
            role = session_user.get('role')
            uid = session_user.get('user_id')
            data['can_edit'] = role == 'admin' or (uid and self.user_id == uid)
            data['can_global'] = role == 'admin'
            if role == 'admin':
                data['user_id'] = self.user_id
        return data


class PackageUpload(db.Model):
    __tablename__ = 'package_uploads'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=True)
    package_type = db.Column(db.String(50), nullable=False)
    stored_filename = db.Column(db.String(255), nullable=False)
    original_name = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(20), nullable=False, default='pending')
    validation_message = db.Column(db.Text, nullable=True)
    manifest_json = db.Column(db.Text, nullable=True)
    preview_filename = db.Column(db.String(255), nullable=True)
    size_bytes = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, server_default=db.func.now())

    def to_dict(self, include_owner=False):
        manifest = {}
        if self.manifest_json:
            try:
                manifest = json.loads(self.manifest_json)
            except Exception:
                manifest = {}
        data = {
            'id': self.id,
            'package_type': self.package_type,
            'original_name': self.original_name,
            'status': self.status,
            'validation_message': self.validation_message,
            'manifest': manifest,
            'preview_url': f'/api/packages/{self.id}/preview' if self.preview_filename else None,
            'size_bytes': self.size_bytes,
            'is_global': self.user_id is None,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else '',
        }
        if include_owner:
            data['user_id'] = self.user_id
        return data

def init_db(app):
    import sys
    is_testing = (
        'unittest' in sys.modules or 
        'pytest' in sys.modules or 
        os.environ.get('FLASK_ENV') == 'testing' or 
        app.config.get('TESTING')
    )
    
    if is_testing:
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    else:
        data_dir = os.environ.get(
            'DATA_DIR',
            os.path.join(os.path.expanduser('~'), '.homy'),
        )

        if not os.path.exists(data_dir):
            os.makedirs(data_dir, exist_ok=True)

        db_path = os.path.join(data_dir, 'homy.db')
        old_db = os.path.join(data_dir, 'dashboard.db')
        if not os.path.isfile(db_path) and os.path.isfile(old_db):
            os.rename(old_db, db_path)
        db_path = db_path.replace('\\', '/')
        app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
        
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    db.init_app(app)
    
    with app.app_context():
        db.create_all()
        
        # SQLite column migration for tab_id if database already exists
        try:
            db.session.execute(db.text("ALTER TABLE widgets ADD COLUMN tab_id VARCHAR(50) DEFAULT 'default' NOT NULL;"))
            db.session.commit()
        except Exception:
            db.session.rollback()

        try:
            db.session.execute(db.text(
                "ALTER TABLE widgets ADD COLUMN dashboard_layout VARCHAR(20) DEFAULT 'desktop' NOT NULL;"
            ))
            db.session.commit()
        except Exception:
            db.session.rollback()
            
        # SQLite column migration for is_private if database already exists
        try:
            db.session.execute(db.text("ALTER TABLE favorites ADD COLUMN is_private BOOLEAN DEFAULT 0 NOT NULL;"))
            db.session.commit()
        except Exception:
            db.session.rollback()

        try:
            db.session.execute(db.text("ALTER TABLE users ADD COLUMN is_locked BOOLEAN DEFAULT 0 NOT NULL;"))
            db.session.commit()
        except Exception:
            db.session.rollback()

        for col, ddl in (
            ('email', 'ALTER TABLE users ADD COLUMN email VARCHAR(255)'),
            ('auth_provider', 'ALTER TABLE users ADD COLUMN auth_provider VARCHAR(30)'),
            ('external_id', 'ALTER TABLE users ADD COLUMN external_id VARCHAR(255)'),
            ('mfa_secret', 'ALTER TABLE users ADD COLUMN mfa_secret VARCHAR(64)'),
            ('mfa_enabled', 'ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN DEFAULT 0 NOT NULL'),
            ('display_name', 'ALTER TABLE users ADD COLUMN display_name VARCHAR(120)'),
            ('profile_asset_id', 'ALTER TABLE users ADD COLUMN profile_asset_id INTEGER'),
        ):
            try:
                db.session.execute(db.text(ddl))
                db.session.commit()
            except Exception:
                db.session.rollback()

        for ddl in (
            "CREATE TABLE IF NOT EXISTS groups ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "name VARCHAR(80) NOT NULL UNIQUE, "
            "description VARCHAR(255), "
            "default_role VARCHAR(20) NOT NULL DEFAULT 'user')",
            "CREATE TABLE IF NOT EXISTS user_groups ("
            "user_id INTEGER NOT NULL, group_id INTEGER NOT NULL, "
            "PRIMARY KEY (user_id, group_id), "
            "FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, "
            "FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE CASCADE)",
            "CREATE TABLE IF NOT EXISTS background_jobs ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "job_type VARCHAR(50) NOT NULL, "
            "payload_json TEXT NOT NULL DEFAULT '{}', "
            "status VARCHAR(20) NOT NULL DEFAULT 'pending', "
            "priority INTEGER NOT NULL DEFAULT 0, "
            "scheduled_at DATETIME, started_at DATETIME, completed_at DATETIME, "
            "error_message TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
        ):
            try:
                db.session.execute(db.text(ddl))
                db.session.commit()
            except Exception:
                db.session.rollback()

        try:
            db.session.execute(db.text(
                "CREATE TABLE IF NOT EXISTS integrations ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                "user_id INTEGER, "
                "name VARCHAR(100) NOT NULL, "
                "type VARCHAR(50) NOT NULL, "
                "config_json TEXT NOT NULL DEFAULT '{}', "
                "enabled BOOLEAN NOT NULL DEFAULT 1, "
                "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)"
            ))
            db.session.commit()
        except Exception:
            db.session.rollback()

        for ddl in (
            "CREATE TABLE IF NOT EXISTS user_assets ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "user_id INTEGER, "
            "category VARCHAR(50) NOT NULL DEFAULT 'icon', "
            "stored_filename VARCHAR(255) NOT NULL, "
            "original_name VARCHAR(255) NOT NULL, "
            "mime_type VARCHAR(100) NOT NULL, "
            "size_bytes INTEGER NOT NULL DEFAULT 0, "
            "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
            "CREATE TABLE IF NOT EXISTS package_uploads ("
            "id INTEGER PRIMARY KEY AUTOINCREMENT, "
            "user_id INTEGER, "
            "package_type VARCHAR(50) NOT NULL, "
            "stored_filename VARCHAR(255) NOT NULL, "
            "original_name VARCHAR(255) NOT NULL, "
            "status VARCHAR(20) NOT NULL DEFAULT 'pending', "
            "validation_message TEXT, "
            "manifest_json TEXT, "
            "preview_filename VARCHAR(255), "
            "size_bytes INTEGER NOT NULL DEFAULT 0, "
            "created_at DATETIME DEFAULT CURRENT_TIMESTAMP)",
        ):
            try:
                db.session.execute(db.text(ddl))
                db.session.commit()
            except Exception:
                db.session.rollback()
            
        # Ensure default settings are populated
        theme_setting = Setting.query.filter_by(key='default_theme').first()
        if not theme_setting:
            db.session.add(Setting(key='default_theme', value='dark'))
            db.session.add(Setting(key='global_weather_key', value=''))
            db.session.add(Setting(key='session_cookie_days', value='7'))
            db.session.add(Setting(key='registration_enabled', value='false'))
            db.session.add(Setting(key='maintenance_mode', value='false'))
            db.session.add(Setting(key='site_title', value='Homy'))
            db.session.add(Setting(key='audit_log_limit', value='200'))
            db.session.commit()

        from homy.admin_settings import ensure_default_settings
        ensure_default_settings()

        try:
            user_count = User.query.count()
            if user_count == 0:
                import logging
                logging.getLogger(__name__).info(
                    'Homy database ready — no users yet; setup wizard will run on first visit.'
                )
        except Exception:
            pass
            
        # Startup migration for 24-column grid upgrade
        migrated_setting = Setting.query.filter_by(key='grid_resolution_migrated_24').first()
        if not migrated_setting:
            widgets = WidgetInstance.query.all()
            for w in widgets:
                w.col = w.col * 2
                w.row = w.row * 2
                w.size_x = w.size_x * 2
                w.size_y = w.size_y * 2
            db.session.add(Setting(key='grid_resolution_migrated_24', value='true'))
            db.session.commit()
