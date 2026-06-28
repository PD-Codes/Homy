"""Tests for system health endpoint."""

import json
import unittest

from werkzeug.security import generate_password_hash

from homy.app import app
from homy.database import db, User
from homy.system_health import get_system_health


class SystemHealthTestCase(unittest.TestCase):
    def setUp(self):
        app.config['TESTING'] = True
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        app.config['SECRET_KEY'] = 'test'
        self.client = app.test_client()
        with app.app_context():
            db.create_all()
            db.session.add(User(
                username='admin',
                password_hash=generate_password_hash('admin'),
                role='admin',
            ))
            db.session.commit()

    def tearDown(self):
        with app.app_context():
            db.session.remove()
            db.drop_all()

    def test_health_helper(self):
        with app.app_context():
            data = get_system_health()
            self.assertIn('overall', data)
            self.assertIn('checks', data)
            keys = {c['label_key'] for c in data['checks']}
            self.assertIn('health_database', keys)
            self.assertIn('health_api_calls', keys)
            self.assertTrue(all(c.get('detail_key') or c.get('detail') for c in data['checks']))

    def test_health_api_requires_admin(self):
        res = self.client.get('/api/admin/health')
        self.assertEqual(res.status_code, 401)

    def test_health_api_as_admin(self):
        self.client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin'})
        res = self.client.get('/api/admin/health')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn('checks', data)
        self.assertGreaterEqual(len(data['checks']), 5)


if __name__ == '__main__':
    unittest.main()
