"""Tests for modular integration discovery."""

from homy.integration_manager import get_integration_manager


def test_integration_manager_loads_builtin_types():
    manager = get_integration_manager()
    assert manager is not None

    # Built-in plugin folders under homy/integrations/
    assert 'json' in manager.integration_types
    assert 'pihole' in manager.integration_types
    assert 'jellyfin' in manager.integration_types
    assert 'glances' in manager.integration_types
    assert 'discord' in manager.integration_types
    assert 'proxmox' in manager.integration_types
    assert 'weather' in manager.integration_types
    assert 'openweather' not in manager.integration_types
    assert manager.fetch_handlers.get('openweather') is manager.fetch_handlers.get('weather')
    assert 'aniworld_downloader' in manager.integration_types
    assert 'zabbix' in manager.integration_types

    assert manager.integration_types['json']['name'] == 'JSON / REST API'
    assert callable(manager.fetch_handlers['json'])


def test_integration_types_api_hides_legacy_openweather_alias():
    from homy.app import app
    from homy.integration_service import INTEGRATION_TYPES

    with app.test_client() as client:
        res = client.get('/api/integrations/types')
        assert res.status_code == 200
        ids = {t['id'] for t in res.get_json()}
    assert 'weather' in ids
    assert 'openweather' not in ids
    assert 'openweather' not in INTEGRATION_TYPES
