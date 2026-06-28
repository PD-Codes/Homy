import sys
import importlib
import os
from unittest.mock import MagicMock, patch

# Try to get the dynamically loaded weather module if already registered by IntegrationManager
if 'homy.integrations.weather' in sys.modules:
    weather_mod = sys.modules['homy.integrations.weather']
else:
    try:
        from homy.integrations.weather import weather as weather_mod
    except (ImportError, ModuleNotFoundError):
        weather_mod = importlib.import_module('homy.integrations.weather.weather')


def test_fetch_dwd_returns_empty_on_404_legacy_without_error():
    with patch.object(weather_mod, '_fetch_dwd_from_wfs', side_effect=Exception('wfs down')):
        with patch.object(weather_mod.requests, 'get') as mock_get:
            mock_resp = MagicMock()
            mock_resp.status_code = 404
            mock_get.return_value = mock_resp
            assert weather_mod._fetch_dwd('809183127') == []


def test_weather_plugin_module_exposes_widget_fetch_helpers():
    mod = weather_mod
    assert callable(mod.fetch_weather_display)
    assert callable(mod.fetch_warnings)


def test_get_integration_plugin_module_resolves_weather():
    from homy.integration_widget_util import get_integration_plugin_module

    mod = get_integration_plugin_module('weather')
    assert mod is weather_mod
    assert callable(mod.fetch_weather_display)


def test_openweather_card_uses_widget_config_dict():
    card_mod = sys.modules.get('homy.integrations.weather.widgets.card')
    if not card_mod:
        try:
            from homy.integrations.weather.widgets.card import card as card_mod
        except (ImportError, ModuleNotFoundError):
            current_dir = os.path.dirname(os.path.abspath(__file__))
            card_py_path = os.path.abspath(os.path.join(current_dir, '..', 'homy', 'integrations', 'weather', 'widgets', 'card', 'card.py'))
            spec = importlib.util.spec_from_file_location('homy.integrations.weather.widgets.card', card_py_path)
            card_mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(card_mod)

    source = open(card_mod.__file__, encoding='utf-8').read()
    assert 'widget_config=wcfg' in source
    assert 'widget.config' not in source

