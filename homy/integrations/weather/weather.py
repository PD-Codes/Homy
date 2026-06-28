"""Weather integration: OpenWeather forecast + DWD/NINA warnings."""

import logging
import time

import requests

from homy.database import Setting, db

logger = logging.getLogger(__name__)

INTEGRATION_TYPE = {
    'name': 'Weather',
    'icon': 'cloud-sun',
    'fields': {
        'city': {
            'type': 'text',
            'label': 'Stadt / City',
            'default': 'Berlin',
            'help': 'OpenWeather-Ort (z. B. Maitenbeth,DE). Wird bei der Gemeindesuche mit ausgefüllt.',
        },
        'api_key': {'type': 'password', 'label': 'OpenWeather API Key', 'default': ''},
        'units': {
            'type': 'select',
            'label': 'Einheiten / Units',
            'options': ['metric', 'imperial'],
            'default': 'metric',
        },
        'warnings_source': {
            'type': 'select',
            'label': 'Warnungen: Quelle',
            'options': ['NINA', 'DWD'],
            'default': 'NINA',
        },
        'warnings_region_code': {
            'type': 'text',
            'label': 'Warnungen: Regionscode',
            'default': '11000000',
            'lookup': True,
            'placeholder': 'Gemeinde suchen oder Code eintragen',
            'help': (
                'Gemeinde unten suchen: übernimmt Stadt (OpenWeather) und Regionscode. '
                'NINA: Kreis-ARS · DWD: 9-stellige WarncellId.'
            ),
            'help_links': [
                {
                    'id': 'ags_lookup',
                    'label': 'AGS im Gemeindeverzeichnis suchen',
                    'url': 'https://www.statistikportal.de/de/gemeindeverzeichnis',
                    'when_source': 'NINA',
                },
                {
                    'id': 'dwd_warncell',
                    'label': 'DWD WarncellId (Gemeinde-Warnregionen)',
                    'url': (
                        'https://www.dwd.de/DE/leistungen/warnungen_und_wetter/'
                        'warnapp_gemeinden/warnapp_gemeinden.html'
                    ),
                    'when_source': 'DWD',
                },
                {
                    'id': 'nina_map',
                    'label': 'warnung.bund.de (NINA Karte)',
                    'url': 'https://www.warnung.bund.de/',
                    'when_source': 'NINA',
                },
            ],
        },
    },
    'metrics': [
        {'path': 'temp', 'label': 'Temperatur'},
        {'path': 'humidity', 'label': 'Luftfeuchtigkeit %'},
        {'path': 'wind_speed', 'label': 'Windgeschwindigkeit'},
        {'path': 'pressure', 'label': 'Luftdruck hPa'},
        {'path': 'warnings_count', 'label': 'Anzahl Warnungen'},
        {'path': 'warnings', 'label': 'Warnungen (Array)'},
    ],
}

SEVERITY_ORDER = {'Minor': 1, 'Moderate': 2, 'Severe': 3, 'Extreme': 4}


def _resolve_api_key(config):
    api_key = config.get('api_key', '').strip()
    if not api_key:
        gk = db.session.get(Setting, 'global_weather_key')
        if gk and gk.value:
            api_key = gk.value.strip()
    return api_key


def _normalize_nina_warning(w):
    desc = w.get('description') or w.get('descriptionText') or ''
    instr = w.get('instruction') or ''
    return {
        'headline': w.get('headline') or w.get('title') or w.get('event') or 'Warnung',
        'event': w.get('event') or w.get('headline') or 'Warnung',
        'description': desc,
        'instruction': instr,
        'severity': w.get('severity') or w.get('urgency') or w.get('msgType') or 'Unknown',
        'area': w.get('areaDesc') or w.get('regionName') or w.get('area') or '',
        'starts': w.get('onset') or w.get('start') or w.get('sent') or '',
        'ends': w.get('expires') or w.get('end') or '',
        'ec_ii': w.get('eventCode') or '',
        'web': w.get('web') or 'https://www.warnung.bund.de/',
        'source': 'NINA',
    }


def _normalize_ags(code):
    from homy.integrations.weather_region_lookup import normalize_nina_ars

    return normalize_nina_ars(code)


