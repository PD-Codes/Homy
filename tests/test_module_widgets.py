import unittest

from homy.app import app, module_manager


class TestIntegrationSubfolderWidgets(unittest.TestCase):
    def test_aniworld_widgets_discovered_from_integration(self):
        with app.app_context():
            types = {w['type'] for w in module_manager.widgets_registry.values()}
            self.assertIn('aniworld_status', types)
            self.assertIn('aniworld_queue', types)
            self.assertIn('aniworld_stats', types)
            status = module_manager.widgets_registry['aniworld_status']
            self.assertEqual(status['integration_types'], ['aniworld_downloader'])
            self.assertEqual(status.get('widget_source'), 'integration')
            self.assertIn('/integrations/aniworld_downloader/widgets/', status.get('js_file', ''))

    def test_weather_widgets_under_weather_integration(self):
        with app.app_context():
            reg = module_manager.widgets_registry
            self.assertEqual(reg['openweather_card']['integration_types'], ['weather'])
            self.assertIn('/integrations/weather/widgets/', reg['openweather_card'].get('js_file', ''))

    def test_pihole_and_openweather_integration_widgets(self):
        with app.app_context():
            reg = module_manager.widgets_registry
            self.assertIn('pihole_status', reg)
            self.assertIn('openweather_card', reg)
            self.assertIn('weather_warnings', reg)
            self.assertEqual(reg['weather_warnings']['integration_types'], ['weather'])
            self.assertEqual(reg['pihole_status']['widget_role'], 'integration')

    def test_migrated_service_integration_widgets(self):
        with app.app_context():
            reg = module_manager.widgets_registry
            for wtype in (
                'discord', 'grafana', 'homeassistant', 'proxmox', 'weather_warnings',
            ):
                self.assertIn(wtype, reg, wtype)
                self.assertEqual(reg[wtype]['widget_source'], 'integration')

    def test_zabbix_widgets_discovered(self):
        with app.app_context():
            reg = module_manager.widgets_registry
            self.assertIn('zabbix_status', reg)
            self.assertIn('zabbix_problems', reg)
            self.assertEqual(reg['zabbix_status']['integration_types'], ['zabbix'])
            self.assertEqual(reg['zabbix_problems']['widget_role'], 'integration')
            self.assertIn('/integrations/zabbix/widgets/', reg['zabbix_status'].get('js_file', ''))

    def test_batch_integration_widgets_registered(self):
        with app.app_context():
            reg = module_manager.widgets_registry
            expected = (
                'uptime_kuma_status', 'glances_system', 'adguard_status', 'arr_queue',
                'sabnzbd_queue', 'torrent_status', 'media_streams', 'tautulli_streams',
                'plex_status', 'overseerr_requests', 'rss_feed', 'portainer_containers',
                'prowlarr_indexers', 'bazarr_missing', 'immich_stats',
            )
            for wtype in expected:
                self.assertIn(wtype, reg, wtype)
                self.assertEqual(reg[wtype]['widget_source'], 'integration')
            self.assertEqual(
                reg['arr_queue']['integration_types'],
                ['sonarr', 'radarr', 'lidarr', 'readarr'],
            )
            self.assertEqual(
                reg['torrent_status']['integration_types'],
                ['qbittorrent', 'transmission'],
            )
            self.assertEqual(
                reg['media_streams']['integration_types'],
                ['jellyfin', 'emby'],
            )

    def test_flex_data_dual_source_widgets(self):
        with app.app_context():
            reg = module_manager.widgets_registry
            for wtype in ('flex_stat', 'flex_gauge', 'flex_list', 'flex_chart', 'flex_banner'):
                self.assertIn(wtype, reg, wtype)
                self.assertTrue(reg[wtype].get('dual_data_source'), wtype)
                self.assertEqual(reg[wtype]['module'], 'flex_data')

    def test_legacy_display_modules_dual_source(self):
        with app.app_context():
            reg = module_manager.widgets_registry
            for wtype in ('metric_display', 'integration_table', 'integration_events'):
                self.assertIn(wtype, reg, wtype)
                self.assertTrue(reg[wtype].get('dual_data_source'), wtype)
