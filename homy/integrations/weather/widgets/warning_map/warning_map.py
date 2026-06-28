"""Weather warning map widget.

Serves the classic DWD static PNG map *and* an interactive vector map: the
frontend renders the active-warning polygons (with per-region hover info) on
top of a light Bundesländer outline. Both vector layers come from the public
DWD GeoServer WFS, proxied here to avoid browser CORS issues and to cache the
responses (the warnings feed is small and changes slowly; the state outline is
effectively static)."""

import logging
import time

import requests
from flask import jsonify, request

from homy.integration_widget_util import (
    get_integration_for_widget,
    get_widget_config,
)

logger = logging.getLogger(__name__)

WIDGET = {
    'type': 'weather_warning_map',
    'name': 'Weather Warning Map (DWD)',
    'integration_types': ['weather'],
    'default_size_x': 6,
    'default_size_y': 6,
    'icon': 'map',
    'config_schema': {
        'integration_id': {'type': 'text', 'label': 'Integration ID', 'default': ''},
        'view': {
            'type': 'select',
            'label': 'Darstellung',
            'options': ['interactive', 'image'],
            'default': 'interactive',
        },
        'bundesland': {
            'type': 'select',
            'label': 'Gebiet',
            'options': [
                'Automatisch', 'Ganz Deutschland',
                'Baden-Württemberg', 'Bayern', 'Berlin', 'Brandenburg', 'Bremen',
                'Hamburg', 'Hessen', 'Mecklenburg-Vorpommern', 'Niedersachsen',
                'Nordrhein-Westfalen', 'Rheinland-Pfalz', 'Saarland', 'Sachsen',
                'Sachsen-Anhalt', 'Schleswig-Holstein', 'Thüringen',
            ],
            'default': 'Automatisch',
        },
    },
}

DWD_WFS = 'https://maps.dwd.de/geoserver/dwd/ows'

# layer -> (typeName, cache TTL seconds, simplify rounding digits or None)
_LAYERS = {
    'warnings': ('dwd:Warnungen_Landkreise', 300, 2),
    'states': ('dwd:Warngebiete_Bundeslaender', 86400, 2),
}

# Friendly Bundesland name -> DWD state code (BL / GC_STATE)
_NAME_TO_BL = {
    'Baden-Württemberg': 'BW', 'Bayern': 'BY', 'Berlin': 'BE', 'Brandenburg': 'BB',
    'Bremen': 'HB', 'Hamburg': 'HH', 'Hessen': 'HE', 'Mecklenburg-Vorpommern': 'MV',
    'Niedersachsen': 'NI', 'Nordrhein-Westfalen': 'NW', 'Rheinland-Pfalz': 'RP',
    'Saarland': 'SL', 'Sachsen': 'SN', 'Sachsen-Anhalt': 'ST',
    'Schleswig-Holstein': 'SH', 'Thüringen': 'TH',
}

# Numeric AGS state prefix -> BL code (used to derive Bundesland from region code)
_NUM_TO_BL = {
    '01': 'SH', '02': 'HH', '03': 'NI', '04': 'HB', '05': 'NW', '06': 'HE',
    '07': 'RP', '08': 'BW', '09': 'BY', '10': 'SL', '11': 'BE', '12': 'BB',
    '13': 'MV', '14': 'SN', '15': 'ST', '16': 'TH',
}

# BL code -> DWD static PNG region code (for image mode)
_BL_TO_IMG = {
    'SH': 'shh', 'HH': 'shh', 'NI': 'nib', 'HB': 'nib', 'NW': 'nrw', 'HE': 'hes',
    'RP': 'rps', 'SL': 'rps', 'BW': 'baw', 'BY': 'bay', 'BE': 'bbb', 'BB': 'bbb',
    'MV': 'mvp', 'SN': 'sac', 'ST': 'saa', 'TH': 'thu',
}

# Only the properties the frontend renders, to shrink the warnings payload.
_WARN_KEEP = (
    'AREADESC', 'EVENT', 'SEVERITY', 'EC_II', 'EC_GROUP', 'EC_AREA_COLOR',
    'ONSET', 'EXPIRES', 'HEADLINE', 'DESCRIPTION', 'INSTRUCTION', 'WEB', 'GC_STATE',
)


