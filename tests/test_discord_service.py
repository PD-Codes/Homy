"""Tests for Discord bot REST helpers."""

from unittest.mock import MagicMock, patch

from homy.discord_service import (
    fetch_guild_channels,
    fetch_user_voice_state,
    fetch_voice_states,
)


def _mock_response(status_code=200, json_data=None, ok=True):
    res = MagicMock()
    res.status_code = status_code
    res.ok = ok and 200 <= status_code < 300
    res.json.return_value = json_data
    return res


@patch('homy.discord_service.requests.get')
def test_fetch_user_voice_state_404_not_in_voice(mock_get):
    mock_get.return_value = _mock_response(404, ok=False)
    assert fetch_user_voice_state('1', '99', 'token') is None


@patch('homy.discord_service.requests.get')
def test_fetch_user_voice_state_ok(mock_get):
    mock_get.return_value = _mock_response(200, {
        'user_id': '99',
        'channel_id': '555',
        'guild_id': '1',
    })
    vs = fetch_user_voice_state('1', '99', 'token')
    assert vs['channel_id'] == '555'
    mock_get.assert_called_once()
    assert '/voice-states/99' in mock_get.call_args[0][0]


@patch('homy.discord_service.fetch_user_voice_state')
def test_fetch_voice_states_aggregates(mock_one):
    mock_one.side_effect = [
        {'user_id': '1', 'channel_id': '10'},
        None,
        {'user_id': '3', 'channel_id': '20'},
    ]
    states, err = fetch_voice_states('guild', 'tok', ['1', '2', '3'])
    assert err is None
    assert len(states) == 2
    assert mock_one.call_count == 3


@patch('homy.discord_service.requests.get')
def test_fetch_guild_channels_filters_types(mock_get):
    mock_get.return_value = _mock_response(200, [
        {'id': '1', 'name': 'general', 'type': 0, 'position': 1},
        {'id': '2', 'name': 'Voice', 'type': 2, 'position': 2},
        {'id': '3', 'name': 'hidden', 'type': 4, 'position': 0},
    ])
    channels, err = fetch_guild_channels('guild', 'tok')
    assert err is None
    assert len(channels) == 2
    assert channels[0]['name'] == 'hidden' or channels[0]['name'] == 'general'


@patch('homy.discord_service.requests.get')
def test_fetch_guild_members_sample_403(mock_get):
    from homy.discord_service import fetch_guild_members_sample
    mock_get.return_value = _mock_response(403, ok=False)
    members, err = fetch_guild_members_sample('guild', 'tok')
    assert members == []
    assert 'Server Members Intent' in err


@patch('homy.discord_service.requests.get')
def test_fetch_guild_members_sample_ok(mock_get):
    from homy.discord_service import fetch_guild_members_sample
    mock_get.return_value = _mock_response(200, [
        {
            'user': {'id': '100', 'username': 'offlinemember'},
            'roles': ['role1']
        }
    ])
    members, err = fetch_guild_members_sample('guild', 'tok')
    assert err is None
    assert len(members) == 1
    assert members[0]['id'] == '100'
    assert members[0]['status'] == 'offline'


@patch('homy.discord_service.fetch_public_widget')
@patch('homy.discord_service.fetch_bot_guild')
@patch('homy.discord_service.fetch_guild_members_sample')
@patch('homy.discord_service.fetch_guild_channels')
@patch('homy.discord_service.fetch_voice_states')
def test_build_widget_payload_offline_voice_resolves(
    mock_voice, mock_channels, mock_members, mock_guild, mock_widget
):
    from homy.discord_service import build_widget_payload
    mock_widget.return_value = (None, '403', 'disabled')  # Widget API disabled
    mock_guild.return_value = ({'name': 'Test Server'}, None)
    mock_members.return_value = ([
        {
            'id': 'offline_user_id',
            'username': 'OfflineUser',
            'avatar_url': 'http://avatar',
            'status': 'offline',
            'in_voice': False,
            'voice_channel_id': None,
            'voice_channel_name': None,
            'role_ids': []
        }
    ], None)
    mock_channels.return_value = ([
        {'id': 'voice_ch_id', 'name': 'My Voice Channel', 'type': 2, 'position': 0}
    ], None)
    mock_voice.return_value = ([
        {'user_id': 'offline_user_id', 'channel_id': 'voice_ch_id'}
    ], None)

    wcfg = {'show_online_members': 'Ja', 'show_voice_members': 'Ja', 'show_offline': 'Nein'}
    payload = build_widget_payload(wcfg, 'guild_id', token='token', bot_mode=True)

    assert payload['online'] is True
    assert len(payload['voice_members']) == 1
    vm = payload['voice_members'][0]
    assert vm['id'] == 'offline_user_id'
    assert vm['in_voice'] is True
    assert vm['voice_channel_name'] == 'My Voice Channel'
    # Important: status is set to online so they bypass offline filters
    assert vm['status'] == 'online'


