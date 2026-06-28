"""Tests for weather municipality region lookup."""

from unittest.mock import patch

from homy.integrations.weather_region_lookup import (
    lookup_regions,
    normalize_nina_ars,
)


def test_normalize_nina_ars_kreis_level():
    assert normalize_nina_ars('09183126') == '091830000000'
    assert normalize_nina_ars('091830000000') == '091830000000'


@patch('homy.integrations.weather_region_lookup._lookup_dwd_warncell')
@patch('homy.integrations.weather_region_lookup.requests.get')
def test_lookup_regions_maitenbeth(mock_get, mock_dwd):
    mock_get.return_value.ok = True
    mock_get.return_value.json.return_value = [
        {
            'locality': 'Maitenbeth',
            'postalCode': '83558',
            'municipality': {'key': '09183126', 'name': 'Maitenbeth'},
            'district': {'name': 'Mühldorf a.Inn'},
            'federalState': {'name': 'Bayern'},
        },
    ]
    mock_dwd.return_value = ('809183126', 'Gemeinde Maitenbeth')

    results = lookup_regions('Maitenbeth', limit=5)
    assert len(results) == 1
    row = results[0]
    assert row['municipality'] == 'Maitenbeth'
    assert row['nina_ars'] == '091830000000'
    assert row['dwd_warncell'] == '809183126'


def test_weather_register_exposes_lookup_route():
    from homy.app import app

    rules = {rule.rule for rule in app.url_map.iter_rules()}
    assert '/api/weather/region-lookup' in rules