def _derive_bl(region_code, source_key):
    """Best-effort Bundesland code from the integration's warnings region code."""
    code = str(region_code or '').strip()
    digits = ''.join(c for c in code if c.isdigit())
    if not digits:
        return ''
    if str(source_key).upper() == 'DWD' and len(digits) == 9:
        num = digits[1:3]
    else:
        num = digits[:2]
    return _NUM_TO_BL.get(num, '')


def _point_in_ring(lon, lat, ring):
    """Ray-casting point-in-polygon for a single ring."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi
        ):
            inside = not inside
        j = i
    return inside


def _bl_from_latlon(lat, lon):
    """Determine the Bundesland code containing a coordinate (point-in-polygon)."""
    try:
        states = _fetch_layer('states')
    except requests.RequestException:
        return ''
    for f in states.get('features') or []:
        geom = f.get('geometry') or {}
        polys = []
        if geom.get('type') == 'Polygon':
            polys = [geom.get('coordinates') or []]
        elif geom.get('type') == 'MultiPolygon':
            polys = geom.get('coordinates') or []
        for poly in polys:
            if not poly:
                continue
            # ring[0] = exterior, rest = holes
            if _point_in_ring(lon, lat, poly[0]) and not any(
                _point_in_ring(lon, lat, hole) for hole in poly[1:]
            ):
                return (f.get('properties') or {}).get('BL') or ''
    return ''


def _resolve_bundesland(wcfg, icfg, region_code, source_key):
    """Return the selected Bundesland code ('' = whole country)."""
    sel = (wcfg.get('bundesland') or 'Automatisch').strip()
    if sel == 'Ganz Deutschland':
        return ''
    if sel != 'Automatisch':
        return _NAME_TO_BL.get(sel, '')

    # Automatisch: derive from the region code, then fall back to the city location.
    bl = _derive_bl(region_code, source_key)
    if bl:
        return bl
    loc = _geocode_city(icfg)
    if loc and loc.get('lat') is not None and loc.get('lon') is not None:
        return _bl_from_latlon(loc['lat'], loc['lon'])
    return ''


def _filter_features(payload, layer, bl):
    """Filter a cached FeatureCollection to a single Bundesland (no-op if bl empty)."""
    if not bl:
        return payload
    key = 'GC_STATE' if layer == 'warnings' else 'BL'
    feats = [
        f for f in (payload.get('features') or [])
        if (f.get('properties') or {}).get(key) == bl
    ]
    return {'type': 'FeatureCollection', 'features': feats}

_GEO_CACHE = {}  # layer -> (timestamp, payload)
_CITY_CACHE = {}  # city -> (timestamp, {lat, lon, name}|None)
_CITY_TTL = 86400


def _geocode_city(icfg):
    """Resolve the integration's configured city to lat/lon via OpenWeather.

    Cached for a day; returns None if it can't be resolved (no key, miss, etc.)."""
    from homy.integrations.weather.weather import _resolve_api_key

    city = (icfg.get('city') or '').strip()
    if not city:
        return None

    cached = _CITY_CACHE.get(city)
    now = time.time()
    if cached and (now - cached[0]) < _CITY_TTL:
        return cached[1]

    result = None
    api_key = _resolve_api_key(icfg)
    if api_key:
        try:
            res = requests.get(
                'https://api.openweathermap.org/geo/1.0/direct',
                params={'q': city, 'limit': 1, 'appid': api_key},
                timeout=6,
            )
            res.raise_for_status()
            arr = res.json()
            if arr:
                result = {
                    'lat': arr[0].get('lat'),
                    'lon': arr[0].get('lon'),
                    'name': arr[0].get('name') or city,
                }
        except (requests.RequestException, ValueError) as exc:
            logger.debug('Geocode failed for %s: %s', city, exc)

    _CITY_CACHE[city] = (now, result)
    return result


