"""Tests for MRX AniWorld Downloader integration plugin."""
from homy.integrations.aniworld_downloader.aniworld_downloader import (
    ANIWORLD_ENDPOINTS,
    _normalize_payload,
    _resolve_endpoint_key,
    get_integration_type,
)


def test_aniworld_integration_type_registered():
    tdef = get_integration_type()
    assert tdef['name'] == 'MRX AniWorld Downloader'
    assert 'widget_endpoints' in tdef
    assert any(ep['key'] == 'v1_status' for ep in tdef['widget_endpoints'])
    assert any(m['path'] == 'queue.running' for m in tdef['metrics'])


def test_resolve_endpoint_key_by_label():
    label = ANIWORLD_ENDPOINTS['v1_stats']['label']
    assert _resolve_endpoint_key({'endpoint': label}) == 'v1_stats'
    assert _resolve_endpoint_key({'endpoint': 'v1_queue'}) == 'v1_queue'


def test_normalize_v1_queue_array():
    data = [{'id': 1, 'title': 'Test'}]
    out = _normalize_payload('v1_queue', data)
    assert out['count'] == 1
    assert out['items'][0]['title'] == 'Test'


def test_normalize_v1_status_dict():
    data = {'queue': {'running': 2, 'queued': 5}, 'paused': False}
    out = _normalize_payload('v1_status', data)
    assert out['queue_running'] == 2
    assert out['queue_queued'] == 5