def _parse_nina_payload(data):
    if isinstance(data, list):
        return data
    if not isinstance(data, dict):
        return []
    for key in ('alerts', 'warnings', 'items', 'data'):
        if isinstance(data.get(key), list):
            return data[key]
    if 'headline' in data or 'title' in data:
        return [data]
    return []


def _fetch_nina(ags):
    ags = _normalize_ags(ags)
    base = 'https://warnung.bund.de/api31'
    urls = [
        f'{base}/dashboard/{ags}.json',
        f'{base}/warnings/{ags}.json',
    ]
    last_error = None
    for url in urls:
        try:
            res = requests.get(url, timeout=10, headers={'Accept': 'application/json'})
            if res.status_code == 404:
                continue
            res.raise_for_status()
            raw = _parse_nina_payload(res.json())
            if raw:
                return [_normalize_nina_warning(w) for w in raw if isinstance(w, dict)]
            return []
        except Exception as exc:
            last_error = exc
            logger.debug('NINA fetch failed for %s: %s', url, exc)
    raise last_error or Exception('NINA API unreachable')


def _map_dwd_cap_properties(props):
    if not isinstance(props, dict):
        return None
    desc = props.get('DESCRIPTION') or props.get('description') or ''
    instr = props.get('INSTRUCTION') or props.get('instruction') or ''
    return {
        'headline': props.get('HEADLINE') or props.get('EVENT') or 'DWD Warnung',
        'event': props.get('EVENT') or props.get('headline') or 'DWD Warnung',
        'description': desc,
        'instruction': instr,
        'severity': props.get('SEVERITY') or props.get('level') or 'Moderate',
        'area': props.get('AREADESC') or props.get('NAME') or props.get('regionName') or '',
        'starts': props.get('ONSET') or props.get('start') or '',
        'ends': props.get('EXPIRES') or props.get('end') or '',
        'ec_ii': props.get('EC_II') or props.get('event_code') or '',
        'web': props.get('WEB') or 'https://dwd.de/warnungen',
        'source': 'DWD',
    }


def _fetch_dwd_from_wfs(warncell_id):
    """Active Gemeinde warnings via DWD Geoserver (9-digit WarncellId)."""
    cell = ''.join(c for c in str(warncell_id) if c.isdigit())
    if not cell:
        return []
    res = requests.get(
        'https://maps.dwd.de/geoserver/dwd/ows',
        params={
            'service': 'WFS',
            'version': '2.0.0',
            'request': 'GetFeature',
            'typeName': 'dwd:Warnungen_Gemeinden',
            'outputFormat': 'application/json',
            'maxFeatures': 50,
            'CQL_FILTER': f'WARNCELLID={cell}',
        },
        timeout=15,
    )
    res.raise_for_status()
    warnings = []
    for feat in res.json().get('features') or []:
        mapped = _map_dwd_cap_properties(feat.get('properties'))
        if mapped:
            warnings.append(mapped)
    return warnings


def _fetch_dwd_legacy_json(warncell_id):
    """Legacy warnapp JSON (Landkreis 8-digit); 404 = no file for this cell."""
    cell = ''.join(c for c in str(warncell_id) if c.isdigit())
    if not cell:
        return []
    urls = []
    if len(cell) >= 9:
        urls.append(f'https://www.dwd.de/DWD/warnungen/warnapp_gemeinden/json/{cell}.json')
    if len(cell) >= 8:
        urls.append(f'https://www.dwd.de/DWD/warnungen/warnapp_landkreise/json/{cell[:8]}.json')
        urls.append(f'https://www.dwd.de/DWD/warnungen/warnapp_landkreise/json/{cell}.json')

    for url in urls:
        try:
            res = requests.get(url, timeout=8)
            if res.status_code == 404:
                continue
            res.raise_for_status()
            data = res.json()
            items = data if isinstance(data, list) else data.get('warnings', [])
            warnings = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                warnings.append({
                    'headline': item.get('headline') or item.get('event') or 'DWD Warnung',
                    'event': item.get('event') or item.get('headline') or 'DWD Warnung',
                    'description': item.get('description') or '',
                    'instruction': item.get('instruction') or '',
                    'severity': item.get('level') or item.get('severity') or 'Moderate',
                    'area': item.get('regionName') or item.get('area') or '',
                    'starts': item.get('start') or '',
                    'ends': item.get('end') or '',
                    'ec_ii': item.get('event_code') or item.get('ii') or item.get('EC_II') or '',
                    'web': item.get('web') or 'https://dwd.de/warnungen',
                    'source': 'DWD',
                })
            if warnings:
                return warnings
        except Exception as exc:
            logger.debug('DWD legacy JSON failed for %s: %s', url, exc)
    return []


