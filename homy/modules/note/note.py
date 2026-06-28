"""Note / Memo widget — static text with optional styling."""

WIDGETS = [
    {
        'type': 'note',
        'name': 'Notiz / Memo',
        'icon': 'sticky-note',
        'default_size_x': 6,
        'default_size_y': 3,
        'config_schema': {
            'content': {
                'type': 'textarea',
                'label': 'Inhalt (Markdown-ähnlich)',
                'default': '',
            },
            'note_title': {
                'type': 'text',
                'label': 'Titel (optional)',
                'default': '',
            },
            'style': {
                'type': 'select',
                'label': 'Stil',
                'options': ['plain', 'info', 'success', 'warning', 'danger'],
                'default': 'plain',
            },
            'font_size': {
                'type': 'select',
                'label': 'Schriftgröße',
                'options': ['klein', 'normal', 'groß'],
                'default': 'normal',
            },
        },
    },
]


def register(app):
    pass
