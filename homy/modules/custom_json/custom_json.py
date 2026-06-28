# Custom JSON Module Backend Logic
import logging
import requests
from flask import request, jsonify
from homy.database import WidgetInstance
from homy.cache import widget_cache, cache_key as make_cache_key, should_bypass_cache

logger = logging.getLogger(__name__)

WIDGETS = [
    {
        "type": "json_graph",
        "name": "JSON Diagramm / Graph",
        "default_size_x": 12,
        "default_size_y": 8,
        "config_schema": {
            "endpoint_url": {
                "type": "text", 
                "label": "API Endpunkt URL", 
                "default": "https://api.coindesk.com/v1/bpi/currentprice.json"
            },
            "chart_type": {
                "type": "select", 
                "label": "Diagramm-Typ", 
                "options": ["line", "bar"], 
                "default": "line"
            },
            "data_path": {
                "type": "text", 
                "label": "Daten-Pfad (z.B. bpi.USD.rate_float)", 
                "default": "bpi.USD.rate_float"
            }
        }
    },
    {
        "type": "json_custom",
        "name": "JSON Daten & CSS / Custom",
        "default_size_x": 8,
        "default_size_y": 6,
        "config_schema": {
            "endpoint_url": {
                "type": "text", 
                "label": "API Endpunkt URL", 
                "default": "https://api.coindesk.com/v1/bpi/currentprice.json"
            },
            "display_keys": {
                "type": "text", 
                "label": "Anzeige-Felder (Kommasepariert, z.B. chartName, bpi.USD.rate)", 
                "default": "chartName, bpi.USD.rate"
            },
            "custom_css": {
                "type": "text", 
                "label": "Eigenes CSS (Wird auf Widget angewendet)", 
                "default": ".custom-json-label { font-weight: bold; color: var(--primary); }"
            }
        }
    }
]

CACHE_NS = 'custom_json'
CACHE_TTL = 30

def register(app):
    @app.route('/api/custom_json/fetch', methods=['GET'])
    def fetch_custom_json():
        widget_id = request.args.get('widget_id')
        endpoint_url = request.args.get('url')
        
        if not widget_id and not endpoint_url:
            return jsonify({'error': 'Bad Request', 'message': 'Either widget_id or url parameter is required'}), 400
            
        if widget_id and not endpoint_url:
            widget = WidgetInstance.query.get(widget_id)
            if not widget:
                return jsonify({'error': 'Not Found', 'message': 'Widget not found'}), 404
                
            config = widget.config
            endpoint_url = config.get('endpoint_url', '').strip()
            
        if not endpoint_url:
            return jsonify({
                'configured': False,
                'message': 'Keine API Endpunkt URL in den Widget-Einstellungen hinterlegt.'
            })
            
        ck = make_cache_key(CACHE_NS, widget_id) if widget_id else None
        if ck and not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)
            
        try:
            # Fetch endpoint URL
            res = requests.get(endpoint_url, timeout=5)
            res.raise_for_status()
            api_data = res.json()
            
            result = {
                'configured': True,
                'online': True,
                'payload': api_data
            }
            
            if ck:
                widget_cache.set(ck, result, ttl=CACHE_TTL)
            
            return jsonify(result)
            
        except Exception as e:
            logger.error(f"Error fetching custom JSON: {e}", exc_info=True)
            return jsonify({
                'configured': True,
                'online': False,
                'message': f'Fehler beim Abrufen der API-Daten: {str(e)}'
            })
