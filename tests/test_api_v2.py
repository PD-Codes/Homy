"""API v2: bootstrap, layout save, bearer tokens, embed page, secret masking."""
import unittest

from werkzeug.security import generate_password_hash

from homy.app import app
from homy.database import Setting, User, WidgetInstance, db


class TestApiV2(unittest.TestCase):
    def setUp(self):
        app.config['TESTING'] = True
        self.client = app.test_client()
        with app.app_context():
            db.create_all()
            for name, role in (('v2admin', 'admin'), ('v2user', 'user')):
                if not User.query.filter_by(username=name).first():
                    db.session.add(User(username=name, password_hash=generate_password_hash('pw'), role=role))
            db.session.commit()

    def tearDown(self):
        with app.app_context():
            WidgetInstance.query.filter(WidgetInstance.id.like('v2-%')).delete(synchronize_session=False)
            db.session.commit()
            db.session.remove()

    def login(self, client=None, user='v2user'):
        c = client or self.client
        res = c.post('/api/auth/login', json={'username': user, 'password': 'pw'})
        self.assertEqual(res.status_code, 200, res.data)
        return c

    def test_bootstrap_requires_login(self):
        self.assertEqual(app.test_client().get('/api/v2/bootstrap').status_code, 401)

    def test_bootstrap_shape_and_catalog(self):
        self.login()
        data = self.client.get('/api/v2/bootstrap').get_json()
        self.assertEqual(data['api'], 2)
        self.assertTrue(data['layout']['tabs'])
        types = {c['type']: c for c in data['catalog']}
        self.assertIn('search_bar', types)
        clock = {f['key']: f for f in types['clock']['schema']}
        self.assertEqual(clock['format_24h']['type'], 'toggle')
        self.assertEqual(clock['format_24h']['on'], 'Ja')

    def test_token_auth_sets_no_cookie_and_cannot_mint(self):
        self.login()
        res = self.client.post('/api/v2/tokens', json={'name': 'test'})
        self.assertEqual(res.status_code, 201)
        token = res.get_json()['token']
        self.assertTrue(token.startswith('homy_pat_'))

        anon = app.test_client()
        res = anon.get('/api/v2/bootstrap', headers={'Authorization': f'Bearer {token}'})
        self.assertEqual(res.status_code, 200)
        self.assertNotIn('Set-Cookie', res.headers)
        res = anon.post('/api/v2/tokens', json={}, headers={'Authorization': f'Bearer {token}'})
        self.assertEqual(res.status_code, 403)
        res = anon.get('/api/v2/bootstrap', headers={'Authorization': 'Bearer homy_pat_invalid'})
        self.assertEqual(res.status_code, 401)

    def test_layout_save_and_ownership(self):
        self.login()
        with app.app_context():
            me = User.query.filter_by(username='v2user').first()
            other = User.query.filter_by(username='v2admin').first()
            db.session.add(WidgetInstance(id='v2-mine', user_id=me.id, module='clock', type='clock', col=0, row=0, size_x=4, size_y=2))
            db.session.add(WidgetInstance(id='v2-other', user_id=other.id, module='clock', type='clock', col=0, row=0, size_x=4, size_y=2))
            db.session.commit()
        res = self.client.put('/api/v2/layout', json={
            'tabs': [{'id': 'default', 'name': 'Start'}],
            'positions': [
                {'id': 'v2-mine', 'col': 30, 'row': 3, 'w': 6, 'h': 3},
                {'id': 'v2-other', 'col': 5, 'row': 5, 'w': 6, 'h': 3},
            ],
        })
        self.assertEqual(res.status_code, 200)
        with app.app_context():
            mine = db.session.get(WidgetInstance, 'v2-mine')
            other = db.session.get(WidgetInstance, 'v2-other')
            self.assertEqual((mine.col, mine.row, mine.size_x), (23, 3, 6))  # clamped
            self.assertEqual((other.col, other.row), (0, 0))  # not mine: untouched

    def test_secrets_are_masked(self):
        self.login()
        with app.app_context():
            me = User.query.filter_by(username='v2user').first()
            db.session.add(WidgetInstance(id='v2-secret', user_id=me.id, module='custom_json', type='json_custom', col=0, row=0,
                                          size_x=4, size_y=2, config_json='{"api_key": "__VAULT_SECRET__"}'))
            db.session.merge(Setting(key='vault_v2-secret_api_key', value='supersecret'))
            db.session.commit()
        body = self.client.get('/api/v2/bootstrap').get_data(as_text=True)
        self.assertNotIn('supersecret', body)
        body = self.client.get('/api/extension/sync').get_data(as_text=True)
        self.assertNotIn('supersecret', body)

    def test_embed_page_is_frameable(self):
        res = self.client.get('/embed/widget/whatever')
        if res.status_code == 503:
            self.skipTest('frontend not built')
        self.assertEqual(res.status_code, 200)
        self.assertNotIn('X-Frame-Options', res.headers)
        self.assertIn('frame-ancestors', res.headers.get('Content-Security-Policy', ''))


if __name__ == '__main__':
    unittest.main()
