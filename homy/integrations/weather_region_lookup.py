"""Municipality lookup for NINA (Kreis-ARS) and DWD WarncellId via OpenPLZ + DWD Geoserver."""

from __future__ import annotations

import logging

import requests

logger = logging.getLogger(__name__)

OPENPLZ_SEARCH_URL = 'https://openplzapi.org/de/FullTextSearch'
DWD_WFS_URL = 'https://maps.dwd.de/geoserver/dwd/ows'
DWD_LAYER = 'dwd:Warngebiete_Gemeinden'


def normalize_nina_ars(code):
    """NINA dashboard API: Kreis-level ARS — first 5 digits + 0000000."""
    digits = ''.join(c for c in str(code or '') if c.isdigit())
    if not digits:
        return '110000000000'
    if len(digits) >= 12 and digits[5:12] == '0000000':
        return digits[:12]
    if len(digits) >= 5:
        return digits[:5].ljust(5, '0') + '0000000'
    return digits.ljust(12, '0')


def _escape_cql(value):
    return str(value or '').replace("'", "''")


def _lookup_dwd_warncell(municipality_name):
    """Resolve DWD WarncellId (9 digits) by municipality short name."""
    name = (municipality_name or '').strip()
    if not name:
        return None, None

    safe = _escape_cql(name)
    for cql in (
        f"KURZNAME = '{safe}'",
        f"NAME LIKE '%Gemeinde {safe}%'",
        f"NAME LIKE '%{safe}%'",
    ):
        try:
            res = requests.get(
                DWD_WFS_URL,
                params={
                    'service': 'WFS',
                    'version': '2.0.0',
                    'request': 'GetFeature',
                    'typeName': DWD_LAYER,
                    'outputFormat': 'application/json',
                    'maxFeatures': 3,
                    'CQL_FILTER': cql,
                },
                timeout=15,
            )
            if not res.ok:
                continue
            features = res.json().get('features') or []
            for feat in features:
                props = feat.get('properties') or {}
                cell_id = props.get('WARNCELLID')
                if cell_id is not None:
                    return str(cell_id), props.get('NAME') or props.get('KURZNAME')
        except Exception as exc:
            logger.debug('DWD WFS lookup failed (%s): %s', cql, exc)
    return None, None


def _dedupe_openplz_hits(items, limit):
    seen = set()
    municipalities = []
    for row in items:
        if not isinstance(row, dict):
            continue
        muni = row.get('municipality') or {}
        key = (muni.get('key') or '').strip()
        if not key or key in seen:
            continue
        seen.add(key)
        municipalities.append({
            'name': (muni.get('name') or row.get('locality') or '').strip(),
            'ags': key,
            'district': (row.get('district') or {}).get('name', ''),
            'state': (row.get('federalState') or {}).get('name', ''),
            'postal_code': (row.get('postalCode') or '').strip(),
        })
        if len(municipalities) >= limit:
            break
    return municipalities


def lookup_regions(query, limit=10):
    """
    Search German municipalities by name; return NINA Kreis-ARS and DWD WarncellId.
    """
    q = (query or '').strip()
    if len(q) < 2:
        return []

    limit = max(1, min(int(limit or 10), 20))

    try:
        res = requests.get(
            OPENPLZ_SEARCH_URL,
            params={'searchTerm': q},
            timeout=12,
            headers={'Accept': 'application/json'},
        )
        res.raise_for_status()
        items = res.json()
    except Exception as exc:
        logger.warning('OpenPLZ lookup failed for %r: %s', q, exc)
        raise ValueError(f'Ortsuche fehlgeschlagen: {exc}') from exc

    if not isinstance(items, list):
        items = []

    results = []
    for muni in _dedupe_openplz_hits(items, limit):
        name = muni['name']
        if not name:
            continue
        nina_ars = normalize_nina_ars(muni['ags'])
        dwd_cell, dwd_label = _lookup_dwd_warncell(name)
        district = muni['district']
        state = muni['state']
        label_parts = [name]
        if district:
            label_parts.append(district)
        if state:
            label_parts.append(f'({state})')
        results.append({
            'label': ', '.join(label_parts),
            'municipality': name,
            'district': district,
            'state': state,
            'postal_code': muni['postal_code'],
            'ags': muni['ags'],
            'nina_ars': nina_ars,
            'dwd_warncell': dwd_cell or '',
            'dwd_name': dwd_label or '',
        })
    return results