def _fetch_dwd(warncell):
    try:
        return _fetch_dwd_from_wfs(warncell)
    except Exception as exc:
        logger.debug('DWD WFS warnings failed, legacy fallback: %s', exc)
    return _fetch_dwd_legacy_json(warncell)


def fetch_warnings(config):
    """Fetch DWD/NINA warnings using integration config."""
    source = config.get('warnings_source') or config.get('source', 'NINA')
    region_code = (config.get('warnings_region_code') or config.get('region_code') or '11000000').strip()
    if source == 'DWD':
        return _fetch_dwd(region_code), source
    try:
        return _fetch_nina(region_code), source
    except Exception as nina_err:
        logger.warning('NINA failed, DWD fallback: %s', nina_err)
        return _fetch_dwd(region_code), 'DWD (Fallback)'


def fetch_payload(config):
    """Default fetch: current weather + warning count for metric widgets."""
    city = config.get('city', 'Berlin').strip()
    units = config.get('units', 'metric')
    api_key = _resolve_api_key(config)
    if not api_key:
        raise ValueError('OpenWeather API Key fehlt')

    res = requests.get(
        f'https://api.openweathermap.org/data/2.5/weather?q={city}&units={units}&appid={api_key}',
        timeout=5,
    )
    res.raise_for_status()
    data = res.json()

    warnings = []
    warnings_source = ''
    try:
        warnings, warnings_source = fetch_warnings(config)
    except Exception as exc:
        logger.debug('Warnings optional fetch failed: %s', exc)

    return {
        'temp': data.get('main', {}).get('temp'),
        'humidity': data.get('main', {}).get('humidity'),
        'wind_speed': data.get('wind', {}).get('speed'),
        'pressure': data.get('main', {}).get('pressure'),
        'city': data.get('name'),
        'warnings': warnings,
        'warnings_count': len(warnings),
        'warnings_source': warnings_source,
        'warnings_region_code': (
            config.get('warnings_region_code') or config.get('region_code') or '11000000'
        ).strip(),
    }


