# Metric display — integration or custom JSON URL

WIDGETS = [
    {
        'type': 'metric_display',
        'name': 'Metrik / Grafik',
        'icon': 'bar-chart-2',
        'default_size_x': 4,
        'default_size_y': 4,
        'dual_data_source': True,
        'config_schema': {
            'data_source': {'type': 'select', 'options': ['integration', 'custom'], 'default': 'integration'},
            'chart_type': {'type': 'select', 'label': 'Darstellung', 'options': ['stat', 'gauge', 'line', 'area'], 'default': 'stat'},
            'label': {'type': 'text', 'label': 'Beschriftung', 'default': ''},
            'unit': {'type': 'text', 'label': 'Einheit', 'default': ''},
            'max_value': {'type': 'text', 'label': 'Max für Gauge', 'default': '100'},
        },
    },
]


def register(app):
    pass
