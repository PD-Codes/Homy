"""Tests for admin settings and auth policy."""

import json
import unittest

from werkzeug.security import generate_password_hash

from homy.app import app
from homy.database import db, Setting, User
from homy.admin_settings import (
    REGISTRATION_ENABLED,
    MAINTENANCE_MODE,
    get_setting_bool,
    auth_policy,
)


class AdminSettingsTestCase(unittest.TestCase):
    def setUp(self):
        app.config['TESTING'] = True
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        app.config['SECRET_KEY'] = 'test_secret'
        self.client = app.test_client()
        with app.app_context():
            db.create_all()

    def tearDown(self):
        with app.app_context():
            db.session.remove()
            db.drop_all()

    def test_auth_status_includes_policy(self):
        res = self.client.get('/api/auth/status')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn('registration_enabled', data)
        self.assertIn('maintenance_mode', data)
        self.assertIn('site_title', data)
        self.assertFalse(data['registration_enabled'])

    def test_registration_blocked_when_disabled(self):
        res = self.client.post(
            '/api/auth/register',
            data=json.dumps({'username': 'newbie', 'password': 'secret123'}),
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 403)

    def test_registration_allowed_when_enabled(self):
        with app.app_context():
            db.session.add(Setting(key=REGISTRATION_ENABLED, value='true'))
            db.session.commit()
        res = self.client.post(
            '/api/auth/register',
            data=json.dumps({'username': 'newbie', 'password': 'secret123'}),
            content_type='application/json',
        )
        self.assertIn(res.status_code, (200, 201))
        self.assertTrue(res.get_json().get('success'))

    def test_maintenance_blocks_non_admin_login(self):
        with app.app_context():
            db.session.add(
                User(username='user1', password_hash=generate_password_hash('pass'), role='user')
            )
            db.session.add(Setting(key=MAINTENANCE_MODE, value='true'))
            db.session.commit()

        res = self.client.post(
            '/api/auth/login',
            data=json.dumps({'username': 'user1', 'password': 'pass'}),
            content_type='application/json',
        )
        self.assertEqual(res.status_code, 503)

    def test_auth_policy_helper(self):
        with app.app_context():
            self.assertFalse(get_setting_bool(REGISTRATION_ENABLED, False))
            policy = auth_policy()
            self.assertIn('site_title', policy)
            self.assertIn('default_locale', policy)

    def test_password_policy(self):
        from homy.admin_settings import validate_password, set_setting, PASSWORD_MIN_LENGTH
        with app.app_context():
            set_setting(PASSWORD_MIN_LENGTH, '10')
            db.session.commit()
            self.assertIsNotNone(validate_password('short'))
            self.assertIsNone(validate_password('longenoughpw'))

    def test_user_lock_field(self):
        with app.app_context():
            u = User(username='locked1', password_hash=generate_password_hash('x'), role='user', is_locked=True)
            db.session.add(u)
            db.session.commit()
            d = u.to_dict()
            self.assertTrue(d['is_locked'])


if __name__ == '__main__':
    unittest.main()
