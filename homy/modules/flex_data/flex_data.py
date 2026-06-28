"""Flex data widgets — Custom URL or Integration as data source."""

WIDGETS = [
    {
        'type': 'flex_stat',
        'name': 'Flex · Stat',
        'icon': 'hash',
        'default_size_x': 4,
        'default_size_y': 3,
        'dual_data_source': True,
        'config_schema': {
            'data_source': {'type': 'select', 'options': ['integration', 'custom'], 'default': 'integration'},
            'label': {'type': 'text', 'label': 'Beschriftung', 'default': ''},
            'unit': {'type': 'text', 'label': 'Einheit', 'default': ''},
        },
    },
    {
        'type': 'flex_gauge',
        'name': 'Flex · Gauge',
        'icon': 'gauge',
        'default_size_x': 4,
        'default_size_y': 4,
        'dual_data_source': True,
        'config_schema': {
            'data_source': {'type': 'select', 'options': ['integration', 'custom'], 'default': 'integration'},
            'label': {'type': 'text', 'label': 'Beschriftung', 'default': ''},
            'unit': {'type': 'text', 'label': 'Einheit', 'default': '%'},
            'max_value': {'type': 'text', 'label': 'Maximum', 'default': '100'},
        },
    },
    {
        'type': 'flex_list',
        'name': 'Flex · Liste / Tabelle',
        'icon': 'list',
        'default_size_x': 8,
        'default_size_y': 5,
        'dual_data_source': True,
        'config_schema': {
            'data_source': {'type': 'select', 'options': ['integration', 'custom'], 'default': 'integration'},
            'mode': {'type': 'select', 'label': 'Darstellung', 'options': ['list', 'table'], 'default': 'list'},
            'max_rows': {'type': 'select', 'label': 'Max. Zeilen', 'options': ['5', '10', '15'], 'default': '10'},
            'columns': {'type': 'text', 'label': 'Spalten (Komma, nur Tabelle)', 'default': ''},
        },
    },
    {
        'type': 'flex_chart',
        'name': 'Flex · Verlauf',
        'icon': 'line-chart',
        'default_size_x': 8,
        'default_size_y': 4,
        'dual_data_source': True,
        'config_schema': {
            'data_source': {'type': 'select', 'options': ['integration', 'custom'], 'default': 'integration'},
            'label': {'type': 'text', 'label': 'Beschriftung', 'default': ''},
            'chart_style': {'type': 'select', 'label': 'Stil', 'options': ['line', 'area'], 'default': 'line'},
        },
    },
    {
        'type': 'flex_banner',
        'name': 'Flex · Banner / Text',
        'icon': 'type',
        'default_size_x': 8,
        'default_size_y': 2,
        'dual_data_source': True,
        'config_schema': {
            'data_source': {'type': 'select', 'options': ['integration', 'custom'], 'default': 'integration'},
            'static_text': {'type': 'textarea', 'label': 'Statischer Text (nur Custom)', 'default': ''},
            'severity': {'type': 'select', 'label': 'Stil', 'options': ['info', 'success', 'warning', 'danger'], 'default': 'info'},
        },
    },
]


def register(app):
    pass
