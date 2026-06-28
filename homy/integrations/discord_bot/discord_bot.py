"""Discord Bot integration — guild + voice via bot token."""

from homy.discord_service import bot_headers, fetch_bot_guild, fetch_public_widget

INTEGRATION_TYPE = {
    'name': 'Discord Widget (Bot)',
    'icon': 'bot',
    'fields': {
        'guild_id': {
            'type': 'text',
            'label': 'Discord Server ID (Guild ID)',
            'default': '',
            'help': 'Server-ID aus Servereinstellungen → Widget (oder Entwicklermodus → Server-ID).',
        },
        'bot_token': {
            'type': 'password',
            'label': 'Bot Token',
            'default': '',
            'help': (
                'Nur der Bot-Token (nicht Application/Client ID). '
                'Bot unter discord.com/developers anlegen, zum Server einladen. '
                'Benötigte Bot-Berechtigungen: View Channel (Kanäle + Voice-Status), '
                'optional Server Members Intent für große Mitgliederlisten. '
                'Voice: Bot prüft Online-Mitglieder einzeln; Kanäle ohne Sichtbarkeit können fehlen.'
            ),
            'help_links': [
                {
                    'id': 'dev_portal',
                    'label': 'Discord Developer Portal',
                    'url': 'https://discord.com/developers/applications',
                },
                {
                    'id': 'permissions',
                    'label': 'Bot permissions calculator',
                    'url': 'https://discordapi.com/permissions.html',
                },
            ],
        },
    },
    'metrics': [
        {'path': 'presence_count', 'label': 'Members online (approx.)'},
        {'path': 'name', 'label': 'Server name'},
    ],
}


def fetch_payload(config):
    guild_id = (config.get('guild_id') or '').strip()
    token = (config.get('bot_token') or '').strip()
    if not guild_id:
        raise ValueError('Discord Guild ID required')
    if not token:
        raise ValueError('Bot token required')

    guild, err = fetch_bot_guild(guild_id, token)
    if err:
        raise ValueError(err)

    widget_data, _, _ = fetch_public_widget(guild_id)
    presence = (widget_data or {}).get('presence_count') if widget_data else guild.get('approximate_presence_count', 0)

    return {
        'name': guild.get('name', 'Discord Server'),
        'presence_count': presence,
        'widget_enabled': widget_data is not None,
        'instant_invite': (widget_data or {}).get('instant_invite'),
    }