def test_apply_member_roles_filters_ignored_roles():
    from homy.discord_service import _apply_member_roles
    members = [
        {
            'id': '1',
            'username': 'Alice',
            'role_ids': ['10', '20']  # 10 is low, 20 is high
        }
    ]
    roles_by_id = {
        '10': {'name': 'Player', 'position': 1, 'color': '#00ff00'},
        '20': {'name': 'Regeln gelesen', 'position': 5, 'color': '#ff0000'}
    }
    # Case 1: normal lookup (picks highest role 'Regeln gelesen')
    _apply_member_roles(members, roles_by_id)
    assert members[0]['role'] == 'Regeln gelesen'
    assert members[0]['role_color'] == '#ff0000'

    # Case 2: ignore 'Regeln gelesen' role (picks 'Player' instead)
    members[0].pop('role', None)
    members[0].pop('role_color', None)
    _apply_member_roles(members, roles_by_id, ignored_roles=['Regeln gelesen'])
    assert members[0]['role'] == 'Player'
    assert members[0]['role_color'] == '#00ff00'


def test_merge_widget_presence_and_voice_channel_resolution():
    from homy.discord_service import merge_widget_presence
    
    members_by_id = {
        '100': {
            'id': '100',
            'username': 'Hancer',
            'nick': 'Hancer/Wais/Marius',
            'global_name': 'Hancer/Wais/Marius',
            'username_raw': 'hancer',
            'status': 'offline',
            'in_voice': False
        }
    }
    widget_members = [
        {
            'id': '0',
            'username': 'Hancer/Wais/Marius',
            'status': 'online',
            'in_voice': True,
            'voice_channel_id': '1327266676307398661',
            'voice_channel_name': None
        }
    ]
    merge_widget_presence(members_by_id, widget_members)
    
    assert '0' not in members_by_id
    assert members_by_id['100']['status'] == 'online'
    assert members_by_id['100']['in_voice'] is True
    assert members_by_id['100']['voice_channel_id'] == '1327266676307398661'


@patch('homy.discord_service.fetch_public_widget')
@patch('homy.discord_service.fetch_bot_guild')
@patch('homy.discord_service.fetch_guild_members_sample')
@patch('homy.discord_service.fetch_guild_channels')
@patch('homy.discord_service.fetch_voice_states')
def test_build_widget_payload_resolves_voice_channel_names(
    mock_voice, mock_channels, mock_members, mock_guild, mock_widget
):
    from homy.discord_service import build_widget_payload
    mock_widget.return_value = ({
        'name': 'Test Server',
        'channels': [],
        'members': [
            {
                'id': '0',
                'username': 'Koneko / Dome',
                'status': 'online',
                'in_voice': True,
                'voice_channel_id': '1327266676307398661',
                'voice_channel_name': None
            }
        ]
    }, None, None)
    mock_guild.return_value = ({'name': 'Test Server'}, None)
    mock_members.return_value = ([
        {
            'id': '200',
            'username': 'koneko_dome',
            'global_name': 'Koneko / Dome',
            'avatar_url': 'http://avatar',
            'status': 'offline',
            'in_voice': False,
            'voice_channel_id': None,
            'voice_channel_name': None,
            'role_ids': []
        }
    ], None)
    mock_channels.return_value = ([
        {'id': '1327266676307398661', 'name': 'Retail-Taverne', 'type': 2, 'position': 0}
    ], None)
    mock_voice.return_value = ([], None)

    wcfg = {'show_online_members': 'Ja', 'show_voice_members': 'Ja', 'show_offline': 'Nein'}
    payload = build_widget_payload(wcfg, 'guild_id', token='token', bot_mode=True)

    assert payload['online'] is True
    assert len(payload['voice_members']) == 1
    vm = payload['voice_members'][0]
    assert vm['id'] == '200'
    assert vm['in_voice'] is True
    assert vm['voice_channel_name'] == 'Retail-Taverne'



