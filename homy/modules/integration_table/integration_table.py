# Integration table — integration or custom JSON URL

WIDGETS = [
    {
        'type': 'integration_table',
        'name': 'Tabelle / Table',
        'icon': 'table',
        'default_size_x': 8,
        'default_size_y': 6,
        'dual_data_source': True,
        'config_schema': {
            'data_source': {'type': 'select', 'options': ['integration', 'custom'], 'default': 'integration'},
            'mode': {'type': 'select', 'label': 'Anzeige', 'options': ['table', 'list'], 'default': 'table'},
            'max_rows': {'type': 'text', 'label': 'Max. Zeilen', 'default': '10'},
            'columns': {'type': 'textarea', 'label': 'Spalten (optional)', 'default': ''},
        },
    },
]


def register(app):
    pass