def fetch_weather_display(integration_config, widget_config=None, lang='de'):
    """Full forecast payload for the weather card widget."""
    widget_config = widget_config or {}
    city = integration_config.get('city', 'Berlin').strip()
    units = integration_config.get('units', 'metric')
    api_key = _resolve_api_key(integration_config)
    if not api_key:
        raise ValueError('OpenWeather API Key fehlt')

    if lang not in ('de', 'en'):
        lang = 'de'

    current_url = (
        f'https://api.openweathermap.org/data/2.5/weather?q={city}&units={units}'
        f'&lang={lang}&appid={api_key}'
    )
    forecast_url = (
        f'https://api.openweathermap.org/data/2.5/forecast?q={city}&units={units}'
        f'&lang={lang}&appid={api_key}'
    )
    current_res = requests.get(current_url, timeout=5)
    forecast_res = requests.get(forecast_url, timeout=5)

    if current_res.status_code == 401:
        raise ValueError('Ungültiger OpenWeather API Key.')
    if current_res.status_code == 404:
        raise ValueError(f'Stadt "{city}" wurde nicht gefunden.')

    current_res.raise_for_status()
    forecast_res.raise_for_status()
    current_data = current_res.json()
    forecast_data = forecast_res.json()

    daily_groups = {}
    today_str = time.strftime('%Y-%m-%d')
    for item in forecast_data.get('list', []):
        dt_txt = item.get('dt_txt', '')
        if not dt_txt:
            continue
        date_str = dt_txt.split(' ')[0]
        if date_str == today_str:
            continue
        daily_groups.setdefault(date_str, []).append(item)

    max_days = int(widget_config.get('forecast_days', 6) or 6)
    sorted_dates = sorted(daily_groups.keys())[:max_days]
    filtered_forecast = []
    for d_str in sorted_dates:
        items = daily_groups[d_str]
        min_temp = min(x['main']['temp_min'] for x in items)
        max_temp = max(x['main']['temp_max'] for x in items)
        max_pop = max(x.get('pop', 0) for x in items)
        mid_day_item = next(
            (x for x in items if x.get('dt_txt', '').endswith('12:00:00')),
            items[0],
        )
        filtered_forecast.append({
            'date': d_str,
            'temp': mid_day_item['main']['temp'],
            'temp_min': min_temp,
            'temp_max': max_temp,
            'rain_prob': int(max_pop * 100),
            'weather': mid_day_item['weather'][0],
            'dt': mid_day_item['dt'],
        })

    if not filtered_forecast:
        for i in range(8, len(forecast_data.get('list', [])), 8):
            item = forecast_data['list'][i]
            date_str = item.get('dt_txt', '').split(' ')[0]
            filtered_forecast.append({
                'date': date_str,
                'temp': item['main']['temp'],
                'temp_min': item['main']['temp_min'],
                'temp_max': item['main']['temp_max'],
                'rain_prob': int(item.get('pop', 0) * 100),
                'weather': item['weather'][0],
                'dt': item['dt'],
            })
            if len(filtered_forecast) >= 4:
                break

    hourly = []
    for item in forecast_data.get('list', [])[:16]:
        hourly.append({
            'time': item.get('dt_txt', ''),
            'temp': item.get('main', {}).get('temp'),
            'pop': int(item.get('pop', 0) * 100),
            'weather': item.get('weather', [{}])[0],
        })

    wind_deg = current_data.get('wind', {}).get('deg')
    wind_dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW']
    wind_label = ''
    if wind_deg is not None:
        wind_label = wind_dirs[int((wind_deg + 22.5) / 45) % 8]

    return {
        'city': current_data.get('name'),
        'country': current_data.get('sys', {}).get('country'),
        'location_label': widget_config.get('location_label', '').strip() or current_data.get('name'),
        'temp': current_data.get('main', {}).get('temp'),
        'feels_like': current_data.get('main', {}).get('feels_like'),
        'temp_min': current_data.get('main', {}).get('temp_min'),
        'temp_max': current_data.get('main', {}).get('temp_max'),
        'humidity': current_data.get('main', {}).get('humidity'),
        'pressure': current_data.get('main', {}).get('pressure'),
        'wind_speed': current_data.get('wind', {}).get('speed'),
        'wind_deg': wind_deg,
        'wind_label': wind_label,
        'weather': current_data.get('weather', [{}])[0],
        'forecast': filtered_forecast,
        'hourly': hourly,
        'units': units,
        'sunrise': current_data.get('sys', {}).get('sunrise'),
        'sunset': current_data.get('sys', {}).get('sunset'),
        'rain_prob': int(forecast_data.get('list', [{}])[0].get('pop', 0) * 100)
        if forecast_data.get('list')
        else 0,
        'updated_at': int(time.time()),
    }


def register(app):
    from flask import jsonify, request

    from homy.integrations.weather_region_lookup import lookup_regions

    @app.route('/api/weather/region-lookup', methods=['GET'])
    def weather_region_lookup():
        query = (request.args.get('q') or '').strip()
        if len(query) < 2:
            return jsonify({'results': [], 'message': 'Mindestens 2 Zeichen eingeben.'})
        try:
            limit = int(request.args.get('limit', 10))
        except ValueError:
            limit = 10
        try:
            results = lookup_regions(query, limit=limit)
            return jsonify({'ok': True, 'results': results})
        except ValueError as exc:
            return jsonify({'ok': False, 'message': str(exc), 'results': []}), 502
        except Exception as exc:
            logger.warning('Region lookup failed: %s', exc)
            return jsonify({'ok': False, 'message': str(exc), 'results': []}), 502
