# Favorites module logic

WIDGETS = [
    {
        "type": "favorites",
        "name": "Lesezeichen / Bookmarks",
        "default_size_x": 12,
        "default_size_y": 6,
        "config_schema": {
            "category_filter": {
                "type": "text", 
                "label": "Kategorie-Filter (Leer für alle)", 
                "default": ""
            },
            "layout_mode": {
                "type": "select", 
                "label": "Anzeige Modus", 
                "options": ["Grid", "List", "Buttons"], 
                "default": "Grid"
            },
            "tile_size": {
                "type": "select",
                "label": "Kachelgröße (Grid/Buttons)",
                "options": ["Klein", "Mittel", "Groß"],
                "default": "Mittel",
            },
            "group_by_category": {
                "type": "select", 
                "label": "Nach Kategorien gruppieren", 
                "options": ["Ja", "Nein"], 
                "default": "Ja"
            }
        }
    }
]

def register(app):
    # Core APIs are in app.py
    pass
