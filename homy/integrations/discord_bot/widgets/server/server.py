"""Discord bot widget — voice states, members, optional widget presence merge."""

import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.discord_service import build_widget_payload
from homy.integration_widget_util import get_integration_for_widget, get_widget_config

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'discord_bot',
    'name': 'Discord Server Status (Bot)',
    'integration_types': ['discord_bot'],
    'default_size_x': 8,
    'default_size_y': 8,
    'icon': 'bot',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'show_online_count': {
            'type': 'select',
            'label': 'Show online count',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
        'show_online_members': {
            'type': 'select',
            'label': 'Show online members',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
            'help': 'Uses Server Widget presence when enabled; otherwise approximate counts only.',
        },
        'show_voice_members': {
            'type': 'select',
            'label': 'Show voice members',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
            'help': (
                'Voice per Bot. Kanäle ohne @everyone „Verbinden“ können fehlen. '
                'Optional Server-Widget für Online-Status aktivieren.'
            ),
        },
        'show_dnd': {
            'type': 'select',
            'label': 'Show Do Not Disturb',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
        'show_idle': {
            'type': 'select',
            'label': 'Show Away / Idle',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
        'show_offline': {
            'type': 'select',
            'label': 'Show offline members',
            'options': ['Ja', 'Nein'],
            'default': 'Nein',
            'help': 'Loads guild members via bot (first 200). No live presence without Server Widget.',
        },
        'show_join_button': {
            'type': 'select',
            'label': 'Show join button',
            'options': ['Ja', 'Nein'],
            'default': 'Ja',
        },
        'show_logo': {'type': 'select', 'label': 'Show logo', 'options': ['Ja', 'Nein'], 'default': 'Ja'},
        'show_channels': {
            'type': 'select',
            'label': 'Show channels',
            'options': ['Ja', 'Nein'],
            'default': 'Nein',
            'help': 'Lists text/voice/stage channels via bot (full server list).',
        },
        'channel_order': {
            'type': 'textarea',
            'label': 'Channel order / hide',
            'default': '',
            'help': (
                'Comma-separated names (order first). Prefix with ! to hide. '
                'Example: !moderator-only, Warteraum, talk, 🔊 Gildenmeeting'
            ),
        },
        'show_role_colors': {
            'type': 'select',
            'label': 'Role colors',
            'options': ['Ja', 'Nein'],
            'default': 'Nein',
            'help': 'Highest role color next to username (requires bot).',
        },
        'show_role_name': {
            'type': 'select',
            'label': 'Role names',
            'options': ['Ja', 'Nein'],
            'default': 'Nein',
            'help': 'Highest role name in brackets (requires bot).',
        },
        'hidden_roles': {
            'type': 'text',
            'label': 'Hidden usernames (comma filter)',
            'default': '',
        },
        'ignored_roles': {
            'type': 'text',
            'label': 'Ignored roles (comma filter)',
            'default': '',
        },
    },
}

CACHE_NS = 'discord_bot'
CACHE_TTL = 45  # voice-state lookups are expensive; cache longer to keep rendering fast


def register(app):
    @app.route('/api/discord-bot/widget', methods=['GET'], endpoint='widget_discord_bot_server')
    def discord_bot_widget_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404
        _, icfg, err, code = get_integration_for_widget(widget_id, 'discord_bot')
        if err:
            return jsonify({'configured': False, 'message': err}), code

        guild_id = (icfg.get('guild_id') or '').strip()
        token = (icfg.get('bot_token') or '').strip()
        if not guild_id:
            return jsonify({'configured': False, 'message': 'No Guild ID on integration.'})
        if not token:
            return jsonify({'configured': False, 'message': 'No bot token on integration.'})

        ck = cache_key(CACHE_NS, widget_id, 'v1')
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = build_widget_payload(wcfg, guild_id, token=token, bot_mode=True)
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.error('Discord bot widget failed: %s', exc, exc_info=True)
            return jsonify({
                'configured': True,
                'online': False,
                'message': 'Discord API unreachable.',
            })
