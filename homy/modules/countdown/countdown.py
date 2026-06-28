"""Countdown widget — counts down to a target date/time."""

WIDGETS = [
    {
        'type': 'countdown',
        'name': 'Countdown',
        'icon': 'timer',
        'default_size_x': 6,
        'default_size_y': 4,
        'config_schema': {
            'event_name': {'type': 'text', 'label': 'Event-Name', 'default': 'Mein Event'},
            'target_date': {'type': 'text', 'label': 'Datum (YYYY-MM-DD)', 'default': ''},
            'target_time': {'type': 'text', 'label': 'Uhrzeit (HH:MM, optional)', 'default': '00:00'},
            'style': {
                'type': 'select',
                'label': 'Stil',
                'options': ['boxes', 'minimal', 'banner'],
                'default': 'boxes',
            },
            'show_seconds': {
                'type': 'select',
                'label': 'Sekunden zeigen',
                'options': ['Ja', 'Nein'],
                'default': 'Ja',
            },
        },
    },
]


def register(app):
    pass
