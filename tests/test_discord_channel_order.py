"""Tests for Discord channel ordering."""

from homy.discord_service import apply_channel_order


def test_apply_channel_order_priority():
    channels = [
        {'id': '1', 'name': 'talk', 'position': 10},
        {'id': '2', 'name': 'Warteraum', 'position': 1, 'type': 2},
        {'id': '3', 'name': 'rules', 'position': 0},
    ]
    ordered = apply_channel_order(channels, 'Warteraum, talk')
    names = [c['name'] for c in ordered]
    assert names[0] == 'Warteraum'
    assert names[1] == 'talk'
    assert names[2] == 'rules'


def test_apply_channel_order_hide():
    channels = [
        {'id': '1', 'name': 'secret', 'position': 0},
        {'id': '2', 'name': 'public', 'position': 1},
    ]
    ordered = apply_channel_order(channels, '!secret, public')
    assert len(ordered) == 1
    assert ordered[0]['name'] == 'public'