def _wfs_url(type_name):
    return (
        f'{DWD_WFS}?service=WFS&version=2.0.0&request=GetFeature'
        f'&typeName={type_name}&outputFormat=application/json&srsName=EPSG:4326'
    )


def _round_ring(ring, ndigits):
    """Round coordinates and drop consecutive duplicate points."""
    out = []
    last = None
    for pt in ring:
        try:
            rp = [round(pt[0], ndigits), round(pt[1], ndigits)]
        except (TypeError, IndexError):
            continue
        if rp != last:
            out.append(rp)
            last = rp
    # keep rings valid (need at least a triangle)
    if len(out) >= 4:
        return out
    return ring


def _simplify_geometry(geom, ndigits):
    """Reduce coordinate precision in-place for a (Multi)Polygon geometry."""
    if not isinstance(geom, dict):
        return geom
    gtype = geom.get('type')
    coords = geom.get('coordinates')
    if gtype == 'Polygon' and isinstance(coords, list):
        geom['coordinates'] = [_round_ring(r, ndigits) for r in coords]
    elif gtype == 'MultiPolygon' and isinstance(coords, list):
        geom['coordinates'] = [
            [_round_ring(r, ndigits) for r in poly] for poly in coords
        ]
    return geom


def _slim_warning_props(props):
    """Keep only the properties the frontend renders, to shrink the payload."""
    return {k: props.get(k) for k in _WARN_KEEP if k in props}


def _fetch_layer(layer):
    """Fetch (and cache) a DWD WFS GeoJSON layer."""
    type_name, ttl, ndigits = _LAYERS[layer]
    cached = _GEO_CACHE.get(layer)
    now = time.time()
    if cached and (now - cached[0]) < ttl:
        return cached[1]

    res = requests.get(
        _wfs_url(type_name),
        timeout=12,
        headers={'Accept': 'application/json'},
    )
    res.raise_for_status()
    data = res.json()

    features = data.get('features') or []
    for f in features:
        if ndigits is not None:
            _simplify_geometry(f.get('geometry'), ndigits)
        if layer == 'warnings' and isinstance(f.get('properties'), dict):
            f['properties'] = _slim_warning_props(f['properties'])
        elif layer == 'states' and isinstance(f.get('properties'), dict):
            f['properties'] = {
                'NAME': f['properties'].get('NAME'),
                'BL': f['properties'].get('BL'),
            }

    payload = {'type': 'FeatureCollection', 'features': features}
    _GEO_CACHE[layer] = (now, payload)
    return payload


def register(app):
    @app.route('/api/weather_warning_map/data', methods=['GET'], endpoint='widget_weather_warning_map_data')
    def weather_warning_map_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id required'}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({'error': 'Not Found'}), 404
        _, icfg, err, code = get_integration_for_widget(widget_id, 'weather')
        if err:
            return jsonify({'configured': False, 'message': err}), code

        source_key = icfg.get('warnings_source') or icfg.get('source', 'NINA')
        region_key = icfg.get('warnings_region_code') or icfg.get('region_code', '')
        bl = _resolve_bundesland(wcfg, icfg, region_key, source_key)

        return jsonify({
            'configured': True,
            'view': wcfg.get('view', 'interactive'),
            'bundesland': bl,                       # '' = whole country
            'image_region': _BL_TO_IMG.get(bl, 'de'),
            'region_code': region_key,
            'warnings_source': source_key,
            'location': _geocode_city(icfg),
        })

    @app.route('/api/weather_warning_map/geojson', methods=['GET'], endpoint='widget_weather_warning_map_geojson')
    def weather_warning_map_geojson():
        layer = request.args.get('layer', 'warnings')
        if layer not in _LAYERS:
            return jsonify({'error': 'Bad Request', 'message': 'unknown layer'}), 400
        bl = (request.args.get('region') or '').strip().upper()
        try:
            return jsonify(_filter_features(_fetch_layer(layer), layer, bl))
        except requests.RequestException as exc:
            logger.warning('DWD WFS fetch failed (%s): %s', layer, exc)
            return jsonify({'error': 'Upstream Error', 'message': 'DWD nicht erreichbar'}), 502
