"""Discord integration — public guild widget API."""

from homy.discord_service import fetch_public_widget

INTEGRATION_TYPE = {
    'name': 'Discord (Widget)',
    'icon': 'message-square',
    'fields': {
        'guild_id': {
            'type': 'text',
            'label': 'Discord Server ID (Guild ID)',
            'default': '',
            'help': (
                'Rechtsklick auf deinen Server → Servereinstellungen → Widget → '
                'Server-ID kopieren. Das Server-Widget muss unter „Widget“ aktiviert sein.'
            ),
            'help_links': [
                {
                    'id': 'widget_docs',
                    'label': 'Discord: Server-Widget aktivieren',
                    'url': 'https://support.discord.com/hc/de/articles/206346498',
                },
            ],
        },
    },
    'metrics': [
        {'path': 'presence_count', 'label': 'Members online'},
        {'path': 'name', 'label': 'Server name'},
    ],
}


def fetch_payload(config):
    guild_id = (config.get('guild_id') or '').strip()
    data, err_code, err_msg = fetch_public_widget(guild_id)
    if err_code:
        if err_code == 403:
            raise ValueError(
                'Server-Widget ist deaktiviert. Unter Servereinstellungen → Widget aktivieren.'
            )
        if err_code == 404:
            raise ValueError('Discord-Server nicht gefunden.')
        raise ValueError(err_msg or 'Discord API error')
    return data
