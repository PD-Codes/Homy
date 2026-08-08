import unittest
import json
from homy.app import app
from homy.database import db, User, WidgetInstance, FavoriteLink, Setting

class TestDashboardCore(unittest.TestCase):
    def setUp(self):
        # Configure app for testing
        app.config['TESTING'] = True
        app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        app.config['WTF_CSRF_ENABLED'] = False
        app.config['SECRET_KEY'] = 'test_secret_key'
        
        self.client = app.test_client()
        
        # Init database inside context
        with app.app_context():
            db.create_all()
            
            # Create a test admin and standard user if they do not exist
            from werkzeug.security import generate_password_hash
            if not User.query.filter_by(username='admin').first():
                db.session.add(User(username='admin', password_hash=generate_password_hash('admin'), role='admin'))
            if not User.query.filter_by(username='user').first():
                db.session.add(User(username='user', password_hash=generate_password_hash('user'), role='user'))
            db.session.commit()

    def tearDown(self):
        with app.app_context():
            db.session.remove()
            db.drop_all()

    def test_get_modules(self):
        res = self.client.get('/api/modules')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertIn('modules', data)
        self.assertIn('widgets', data)
        
        # Verify the spacer module is registered
        module_names = [m['id'] for m in data['modules']]
        self.assertIn('spacer', module_names)
        
        widget_types = [w['type'] for w in data['widgets']]
        self.assertIn('spacer', widget_types)

    def test_auth_flow(self):
        # 1. Check status (logged out)
        res = self.client.get('/api/auth/status')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertFalse(data['logged_in'])
        
        # 2. Login standard user
        res = self.client.post('/api/auth/login', json={'username': 'user', 'password': 'user'})
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data['success'])
        
        # 3. Check status (logged in)
        res = self.client.get('/api/auth/status')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data['logged_in'])
        self.assertEqual(data['user']['username'], 'user')
        
        # 4. Logout
        res = self.client.post('/api/auth/logout')
        self.assertEqual(res.status_code, 200)
        
        # 5. Check status (logged out again)
        res = self.client.get('/api/auth/status')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertFalse(data['logged_in'])

    def test_setup_flow(self):
        # Clear users for setup test
        with app.app_context():
            User.query.delete()
            db.session.commit()
            
        # 1. Check status (should indicate needs_setup=True)
        res = self.client.get('/api/auth/status')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data['needs_setup'])
        
        # 2. Call setup init
        res = self.client.post('/api/setup/init', json={
            'username': 'setup_admin',
            'password': 'admin_password'
        })
        self.assertEqual(res.status_code, 201)
        data = json.loads(res.data)
        self.assertTrue(data['success'])
        self.assertEqual(data['user']['username'], 'setup_admin')
        self.assertEqual(data['user']['role'], 'admin')
        
        # 3. Check status (should be logged in as admin, needs_setup=False)
        res = self.client.get('/api/auth/status')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data['logged_in'])
        self.assertFalse(data['needs_setup'])
        self.assertEqual(data['user']['role'], 'admin')
        
        # 4. Try setup again (should be forbidden since admin exists)
        res = self.client.post('/api/setup/init', json={
            'username': 'another_admin',
            'password': 'some_password'
        })
        self.assertEqual(res.status_code, 403)

    def test_widgets_crud(self):
        # 1. Login user
        self.client.post('/api/auth/login', json={'username': 'user', 'password': 'user'})
        
        # 2. Create widget
        res = self.client.post('/api/widgets', json={
            'module': 'clock',
            'type': 'clock',
            'col': 2,
            'row': 1,
            'size_x': 4,
            'size_y': 3,
            'title': 'Clock Berlin',
            'config': {'timezone': 'Europe/Berlin'}
        })
        self.assertEqual(res.status_code, 201)
        w_data = json.loads(res.data)
        w_id = w_data['id']
        self.assertEqual(w_data['title'], 'Clock Berlin')
        
        # 3. Update widget
        res = self.client.put(f'/api/widgets/{w_id}', json={
            'title': 'Clock Hamburg',
            'col': 3,
            'config': {'timezone': 'Europe/Berlin'}
        })
        self.assertEqual(res.status_code, 200)
        w_data = json.loads(res.data)
        self.assertEqual(w_data['title'], 'Clock Hamburg')
        self.assertEqual(w_data['col'], 3)
        self.assertEqual(w_data['config']['timezone'], 'Europe/Berlin')
        
        # 4. Delete widget
        res = self.client.delete(f'/api/widgets/{w_id}')
        self.assertEqual(res.status_code, 200)
        
        # 5. Get widgets list (should be empty)
        res = self.client.get('/api/widgets')
        self.assertEqual(res.status_code, 200)
        widgets = json.loads(res.data)
        self.assertEqual(len(widgets), 0)

    def test_themes_api(self):
        res = self.client.get('/api/themes')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(isinstance(data, list))
        
        # Check that we have our default themes in the response
        theme_ids = [t['id'] for t in data]
        self.assertIn('dark', theme_ids)
        self.assertIn('light', theme_ids)
        self.assertIn('glassmorphism', theme_ids)
        self.assertIn('cyber', theme_ids)
        
        # Check metadata fields of a theme (e.g. dark)
        dark_theme = next(t for t in data if t['id'] == 'dark')
        self.assertEqual(dark_theme['name'], 'Dark Theme')
        self.assertEqual(dark_theme['author'], 'System')
        self.assertEqual(dark_theme['css_file'], '/themes/dark/dark.css')

    def test_custom_json_fetch_url(self):
        # Mock requests.get to avoid actual network calls
        from unittest.mock import patch
        class MockResponse:
            def __init__(self, json_data, status_code):
                self.json_data = json_data
                self.status_code = status_code
            def json(self):
                return self.json_data
            def raise_for_status(self):
                if self.status_code >= 400:
                    raise Exception("HTTP Error")

        with patch('requests.get') as mock_get:
            mock_get.return_value = MockResponse({'test_key': 'test_val'}, 200)
            
            res = self.client.get('/api/custom_json/fetch?url=http://example.com/test.json')
            self.assertEqual(res.status_code, 200)
            data = json.loads(res.data)
            self.assertTrue(data['configured'])
            self.assertTrue(data['online'])
            self.assertEqual(data['payload']['test_key'], 'test_val')
            
            mock_get.assert_called_with('http://example.com/test.json', timeout=5)

    def test_admin_modules_api(self):
        # 1. Login as admin
        self.client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin'})
        
        # 2. Get all modules
        res = self.client.get('/api/admin/modules')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(isinstance(data, list))
        self.assertTrue(len(data) > 0)
        
        # Verify first module structure
        mod = data[0]
        self.assertIn('id', mod)
        self.assertIn('enabled', mod)
        
        # 3. Toggle a module disabled
        mod_id = mod['id']
        res = self.client.post('/api/admin/modules/toggle', json={'module_id': mod_id, 'enabled': False})
        self.assertEqual(res.status_code, 200)
        
        # Verify it is filtered out of public modules API
        res = self.client.get('/api/modules')
        pub_data = json.loads(res.data)
        pub_module_ids = [m['id'] for m in pub_data['modules']]
        self.assertNotIn(mod_id, pub_module_ids)
        
        # 4. Toggle it back enabled
        res = self.client.post('/api/admin/modules/toggle', json={'module_id': mod_id, 'enabled': True})
        self.assertEqual(res.status_code, 200)
        
        # Verify it is in public modules API again
        res = self.client.get('/api/modules')
        pub_data = json.loads(res.data)
        pub_module_ids = [m['id'] for m in pub_data['modules']]
        self.assertIn(mod_id, pub_module_ids)

    def test_admin_user_crud(self):
        # 1. Login as admin
        self.client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin'})
        
        # 2. Get users list
        res = self.client.get('/api/admin/users')
        self.assertEqual(res.status_code, 200)
        users = json.loads(res.data)
        self.assertTrue(len(users) >= 2) # admin and user
        
        # 3. Create a new user
        res = self.client.post('/api/admin/users', json={
            'username': 'new_crud_user',
            'password': 'crud_password',
            'role': 'user'
        })
        self.assertEqual(res.status_code, 201)
        created_user = json.loads(res.data)
        user_id = created_user['id']
        self.assertEqual(created_user['username'], 'new_crud_user')
        self.assertEqual(created_user['role'], 'user')
        
        # 4. Update user
        res = self.client.put(f'/api/admin/users/{user_id}', json={
            'role': 'admin',
            'password': 'new_crud_password'
        })
        self.assertEqual(res.status_code, 200)
        updated_user = json.loads(res.data)
        self.assertEqual(updated_user['role'], 'admin')
        
        # 5. Delete user
        res = self.client.delete(f'/api/admin/users/{user_id}')
        self.assertEqual(res.status_code, 200)
        
        # Verify deleted
        res = self.client.get('/api/admin/users')
        users_after = json.loads(res.data)
        user_ids = [u['id'] for u in users_after]
        self.assertNotIn(user_id, user_ids)

    def test_tabs_and_layout_export_import(self):
        # 1. Login user
        self.client.post('/api/auth/login', json={'username': 'user', 'password': 'user'})
        
        # 2. Get tabs (should return default)
        res = self.client.get('/api/tabs')
        self.assertEqual(res.status_code, 200)
        tabs = json.loads(res.data)
        self.assertEqual(len(tabs), 1)
        self.assertEqual(tabs[0]['id'], 'default')
        
        # 3. Create widget in default tab
        res = self.client.post('/api/widgets', json={
            'module': 'clock',
            'type': 'clock',
            'col': 0,
            'row': 0,
            'size_x': 4,
            'size_y': 2,
            'tab_id': 'default'
        })
        self.assertEqual(res.status_code, 201)
        
        # 4. Save custom tabs
        custom_tabs = [
            {'id': 'default', 'name': 'Main'},
            {'id': 'media', 'name': 'Media'}
        ]
        res = self.client.post('/api/tabs', json={'tabs': custom_tabs})
        self.assertEqual(res.status_code, 200)
        
        # Verify tabs updated
        res = self.client.get('/api/tabs')
        self.assertEqual(res.status_code, 200)
        tabs = json.loads(res.data)
        self.assertEqual(len(tabs), 2)
        self.assertEqual(tabs[1]['id'], 'media')
        
        # 5. Export layout
        res = self.client.get('/api/layout/export')
        self.assertEqual(res.status_code, 200)
        export_data = json.loads(res.data)
        self.assertEqual(len(export_data['widgets']), 1)
        self.assertEqual(len(export_data['tabs']), 2)
        
        # 6. Import layout (with a new layout)
        new_layout = {
            'widgets': [
                {
                    'module': 'favorites',
                    'type': 'favorites',
                    'col': 2,
                    'row': 2,
                    'size_x': 6,
                    'size_y': 4,
                    'tab_id': 'media'
                }
            ],
            'tabs': [
                {'id': 'default', 'name': 'Main'},
                {'id': 'media', 'name': 'Media'},
                {'id': 'other', 'name': 'Other'}
            ],
            'favorites': []
        }
        res = self.client.post('/api/layout/import', json=new_layout)
        self.assertEqual(res.status_code, 200)
        
        # Verify imported widgets and tabs
        res = self.client.get('/api/widgets')
        self.assertEqual(res.status_code, 200)
        widgets = json.loads(res.data)
        self.assertEqual(len(widgets), 1)
        self.assertEqual(widgets[0]['type'], 'favorites')
        self.assertEqual(widgets[0]['tab_id'], 'media')
        
        res = self.client.get('/api/tabs')
        self.assertEqual(res.status_code, 200)
        tabs = json.loads(res.data)
        self.assertEqual(len(tabs), 3)

    def test_favorites_private_filtering(self):
        # 1. Test as guest (logged out)
        # Create standard test favorites first
        with app.app_context():
            # Clean favorites
            FavoriteLink.query.delete()
            
            # Public link (user_id=None)
            db.session.add(FavoriteLink(user_id=None, title='Public Link', url='https://public.com', order=1, is_private=False))
            # Admin link (user_id=1, username=admin)
            db.session.add(FavoriteLink(user_id=1, title='Admin Private Link', url='https://private-admin.com', order=2, is_private=True))
            db.session.add(FavoriteLink(user_id=1, title='Admin Public Link', url='https://public-admin.com', order=3, is_private=False))
            # Standard User link (user_id=2, username=user)
            db.session.add(FavoriteLink(user_id=2, title='User Private Link', url='https://private-user.com', order=4, is_private=True))
            db.session.add(FavoriteLink(user_id=2, title='User Public Link', url='https://public-user.com', order=5, is_private=False))
            
            db.session.commit()
            
        # As guest: GET /api/favorites should return only public link (user_id=None)
        res = self.client.get('/api/favorites')
        self.assertEqual(res.status_code, 200)
        favs = json.loads(res.data)
        self.assertEqual(len(favs), 1)
        self.assertEqual(favs[0]['title'], 'Public Link')
        self.assertFalse(favs[0]['is_private'])
        
        # 2. Login as admin (user_id=1)
        self.client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin'})
        
        # GET /api/favorites should return all admin links (private and public)
        res = self.client.get('/api/favorites')
        self.assertEqual(res.status_code, 200)
        favs = json.loads(res.data)
        self.assertEqual(len(favs), 2)
        titles = [f['title'] for f in favs]
        self.assertIn('Admin Private Link', titles)
        self.assertIn('Admin Public Link', titles)
        
        # 3. Create a private bookmark via POST
        res = self.client.post('/api/favorites', json={
            'title': 'New Admin Private Link',
            'url': 'https://new-admin-private.com',
            'is_private': True
        })
        self.assertEqual(res.status_code, 201)
        created_fav = json.loads(res.data)
        self.assertTrue(created_fav['is_private'])
        
        # GET /api/favorites should now have 3 links
        res = self.client.get('/api/favorites')
        favs = json.loads(res.data)
        self.assertEqual(len(favs), 3)
        
        # Logout
        self.client.post('/api/auth/logout')
        
        # 4. Login as standard user (user_id=2)
        self.client.post('/api/auth/login', json={'username': 'user', 'password': 'user'})
        
        # GET /api/favorites should return standard user links
        res = self.client.get('/api/favorites')
        self.assertEqual(res.status_code, 200)
        favs = json.loads(res.data)
        self.assertEqual(len(favs), 2)
        titles = [f['title'] for f in favs]
        self.assertIn('User Private Link', titles)
        self.assertIn('User Public Link', titles)

    def test_layout_lock_and_audit_logs(self):
        # 1. Anonymous access is rejected: the endpoint requires a login (regression guard)
        res = self.client.get('/api/admin/layout-lock')
        self.assertEqual(res.status_code, 401)

        # 2. Try to lock/unlock without login / as guest (should return 401/403)
        res = self.client.post('/api/admin/layout-lock', json={'locked': True})
        self.assertEqual(res.status_code, 401)

        # 3. Login as standard user: reading the lock state is allowed and initially False
        self.client.post('/api/auth/login', json={'username': 'user', 'password': 'user'})
        res = self.client.get('/api/admin/layout-lock')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertFalse(data['locked'])

        # ... but changing it is not
        res = self.client.post('/api/admin/layout-lock', json={'locked': True})
        self.assertEqual(res.status_code, 403)

        # 4. Login as admin and lock layout
        self.client.post('/api/auth/logout')
        self.client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin'})
        res = self.client.post('/api/admin/layout-lock', json={'locked': True})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(json.loads(res.data)['locked'])

        # Verify locked in GET
        res = self.client.get('/api/admin/layout-lock')
        self.assertEqual(json.loads(res.data)['locked'], True)

        # Logout admin, login as user
        self.client.post('/api/auth/logout')
        self.client.post('/api/auth/login', json={'username': 'user', 'password': 'user'})

        # 5. Verify standard user actions are now blocked by lock (403)
        # Create widget
        res = self.client.post('/api/widgets', json={
            'module': 'clock',
            'type': 'clock',
            'col': 2,
            'row': 1,
            'size_x': 4,
            'size_y': 3,
            'title': 'Test Lock'
        })
        self.assertEqual(res.status_code, 403)

        # Put tabs
        res = self.client.post('/api/tabs', json={'tabs': [{'id': 'default', 'name': 'Main'}]})
        self.assertEqual(res.status_code, 403)

        # Import layout
        res = self.client.post('/api/layout/import', json={'widgets': [], 'tabs': [], 'favorites': []})
        self.assertEqual(res.status_code, 403)

        # 6. Admin should still be allowed to update layout despite lock
        self.client.post('/api/auth/logout')
        self.client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin'})

        res = self.client.post('/api/widgets', json={
            'module': 'clock',
            'type': 'clock',
            'col': 2,
            'row': 1,
            'size_x': 4,
            'size_y': 3,
            'title': 'Admin Test Lock'
        })
        self.assertEqual(res.status_code, 201)
        widget_id = json.loads(res.data)['id']

        # Update widget
        res = self.client.put(f'/api/widgets/{widget_id}', json={'title': 'Admin Test Lock Updated'})
        self.assertEqual(res.status_code, 200)

        # Delete widget
        res = self.client.delete(f'/api/widgets/{widget_id}')
        self.assertEqual(res.status_code, 200)

        # Unlock layout
        res = self.client.post('/api/admin/layout-lock', json={'locked': False})
        self.assertEqual(res.status_code, 200)

        # Logout admin, login as user
        self.client.post('/api/auth/logout')
        self.client.post('/api/auth/login', json={'username': 'user', 'password': 'user'})

        # Now standard user can create widget again
        res = self.client.post('/api/widgets', json={
            'module': 'clock',
            'type': 'clock',
            'col': 2,
            'row': 1,
            'size_x': 4,
            'size_y': 3,
            'title': 'User Test Post Lock'
        })
        self.assertEqual(res.status_code, 201)

        # 7. Verify Audit logs (admin only)
        self.client.post('/api/auth/logout')
        self.client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin'})

        res = self.client.get('/api/admin/audit-logs')
        self.assertEqual(res.status_code, 200)
        payload = json.loads(res.data)
        logs = payload.get('logs', payload) if isinstance(payload, dict) else payload
        self.assertTrue(len(logs) > 0)
        
        # Verify specific events exist in the audit log
        event_types = [log['event_type'] for log in logs]
        self.assertIn('layout_lock_toggle', event_types)
        self.assertIn('widget_create', event_types)

    def test_secure_vault(self):
        # 1. Login as admin
        self.client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin'})

        # 2. Create integration with password field (vault on integration)
        from homy.database import Integration

        res = self.client.post('/api/integrations', json={
            'type': 'homeassistant',
            'name': 'HA Vault Test',
            'config': {
                'server_url': 'http://homeassistant.local:8123',
                'api_key': 'my-super-secret-password-123',
            },
        })
        self.assertEqual(res.status_code, 201)
        int_data = json.loads(res.data)
        integration_id = int_data['id']

        res = self.client.get('/api/integrations')
        masked = next(i for i in json.loads(res.data) if i['id'] == integration_id)
        self.assertEqual(masked['config']['api_key'], '********')

        with app.app_context():
            integration = db.session.get(Integration, integration_id)
            config_data = json.loads(integration.config_json)
            self.assertEqual(config_data['api_key'], '__VAULT_SECRET__')
            from homy.integration_service import resolve_integration_config
            self.assertEqual(
                resolve_integration_config(integration)['api_key'],
                'my-super-secret-password-123',
            )

        res = self.client.put(f'/api/integrations/{integration_id}', json={
            'config': {
                'server_url': 'http://homeassistant.local:8123',
                'api_key': 'my-new-even-more-secret-password-456',
            },
        })
        self.assertEqual(res.status_code, 200)

        with app.app_context():
            integration = db.session.get(Integration, integration_id)
            from homy.integration_service import resolve_integration_config
            self.assertEqual(
                resolve_integration_config(integration)['api_key'],
                'my-new-even-more-secret-password-456',
            )

        setting_key = f'integration_vault_{integration_id}_api_key'
        with app.app_context():
            self.assertIsNotNone(db.session.get(Setting, setting_key))

        res = self.client.delete(f'/api/integrations/{integration_id}')
        self.assertEqual(res.status_code, 200)

        with app.app_context():
            self.assertIsNone(db.session.get(Setting, setting_key))

if __name__ == '__main__':
    unittest.main()
