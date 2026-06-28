"""Tests for configurable system health thresholds."""

import json
import unittest

from homy.app import app
from homy.database import db
from homy.health_thresholds import (
    HEALTH_THRESHOLDS_KEY,
    get_health_thresholds,
    save_health_thresholds,
    status_api_calls,
    status_storage,
)


class HealthThresholdsTestCase(unittest.TestCase):
    def setUp(self):
        app.config['TESTING'] = True
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        self.client = app.test_client()
        with app.app_context():
            db.create_all()

    def tearDown(self):
        with app.app_context():
            db.session.remove()
            db.drop_all()

    def test_status_uses_saved_thresholds(self):
        with app.app_context():
            save_health_thresholds({
                'storage': {'warn': 50, 'error': 60},
                'api_calls': {'warn': 100, 'error': 200},
            })
            self.assertEqual(status_storage(49), 'ok')
            self.assertEqual(status_storage(55), 'warn')
            self.assertEqual(status_storage(65), 'error')
            self.assertEqual(status_api_calls(99), 'ok')
            self.assertEqual(status_api_calls(150), 'warn')

    def test_defaults_when_empty(self):
        with app.app_context():
            thresholds = get_health_thresholds()
            self.assertEqual(thresholds['storage']['warn'], 85)
            self.assertIn('api_calls', thresholds)

    def test_admin_api_roundtrip(self):
        with app.app_context():
            from werkzeug.security import generate_password_hash
            from homy.database import User

            db.session.add(User(
                username='admin',
                password_hash=generate_password_hash('admin'),
                role='admin',
            ))
            db.session.commit()

        self.client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin'})
        res = self.client.post(
            '/api/admin/health/thresholds',
            json={'thresholds': {'storage': {'warn': 70, 'error': 90}}},
        )
        self.assertEqual(res.status_code, 200)
        with app.app_context():
            from homy.admin_settings import get_setting_raw

            raw = get_setting_raw(HEALTH_THRESHOLDS_KEY, '')
            data = json.loads(raw)
            self.assertEqual(data['storage']['warn'], 70)


if __name__ == '__main__':
    unittest.main()
