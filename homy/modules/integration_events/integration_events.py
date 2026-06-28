# Integration events feed — integration or custom JSON URL

WIDGETS = [
    {
        'type': 'integration_events',
        'name': 'Events Feed',
        'icon': 'bell',
        'default_size_x': 8,
        'default_size_y': 6,
        'dual_data_source': True,
        'config_schema': {
            'data_source': {'type': 'select', 'options': ['integration', 'custom'], 'default': 'integration'},
            'time_path': {'type': 'text', 'label': 'Zeitpfad', 'default': 'timestamp'},
            'message_path': {'type': 'text', 'label': 'Message-Pfad', 'default': 'message'},
            'severity_path': {'type': 'text', 'label': 'Severity-Pfad (optional)', 'default': ''},
            'max_items': {'type': 'text', 'label': 'Max. Items', 'default': '10'},
        },
    },
]


def register(app):
    pass
