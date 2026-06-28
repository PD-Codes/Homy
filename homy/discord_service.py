"""Discord public widget API + bot REST helpers for dashboard widgets."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

logger = logging.getLogger(__name__)

# Discord channel types we list in the widget (text, voice, announcement, stage)
_GUILD_CHANNEL_TYPES = {0, 2, 5, 13}
# Each voice lookup is a separate API call, so we cap how many we make per render.
# 50 covers any realistic server; raise it if you have a very large guild.
_MAX_VOICE_STATE_LOOKUPS = 50
_VOICE_LOOKUP_WORKERS = 8

DISCORD_API = 'https://discord.com/api/v10'
PUBLIC_WIDGET_URL = 'https://discord.com/api/guilds/{guild_id}/widget.json'


def cfg_yes(value, default=True):
    if value is None or value == '':
        return default
    return str(value).strip().lower() in ('ja', 'yes', '1', 'true', 'on')


def fetch_public_widget(guild_id):
    """Return (data_dict, error_code, error_message). error_code: None, 403, 404, or 'network'."""
    gid = (guild_id or '').strip()
    if not gid:
        return None, 'config', 'No Guild ID configured.'

    try:
        res = requests.get(PUBLIC_WIDGET_URL.format(guild_id=gid), timeout=8)
    except requests.RequestException as exc:
        logger.warning('Discord widget request failed: %s', exc)
        return None, 'network', 'Discord API unreachable.'

    if res.status_code == 403:
        return None, 403, 'widget_disabled'
    if res.status_code == 404:
        return None, 404, 'guild_not_found'
    if not res.ok:
        return None, 'network', f'Discord API error ({res.status_code}).'

    data = res.json()

    # Build a channel name lookup from the widget's channel list first,
    # so we can resolve voice channel names for members who are in voice.
    channels = [
        {'id': c.get('id'), 'name': c.get('name'), 'position': c.get('position', 0)}
        for c in (data.get('channels') or []) if isinstance(c, dict)
    ]
    channel_names = {str(c['id']): c['name'] for c in channels if c.get('id') and c.get('name')}

    members = []
    for m in data.get('members') or []:
        if not isinstance(m, dict):
            continue
        game = m.get('game')
        # The widget API includes channel_id when a member is in a voice channel.
        voice_ch_id = m.get('channel_id') or None
        members.append({
            'id': m.get('id'),
            'username': m.get('username'),
            'avatar_url': m.get('avatar_url'),
            'status': (m.get('status') or 'online').lower(),
            'game': game.get('name') if isinstance(game, dict) else None,
            'in_voice': bool(voice_ch_id),
            'voice_channel_id': str(voice_ch_id) if voice_ch_id else None,
            'voice_channel_name': channel_names.get(str(voice_ch_id)) if voice_ch_id else None,
        })

    return {
        'name': data.get('name', 'Discord Server'),
        'instant_invite': data.get('instant_invite'),
        'presence_count': data.get('presence_count', len(members)),
        'channels': channels,
        'members': members,
        'widget_enabled': True,
    }, None, None


def bot_headers(token):
    tok = (token or '').strip()
    if tok.lower().startswith('bot '):
        tok = tok[4:].strip()
    return {'Authorization': f'Bot {tok}'}


def fetch_bot_guild(guild_id, token):
    try:
        res = requests.get(
            f'{DISCORD_API}/guilds/{guild_id}',
            headers=bot_headers(token),
            params={'with_counts': 'true'},
            timeout=8,
        )
    except requests.RequestException as exc:
        logger.warning('Discord guild fetch failed: %s', exc)
        return None, 'Discord API unreachable.'
    if res.status_code == 401:
        return None, 'Invalid bot token.'
    if res.status_code == 403:
        return None, 'Bot has no access to this server.'
    if res.status_code == 404:
        return None, 'Server not found.'
    if not res.ok:
        return None, f'Discord API error ({res.status_code}).'
    return res.json(), None


def fetch_user_voice_state(guild_id, user_id, token):
    """Per-user voice state (404 = user not in voice)."""
    uid = str(user_id or '').strip()
    if not uid:
        return None
    try:
        res = requests.get(
            f'{DISCORD_API}/guilds/{guild_id}/voice-states/{uid}',
            headers=bot_headers(token),
            timeout=6,
        )
    except requests.RequestException:
        return None
    if res.status_code == 404:
        return None
    if res.status_code == 401:
        return {'_error': 'auth'}
    if res.status_code == 403:
        return {'_error': 'forbidden'}
    if not res.ok:
        return None
    data = res.json()
    return data if isinstance(data, dict) else None


def fetch_voice_states(guild_id, token, user_ids=None):
    """
    Discord has no REST endpoint to list all guild voice states at once.
    Query online/widget member IDs individually (bounded for rate limits).
    """
    ids = [str(u) for u in (user_ids or []) if u][: _MAX_VOICE_STATE_LOOKUPS]
    if not ids:
        return [], None

    states = []
    auth_err = 0
    forbidden = 0

    def _lookup(uid):
        return fetch_user_voice_state(guild_id, uid, token)

    with ThreadPoolExecutor(max_workers=_VOICE_LOOKUP_WORKERS) as pool:
        futures = {pool.submit(_lookup, uid): uid for uid in ids}
        for fut in as_completed(futures):
            vs = fut.result()
            if not vs:
                continue
            if vs.get('_error') == 'auth':
                auth_err += 1
                continue
            if vs.get('_error') == 'forbidden':
                forbidden += 1
                continue
            if vs.get('channel_id'):
                states.append(vs)

    if auth_err:
        return [], 'Invalid bot token.'
    if forbidden and not states and forbidden >= len(ids) // 2:
        return [], (
            'Missing permission to view voice (bot needs View Channel on voice channels).'
        )
    return states, None


def fetch_guild_channels(guild_id, token):
    """All text/voice/stage channels visible to the bot (not limited to widget)."""
    try:
        res = requests.get(
            f'{DISCORD_API}/guilds/{guild_id}/channels',
            headers=bot_headers(token),
            timeout=10,
        )
    except requests.RequestException as exc:
        logger.warning('Discord guild channels failed: %s', exc)
        return [], 'Channels could not be loaded.'
    if res.status_code == 401:
        return [], 'Invalid bot token.'
    if res.status_code == 403:
        return [], 'Missing permission to list channels (View Channel).'
    if not res.ok:
        return [], f'Channel API error ({res.status_code}).'
    payload = res.json()
    if not isinstance(payload, list):
        return [], None
    channels = []
    for ch in payload:
        if not isinstance(ch, dict):
            continue
        ctype = ch.get('type')
        if ctype not in _GUILD_CHANNEL_TYPES:
            continue
        channels.append({
            'id': ch.get('id'),
            'name': ch.get('name') or 'channel',
            'position': int(ch.get('position') or 0),
            'type': ctype,
        })
    channels.sort(key=lambda c: (c.get('position', 0), (c.get('name') or '').lower()))
    return channels, None


def fetch_channel(channel_id, token):
    try:
        res = requests.get(
            f'{DISCORD_API}/channels/{channel_id}',
            headers=bot_headers(token),
            timeout=6,
        )
        if res.ok:
            return res.json()
    except requests.RequestException:
        pass
    return None


def fetch_guild_roles(guild_id, token):
    try:
        res = requests.get(
            f'{DISCORD_API}/guilds/{guild_id}/roles',
            headers=bot_headers(token),
            timeout=8,
        )
    except requests.RequestException:
        return {}
    if not res.ok:
        return {}
    roles = {}
    for r in res.json() if isinstance(res.json(), list) else []:
        if not isinstance(r, dict):
            continue
        rid = str(r.get('id', ''))
        if not rid or r.get('name') == '@everyone':
            continue
        color = r.get('color') or 0
        roles[rid] = {
            'name': r.get('name') or '',
            'position': int(r.get('position', 0)),
            'color': f'#{color:06x}' if color else None,
        }
    return roles


def _apply_member_roles(members, roles_by_id, ignored_roles=None):
    if not roles_by_id:
        return
    ignored = {r.strip().lower() for r in (ignored_roles or []) if r.strip()}
    for m in members:
        role_ids = m.get('role_ids') or []
        best = None
        best_pos = -1
        for rid in role_ids:
            role = roles_by_id.get(str(rid))
            if not role:
                continue
            rname = (role.get('name') or '').strip().lower()
            if rname in ignored:
                continue
            pos = role.get('position', 0)
            if pos > best_pos:
                best_pos = pos
                best = role
        if best:
            m['role'] = best.get('name') or ''
            if best.get('color'):
                m['role_color'] = best['color']


def fetch_guild_members_sample(guild_id, token, limit=200):
    """First page of guild members (no presence without Gateway).
    Returns (members, error_message).
    """
    try:
        res = requests.get(
            f'{DISCORD_API}/guilds/{guild_id}/members',
            headers=bot_headers(token),
            params={'limit': min(limit, 1000)},
            timeout=10,
        )
    except requests.RequestException as exc:
        logger.warning('Discord guild members request failed: %s', exc)
        return [], 'Discord API unreachable.'

    if res.status_code == 403:
        logger.warning(
            'Failed to fetch guild members: 403 Forbidden. '
            'Please verify that the "Server Members Intent" is enabled in the Discord Developer Portal for this bot.'
        )
        return [], 'Bot is missing "Server Members Intent" (enable it in Discord Developer Portal > Bot > Privileged Gateway Intents).'
    if res.status_code == 401:
        return [], 'Invalid bot token.'
    if not res.ok:
        return [], f'Discord API error ({res.status_code}) fetching members.'

    payload = res.json()
    out = []
    for m in payload if isinstance(payload, list) else []:
        user = m.get('user') or {}
        out.append({
            'id': user.get('id'),
            'username': user.get('global_name') or user.get('username') or '?',
            'avatar_url': _avatar_url(user),
            'status': 'offline',
            'game': None,
            'in_voice': False,
            'voice_channel_id': None,
            'voice_channel_name': None,
            'role_ids': m.get('roles') or [],
            'nick': m.get('nick'),
            'global_name': user.get('global_name'),
            'username_raw': user.get('username'),
        })
    return out, None


def _avatar_url(user):
    uid = user.get('id')
    avatar = user.get('avatar')
    if uid and avatar:
        ext = 'gif' if str(avatar).startswith('a_') else 'png'
        return f'https://cdn.discordapp.com/avatars/{uid}/{avatar}.{ext}?size=128'
    discrim = user.get('discriminator')
    if discrim and str(discrim) != '0':
        index = int(discrim) % 5
    else:
        index = (int(uid or 0) >> 22) % 6
    return f'https://cdn.discordapp.com/embed/avatars/{index}.png'


def apply_voice_states(members_by_id, voice_states, token, channel_name_cache):
    for vs in voice_states or []:
        if not isinstance(vs, dict):
            continue
        uid = str(vs.get('user_id', ''))
        ch_id = str(vs.get('channel_id', ''))
        if not uid:
            continue
        ch_name = channel_name_cache.get(ch_id)
        if ch_name is None and ch_id:
            ch = fetch_channel(ch_id, token)
            ch_name = (ch or {}).get('name') or f'Channel {ch_id}'
            channel_name_cache[ch_id] = ch_name
        if uid not in members_by_id:
            members_by_id[uid] = {
                'id': uid,
                'username': f'User {uid[-4:]}',
                'avatar_url': f'https://cdn.discordapp.com/embed/avatars/0.png',
                'status': 'online',
                'game': None,
                'in_voice': True,
                'voice_channel_id': ch_id,
                'voice_channel_name': ch_name,
            }
        else:
            members_by_id[uid]['in_voice'] = True
            members_by_id[uid]['voice_channel_id'] = ch_id
            members_by_id[uid]['voice_channel_name'] = ch_name
            members_by_id[uid]['status'] = 'online'


def merge_widget_presence(members_by_id, widget_members):
    by_name = {}
    for m in members_by_id.values():
        names = []
        for key in ('username', 'nick', 'global_name', 'username_raw'):
            val = (m.get(key) or '').strip().lower()
            if val:
                names.append(val)
        for name in names:
            by_name[name] = m

    for m in widget_members or []:
        if not isinstance(m, dict):
            continue
        w_uname = (m.get('username') or '').strip().lower()
        if not w_uname:
            continue
        matched_member = by_name.get(w_uname)
        if matched_member:
            matched_member['status'] = (m.get('status') or 'online').lower()
            matched_member['game'] = m.get('game')
            if m.get('avatar_url'):
                matched_member['avatar_url'] = m.get('avatar_url')
            if m.get('in_voice') or m.get('voice_channel_id'):
                matched_member['in_voice'] = True
                matched_member['voice_channel_id'] = str(m.get('voice_channel_id')) if m.get('voice_channel_id') else None
                if m.get('voice_channel_name'):
                    matched_member['voice_channel_name'] = m.get('voice_channel_name')
        else:
            uid = str(m.get('id', ''))
            if uid:
                members_by_id[uid] = dict(m)


def _status_allowed(status, flags):
    st = (status or 'online').lower()
    if st == 'dnd' and not flags.get('show_dnd', True):
        return False
    if st in ('idle', 'away') and not flags.get('show_idle', True):
        return False
    if st == 'offline' and not flags.get('show_offline', False):
        return False
    return True


def filter_members(members, flags):
    """Main member list (voice users are returned separately in voice_members)."""
    show_online = flags.get('show_online_members', True)
    show_voice = flags.get('show_voice_members', False)

    if not show_online:
        return []

    result = []
    for m in members:
        if show_voice and m.get('in_voice'):
            continue
        if not _status_allowed(m.get('status'), flags):
            continue
        result.append(m)
    return result


def apply_channel_order(channels, order_spec):
    """
    Sort channels: names/IDs in comma-separated order_spec first, then the rest by position.
    Partial name match (case-insensitive). Prefix with ! to hide a channel.
    """
    if not channels:
        return []
    spec = (order_spec or '').strip()
    if not spec:
        return list(channels)

    hide_tokens = []
    order_tokens = []
    for part in spec.split(','):
        p = part.strip()
        if not p:
            continue
        if p.startswith('!'):
            hide_tokens.append(p[1:].strip().lower())
        else:
            order_tokens.append(p.lower())

    def _hidden(ch):
        name = (ch.get('name') or '').lower()
        cid = str(ch.get('id') or '').lower()
        return any(
            tok == cid or tok == name or tok in name
            for tok in hide_tokens
        )

    visible = [ch for ch in channels if not _hidden(ch)]
    if not order_tokens:
        return sorted(visible, key=lambda c: (c.get('position', 0), (c.get('name') or '').lower()))

    def _rank(ch):
        name = (ch.get('name') or '').lower()
        cid = str(ch.get('id') or '').lower()
        for idx, tok in enumerate(order_tokens):
            if tok == cid or tok == name or tok in name:
                return idx
        return len(order_tokens) + int(ch.get('position', 0))

    return sorted(visible, key=_rank)


def widget_display_flags(wcfg):
    return {
        'show_online_members': cfg_yes(wcfg.get('show_online_members'), True),
        'show_voice_members': cfg_yes(wcfg.get('show_voice_members'), False),
        'show_dnd': cfg_yes(wcfg.get('show_dnd'), True),
        'show_idle': cfg_yes(wcfg.get('show_idle'), True),
        'show_offline': cfg_yes(wcfg.get('show_offline'), False),
        'show_join_button': cfg_yes(wcfg.get('show_join_button'), True),
        'show_logo': cfg_yes(wcfg.get('show_logo'), True),
        'show_channels': cfg_yes(wcfg.get('show_channels'), False),
        'show_role_colors': cfg_yes(wcfg.get('show_role_colors'), False),
        'show_role_name': cfg_yes(wcfg.get('show_role_name'), False),
        'show_online_count': cfg_yes(wcfg.get('show_online_count'), True),
        'voice_list_mode': cfg_yes(wcfg.get('show_voice_members'), False),
    }


def build_widget_payload(wcfg, guild_id, token=None, bot_mode=False):
    """Build API response dict for widget endpoints."""
    flags = widget_display_flags(wcfg)
    hidden_roles = [
        r.strip().lower()
        for r in (wcfg.get('hidden_roles') or '').split(',')
        if r.strip()
    ]

    widget_data, err_code, err_msg = fetch_public_widget(guild_id)
    widget_enabled = err_code is None

    members_by_id = {}
    channel_name_cache = {}
    voice_error = None
    voice_note_key = 'discord_voice_widget_note' if not bot_mode else 'discord_voice_bot_note'

    if bot_mode and token:
        guild, g_err = fetch_bot_guild(guild_id, token)
        if g_err:
            return {
                'configured': True,
                'online': False,
                'widget_enabled': widget_enabled,
                'message': g_err,
            }
        server_name = guild.get('name', 'Discord Server')

        # Fetch guild members once (can be empty / fail with 403 if intent is missing)
        members_sample, members_err = fetch_guild_members_sample(guild_id, token)
        if members_err:
            voice_error = members_err

        # Pre-populate members_by_id with all real members from the sample (so we have their real IDs and usernames)
        for m in members_sample:
            uid = str(m.get('id', ''))
            if uid:
                members_by_id[uid] = m

        if widget_enabled and widget_data:
            merge_widget_presence(members_by_id, widget_data.get('members', []))

        # Pre-populate channel name cache from bot channels and widget channels
        bot_channels, _ch_err = fetch_guild_channels(guild_id, token)
        if bot_channels:
            for ch in bot_channels:
                cid = str(ch.get('id', ''))
                cname = ch.get('name')
                if cid and cname:
                    channel_name_cache[cid] = cname

        widget_channels = (widget_data or {}).get('channels') or []
        for ch in widget_channels:
            cid = str(ch.get('id', ''))
            cname = ch.get('name')
            if cid and cname and cid not in channel_name_cache:
                channel_name_cache[cid] = cname

        # Prioritize voice state lookups: offline users first (since we have no other way of knowing
        # if they are in voice), followed by online users not yet known to be in voice.
        offline_ids = [uid for uid, m in members_by_id.items() if m.get('status') == 'offline']
        online_not_in_voice_ids = [
            uid for uid, m in members_by_id.items()
            if m.get('status') != 'offline' and not m.get('in_voice')
        ]
        lookup_ids = offline_ids + online_not_in_voice_ids

        voice_states, voice_err_lookup = fetch_voice_states(
            guild_id, token, lookup_ids,
        )
        if voice_err_lookup:
            voice_error = voice_err_lookup

        apply_voice_states(members_by_id, voice_states, token, channel_name_cache)

        # Resolve voice channel names for anyone in voice whose name was not set yet or is only the ID
        for m in members_by_id.values():
            if m.get('in_voice') and m.get('voice_channel_id'):
                ch_id = str(m['voice_channel_id'])
                if not m.get('voice_channel_name') or m['voice_channel_name'] == ch_id:
                    ch_name = channel_name_cache.get(ch_id)
                    if ch_name is None:
                        ch = fetch_channel(ch_id, token)
                        ch_name = (ch or {}).get('name') or f'Channel {ch_id}'
                        channel_name_cache[ch_id] = ch_name
                    m['voice_channel_name'] = ch_name

        # If we need to show offline members, they are already in members_by_id (from members_sample)
        # and their status has been resolved or remains 'offline'. If show_offline is False,
        # they will be filtered out by filter_members unless they were set to 'online' (e.g. by being in voice).
        # Therefore, we do not need another fetch_guild_members_sample call here.

        instant_invite = (widget_data or {}).get('instant_invite')
        presence_count = (widget_data or {}).get('presence_count') or guild.get('approximate_presence_count', 0)
        
        # Determine channels list to return (prefer bot_channels if show_channels is enabled)
        channels = widget_channels
        if flags.get('show_channels') and bot_channels:
            channels = bot_channels

        if not widget_enabled:
            presence_count = guild.get('approximate_presence_count', presence_count)
    else:
        if not widget_enabled:
            return {
                'configured': True,
                'online': False,
                'widget_enabled': False,
                'message_key': 'discord_widget_disabled',
                'setup_hint_key': 'discord_setup_widget',
                **flags,
            }
        server_name = widget_data['name']
        instant_invite = widget_data.get('instant_invite')
        presence_count = widget_data.get('presence_count', 0)
        channels = widget_data.get('channels', [])
        for m in widget_data.get('members', []):
            uid = str(m.get('id', ''))
            if uid:
                members_by_id[uid] = m

    members = list(members_by_id.values())
    if bot_mode and token and (flags.get('show_role_name') or flags.get('show_role_colors')):
        roles_by_id = fetch_guild_roles(guild_id, token)
        if roles_by_id:
            if not any(m.get('role_ids') for m in members):
                for gm in members_sample:
                    uid = str(gm.get('id', ''))
                    if uid and uid in members_by_id:
                        members_by_id[uid]['role_ids'] = gm.get('role_ids') or []
                members = list(members_by_id.values())
            ignored_roles = [
                r.strip().lower()
                for r in (wcfg.get('ignored_roles') or '').split(',')
                if r.strip()
            ]
            _apply_member_roles(members, roles_by_id, ignored_roles)

    if hidden_roles:
        members = [
            m for m in members
            if not any(r in (m.get('username') or '').lower() for r in hidden_roles)
        ]

    filtered = filter_members(members, flags)
    voice_members = [m for m in members if m.get('in_voice')]

    if flags.get('show_channels') and channels:
        channels = apply_channel_order(channels, wcfg.get('channel_order'))

    return {
        'configured': True,
        'online': True,
        'widget_enabled': widget_enabled,
        'bot_mode': bot_mode,
        'name': server_name,
        'instant_invite': instant_invite,
        'presence_count': presence_count,
        'channels': channels,
        'members': filtered,
        'voice_members': voice_members if flags.get('show_voice_members') else [],
        'voice_error': voice_error,
        'voice_note_key': voice_note_key,
        'hidden_roles': hidden_roles,
        **flags,
    }
