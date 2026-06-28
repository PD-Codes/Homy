"""Discord server widget — public guild widget + display filters."""

import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.discord_service import build_widget_payload
from homy.integration_widget_util import get_integration_for_widget

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'discord',
    'name': 'Discord Server Status',
    'integration_types': ['discord'],
    'default_size_x': 8,
    'default_size_y': 8,
    'icon': 'message-square',
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
            'help': 'Only channels exposed by the public server widget (limited list).',
        },
        'channel_order': {
            'type': 'textarea',
            'label': 'Channel order / hide',
            'default': '',
            'help': 'Comma-separated channel names. Prefix with ! to hide. Example: !botactions, Warteraum, talk',
        },
        'hidden_roles': {'type': 'text', 'label': 'Hidden usernames (comma filter)', 'default': ''},
    },
}

CACHE_NS = 'discord'
CACHE_TTL = 30


def register(app):
    @app.route('/api/discord/widget', methods=['GET'], endpoint='widget_discord_server')
    def discord_widget_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        _, icfg, err, code = get_integration_for_widget(widget_id, 'discord')
        if err:
            return jsonify({'configured': False, 'message': err}), code

        guild_id = (icfg.get('guild_id') or '').strip()
        if not guild_id:
            return jsonify({'configured': False, 'message': 'No Guild ID on integration.'})

        ck = cache_key(CACHE_NS, widget_id, 'v1')
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            from homy.integration_widget_util import get_widget_config
            wcfg = get_widget_config(widget_id) or {}
            result = build_widget_payload(wcfg, guild_id, token=None, bot_mode=False)
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.error('Discord widget failed: %s', exc, exc_info=True)
            return jsonify({
                'configured': True,
                'online': False,
                'message': 'Discord API unreachable.',
            })
