# Clock widget — client-side only, no backend routes
WIDGETS = [
    {
        "type": "clock",
        "name": "Uhr / Clock",
        "default_size_x": 4,
        "default_size_y": 2,
        "config_schema": {
            "timezone": {
                "type": "text",
                "label": "Zeitzone (IANA, z.B. Europe/Berlin)",
                "default": "Europe/Berlin",
            },
            "format_24h": {
                "type": "select",
                "label": "24-Stunden-Format",
                "options": ["Ja", "Nein"],
                "default": "Ja",
            },
            "show_seconds": {
                "type": "select",
                "label": "Sekunden anzeigen",
                "options": ["Ja", "Nein"],
                "default": "Ja",
            },
            "show_date": {
                "type": "select",
                "label": "Datum anzeigen",
                "options": ["Ja", "Nein"],
                "default": "Ja",
            },
            "show_timezone": {
                "type": "select",
                "label": "Zeitzone anzeigen",
                "options": ["Ja", "Nein"],
                "default": "Nein",
            },
            "label": {
                "type": "text",
                "label": "Beschriftung (optional)",
                "default": "",
            },
        },
    }
]

def register(app):
    pass
