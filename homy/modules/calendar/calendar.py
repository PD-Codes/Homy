# Calendar Module Backend Logic
import logging
import datetime
import requests
from flask import request, jsonify
from icalendar import Calendar as iCal
from homy.database import WidgetInstance
from homy.cache import widget_cache, cache_key as make_cache_key, should_bypass_cache

logger = logging.getLogger(__name__)

WIDGETS = [
    {
        "type": "calendar",
        "name": "Kalender / Calendar",
        "default_size_x": 8,
        "default_size_y": 8,
        "config_schema": {
            "ics_url": {
                "type": "text", 
                "label": "iCal (.ics) URL", 
                "default": ""
            },
            "max_events": {
                "type": "select", 
                "label": "Maximale Einträge", 
                "options": ["5", "10", "15", "20"], 
                "default": "10"
            }
        }
    }
]

CACHE_NS = 'calendar'
CACHE_TTL = 600

def register(app):
    @app.route('/api/calendar/events', methods=['GET'])
    def get_calendar_events():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id parameter is required'}), 400
            
        widget = WidgetInstance.query.get(widget_id)
        if not widget:
            return jsonify({'error': 'Not Found', 'message': 'Widget not found'}), 404
            
        config = widget.config
        ics_url = config.get('ics_url', '').strip()
        max_events = int(config.get('max_events', 10))
        
        if not ics_url:
            return jsonify({
                'configured': False,
                'events': [],
                'message': 'Keine iCal (.ics) URL in den Widget-Einstellungen hinterlegt.'
            })
            
        ck = make_cache_key(CACHE_NS, ics_url)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                logger.info(f"Serving calendar data from cache for {ics_url[:30]}")
                return jsonify({
                    'configured': True,
                    'events': cached.get('events', [])
                })
            
        # Fetch fresh data
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
            res = requests.get(ics_url, headers=headers, timeout=10)
            res.raise_for_status()
            
            gcal = iCal.from_ical(res.text)
            
            events = []
            current_time = datetime.datetime.now()
            today = datetime.date.today()
            
            for component in gcal.walk():
                if component.name == "VEVENT":
                    summary = str(component.get('summary', 'Kein Titel'))
                    dtstart = component.get('dtstart')
                    dtend = component.get('dtend')
                    location = str(component.get('location', ''))
                    
                    if not dtstart:
                        continue
                        
                    start_val = dtstart.dt
                    end_val = dtend.dt if dtend else start_val
                    
                    is_all_day = not isinstance(start_val, datetime.datetime)
                    
                    # Convert to datetime for sorting/filtering comparisons
                    start_dt = None
                    if is_all_day:
                        # Convert date to datetime
                        start_dt = datetime.datetime.combine(start_val, datetime.time.min)
                    else:
                        start_dt = start_val.replace(tzinfo=None) # Keep naive comparison
                        
                    # Filter out events that ended before today
                    compare_date = today
                    event_date = start_val if is_all_day else start_val.date()
                    
                    if event_date < compare_date:
                        continue
                        
                    # Format responses
                    start_str = start_val.isoformat()
                    end_str = end_val.isoformat()
                    
                    events.append({
                        'summary': summary,
                        'start': start_str,
                        'end': end_str,
                        'all_day': is_all_day,
                        'location': location,
                        # Keep raw timestamp for sorting
                        'timestamp': start_dt.timestamp()
                    })
                    
            # Sort events chronologically
            events.sort(key=lambda e: e['timestamp'])
            
            # Slice to max
            events = events[:max_events]
            
            widget_cache.set(ck, {'events': events}, ttl=CACHE_TTL)
            
            return jsonify({
                'configured': True,
                'events': events
            })
            
        except Exception as e:
            logger.error(f"Error fetching calendar data: {e}", exc_info=True)
            return jsonify({'error': 'Server Error', 'message': 'Kalenderdaten konnten nicht geladen werden.'}), 500
