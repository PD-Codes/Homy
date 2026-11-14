"""Start page widgets.

These widgets are rendered by the new frontend (frontend/src/modules) in the web app
and in the browser add-on. The server only needs to know the types and their
config schema so they can be stored on server tabs. No backend routes.
"""

WIDGETS = [
    {
        'type': 'search_bar',
        'name': 'Suche / Search',
        'icon': 'search',
        'default_size_x': 24,
        'default_size_y': 2,
        'config_schema': {
            'engine': {
                'type': 'select',
                'label': 'Suchmaschine',
                'options': ['duckduckgo', 'google', 'bing', 'startpage', 'ecosia', 'custom'],
                'default': 'duckduckgo',
            },
            'custom_url': {
                'type': 'text',
                'label': 'Eigene Such-URL (%s = Suchbegriff)',
                'default': '',
            },
            'search_favorites': {
                'type': 'select',
                'label': 'Favoriten mit durchsuchen',
                'options': ['Ja', 'Nein'],
                'default': 'Ja',
            },
            'autofocus': {
                'type': 'select',
                'label': 'Automatisch fokussieren',
                'options': ['Ja', 'Nein'],
                'default': 'Ja',
            },
        },
    },
    {
        'type': 'quick_weather',
        'name': 'Wetter kompakt / Quick weather',
        'icon': 'cloud-sun',
        'default_size_x': 6,
        'default_size_y': 4,
        'config_schema': {
            'location': {'type': 'text', 'label': 'Ort', 'default': 'Berlin'},
            'units': {
                'type': 'select',
                'label': 'Einheiten',
                'options': ['metric', 'imperial'],
                'default': 'metric',
            },
            'days': {
                'type': 'select',
                'label': 'Vorhersage-Tage',
                'options': ['0', '3', '5'],
                'default': '3',
            },
        },
    },
]


def register(app):
    pass
