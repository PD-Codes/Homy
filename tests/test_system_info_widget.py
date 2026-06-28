import unittest
from homy.app import app, module_manager

class TestSystemInfoWidget(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_widget_schema_registered(self):
        # Verify system_info is registered as a widget
        with app.app_context():
            registry = module_manager.widgets_registry
            self.assertIn('system_info', registry)
            schema = registry['system_info']
            self.assertEqual(schema['module'], 'system_info')
            self.assertEqual(schema['widget_source'], 'module')
            self.assertIn('show_cpu', schema['config_schema'])
            self.assertIn('show_ram', schema['config_schema'])
            self.assertIn('show_disk', schema['config_schema'])
            self.assertIn('show_uptime', schema['config_schema'])

    def test_api_endpoint_returns_data(self):
        # Verify /api/system_info/stats endpoint works
        res = self.client.get('/api/system_info/stats')
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn('cpu', data)
        self.assertIn('ram', data)
        self.assertIn('disk', data)
        self.assertIn('uptime', data)
        
        # Verify cpu data type
        self.assertTrue(isinstance(data['cpu'], (int, float)))
        
        # Verify ram keys
        self.assertIn('total', data['ram'])
        self.assertIn('used', data['ram'])
        self.assertIn('percent', data['ram'])
        
        # Verify disk keys
        self.assertIn('total', data['disk'])
        self.assertIn('used', data['disk'])
        self.assertIn('percent', data['disk'])
        
        # Verify uptime formatting
        self.assertTrue(isinstance(data['uptime'], str))
