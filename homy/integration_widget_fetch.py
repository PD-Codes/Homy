"""Shared data fetchers for integration-backed dashboard widgets."""

import importlib
import xml.etree.ElementTree as ET

import requests

from homy.integration_arr_helpers import (
    fetch_arr_for_type,
    fetch_bazarr_stats,
    fetch_prowlarr_stats,
    normalize_arr_queue_item,
)
from homy.net_guard import ensure_url_allowed


def fetch_glances_quick(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    if not base:
        raise ValueError('Glances URL required')
    # SSRF guard: reject metadata/link-local (and private, if configured) targets
    ensure_url_allowed(f'{base}/')
    res = requests.get(f'{base}/api/3/quicklook', timeout=8)
    res.raise_for_status()
    data = res.json()
    disk_percent = None
    try:
        fs = requests.get(f'{base}/api/3/fs', timeout=8).json()
        mount = (config.get('disk_mount') or '/').strip() or '/'
        for entry in fs if isinstance(fs, list) else []:
            if entry.get('mnt_point') == mount:
                disk_percent = entry.get('percent')
                break
        if disk_percent is None and fs:
            disk_percent = fs[0].get('percent')
    except Exception:
        pass
    return {
        'cpu_percent': round(float(data.get('cpu') or 0), 1),
        'mem_percent': round(float(data.get('mem') or 0), 1),
        'disk_percent': disk_percent,
    }


def fetch_uptime_kuma_monitors(config):
    base = (config.get('base_url') or '').strip().rstrip('/')
    slug = (config.get('slug') or '').strip()
    api_key = (config.get('api_key') or '').strip()
    if not base:
        raise ValueError('Uptime Kuma Base URL required')
    # SSRF guard: reject metadata/link-local (and private, if configured) targets
    ensure_url_allowed(f'{base}/')

    monitors = []
    if slug:
        res = requests.get(f'{base}/api/status-page/{slug}', timeout=10)
        res.raise_for_status()
        data = res.json()
        for group in data.get('publicGroupList') or []:
            if not isinstance(group, dict):
                continue
            for item in group.get('monitorList') or []:
                if not isinstance(item, dict):
                    continue
                monitors.append(_normalize_uptime_monitor(item))
    elif api_key:
        headers = {'Authorization': f'Bearer {api_key}', 'Accept': 'application/json'}
        res = requests.get(f'{base}/api/entry', headers=headers, timeout=10)
        res.raise_for_status()
        entries = res.json()
        if not isinstance(entries, list):
            entries = entries.get('entries') or entries.get('data') or []
        for item in entries:
            if isinstance(item, dict):
                monitors.append(_normalize_uptime_monitor(item))
    else:
        raise ValueError('API key or status-page slug required')

    up = sum(1 for m in monitors if m.get('status') == 'up')
    down = sum(1 for m in monitors if m.get('status') == 'down')
    return {
        'up_count': up,
        'down_count': down,
        'monitor_count': len(monitors),
        'monitors': monitors,
    }


def _normalize_uptime_monitor(item):
    status = item.get('status')
    if status is None and 'active' in item:
        status = 1 if item.get('active') else 0
    up = status in (1, 'up', 'UP', True, '1')
    return {
        'name': item.get('monitor_name') or item.get('name') or item.get('title') or 'Monitor',
        'status': 'up' if up else 'down',
        'type': item.get('monitor_type') or item.get('type') or '',
    }


def fetch_adguard_status(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    username = (config.get('username') or '').strip()
    password = config.get('password') or ''
    if not base or not username:
        raise ValueError('AdGuard URL and username required')
    auth = (username, password)
    status = requests.get(f'{base}/control/status', auth=auth, timeout=10)
    status.raise_for_status()
    stats = requests.get(f'{base}/control/stats', auth=auth, timeout=10)
    stats.raise_for_status()
    status_data = status.json()
    stats_data = stats.json()
    queries = stats_data.get('num_dns_queries') or stats_data.get('dns_queries') or 0
    blocked = stats_data.get('blocked_filtering') or 0
    pct = round((blocked / queries) * 100, 1) if queries else 0
    return {
        'protection_enabled': status_data.get('protection_enabled', False),
        'dns_queries': queries,
        'blocked_filtering': blocked,
        'blocked_percentage': pct,
    }


def fetch_arr_queue_list(integration, config, limit=10):
    limit = int(limit or 10)
    payload = fetch_arr_for_type(integration.type, config)
    records = payload.get('queue') or []
    items = [
        normalize_arr_queue_item(r, integration.type)
        for r in records[: max(1, min(limit, 30))]
        if isinstance(r, dict)
    ]
    return {
        'app_name': payload.get('app_name') or integration.type,
        'version': payload.get('version', ''),
        'queue_total': payload.get('queue_total', len(records)),
        'queue_count': payload.get('queue_count', len(records)),
        'items': items,
    }


def fetch_glances_extended(config):
    """Glances data with progress bars, top processes, and network I/O."""
    base = (config.get('server_url') or '').strip().rstrip('/')
    if not base:
        raise ValueError('Glances URL required')

    quick = requests.get(f'{base}/api/3/quicklook', timeout=8)
    quick.raise_for_status()
    q = quick.json()

    disk_percent = None
    mount = (config.get('disk_mount') or '/').strip() or '/'
    try:
        fs = requests.get(f'{base}/api/3/fs', timeout=6).json()
        for entry in fs if isinstance(fs, list) else []:
            if entry.get('mnt_point') == mount:
                disk_percent = round(float(entry.get('percent') or 0), 1)
                break
        if disk_percent is None and isinstance(fs, list) and fs:
            disk_percent = round(float(fs[0].get('percent') or 0), 1)
    except Exception:
        pass

    processes = []
    try:
        proc_res = requests.get(f'{base}/api/3/processlist', timeout=6)
        proc_res.raise_for_status()
        raw_proc = proc_res.json() or []
        for p in sorted(raw_proc, key=lambda x: float(x.get('cpu_percent') or 0), reverse=True)[:8]:
            processes.append({
                'name': p.get('name') or p.get('cmdline') or 'process',
                'cpu': round(float(p.get('cpu_percent') or 0), 1),
                'mem': round(float(p.get('memory_percent') or 0), 1),
                'status': p.get('status') or '',
            })
    except Exception:
        pass

    net_rx = net_tx = 0
    try:
        net_res = requests.get(f'{base}/api/3/network', timeout=6)
        net_res.raise_for_status()
        for iface in net_res.json() or []:
            if iface.get('interface_name', '').startswith('lo'):
                continue
            net_rx += int(iface.get('bytes_recv') or 0)
            net_tx += int(iface.get('bytes_sent') or 0)
    except Exception:
        pass

    return {
        'cpu_percent': round(float(q.get('cpu') or 0), 1),
        'mem_percent': round(float(q.get('mem') or 0), 1),
        'swap_percent': round(float(q.get('swap') or 0), 1),
        'disk_percent': disk_percent,
        'disk_mount': mount,
        'net_rx_mb': round(net_rx / 1_048_576, 1),
        'net_tx_mb': round(net_tx / 1_048_576, 1),
        'processes': processes,
    }


def fetch_sabnzbd_history(config, limit=10):
    """SABnzbd completed download history."""
    try:
        limit = max(1, min(int(limit or 10), 30))
    except (TypeError, ValueError):
        limit = 10
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('SABnzbd URL and API key required')
    res = requests.get(
        f'{base}/api',
        params={'mode': 'history', 'output': 'json', 'apikey': api_key, 'limit': limit},
        timeout=10,
    )
    res.raise_for_status()
    slots = ((res.json() or {}).get('history') or {}).get('slots') or []
    items = []
    for slot in slots[:limit]:
        if not isinstance(slot, dict):
            continue
        size_mb = round(float(slot.get('bytes') or 0) / 1_048_576, 1)
        items.append({
            'title': slot.get('name') or slot.get('filename') or 'Download',
            'status': slot.get('status') or '',
            'size_mb': size_mb,
            'completed': slot.get('completed') or 0,
            'category': slot.get('cat') or '',
        })
    return {'items': items, 'count': len(items)}


def fetch_sabnzbd_queue(config, limit=10):
    limit = int(limit or 10)
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('SABnzbd URL and API key required')
    res = requests.get(
        f'{base}/api',
        params={'mode': 'queue', 'output': 'json', 'apikey': api_key},
        timeout=10,
    )
    res.raise_for_status()
    queue = (res.json() or {}).get('queue') or {}
    slots = queue.get('slots') or []
    items = []
    for slot in slots[: max(1, min(int(limit), 20))]:
        if not isinstance(slot, dict):
            continue
        items.append({
            'title': slot.get('filename') or slot.get('name') or 'Download',
            'status': slot.get('status') or '',
            'percentage': slot.get('percentage') or '0',
            'mb': slot.get('mb') or '',
        })
    return {
        'queue_size': queue.get('noofslots', len(slots)),
        'speed': queue.get('speed', '0'),
        'kbpersec': queue.get('kbpersec', '0'),
        'paused': queue.get('paused', False),
        'items': items,
    }


def fetch_torrent_status(integration_type, config):
    itype = (integration_type or '').lower()
    if itype == 'qbittorrent':
        return _fetch_qbittorrent_status(config)
    if itype == 'transmission':
        return _fetch_transmission_status(config)
    raise ValueError(f'Unsupported torrent integration: {integration_type}')


def _qbittorrent_session(base, user, pwd):
    """Return a requests.Session authenticated against qBittorrent WebUI."""
    sess = requests.Session()
    if user:
        resp = sess.post(
            f'{base}/api/v2/auth/login',
            data={'username': user, 'password': pwd or ''},
            timeout=8,
        )
        if resp.text.strip() != 'Ok.':
            raise ValueError(f'qBittorrent login fehlgeschlagen: {resp.text[:80]}')
    return sess


def _fetch_qbittorrent_status(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    if not base:
        raise ValueError('qBittorrent URL required')
    user = (config.get('username') or '').strip()
    pwd = config.get('password') or ''
    sess = _qbittorrent_session(base, user, pwd)
    transfer = sess.get(f'{base}/api/v2/transfer/info', timeout=10)
    transfer.raise_for_status()
    tdata = transfer.json()
    torrents = sess.get(
        f'{base}/api/v2/torrents/info',
        params={'filter': 'active'},
        timeout=10,
    )
    torrents.raise_for_status()
    active = []
    for tor in (torrents.json() or [])[:10]:
        active.append({
            'name': tor.get('name', 'Torrent'),
            'progress': round(float(tor.get('progress', 0)) * 100, 1),
            'dlspeed': tor.get('dlspeed', 0),
            'upspeed': tor.get('upspeed', 0),
            'state': tor.get('state', ''),
            'eta': tor.get('eta', -1),
        })
    return {
        'client': 'qBittorrent',
        'dl_speed': tdata.get('dl_info_speed', 0),
        'up_speed': tdata.get('up_info_speed', 0),
        'active_count': len(active),
        'torrents': active,
    }


def _transmission_rpc(base, username, password, method, arguments=None):
    url = f'{base}/transmission/rpc'
    auth = None
    if (username or '').strip():
        auth = (username.strip(), password or '')
    payload = {'method': method}
    if arguments:
        payload['arguments'] = arguments
    headers = {'Content-Type': 'application/json'}
    session_id = None
    for _ in range(2):
        req_headers = dict(headers)
        if session_id:
            req_headers['X-Transmission-Session-Id'] = session_id
        res = requests.post(url, json=payload, headers=req_headers, auth=auth, timeout=10)
        if res.status_code == 409:
            session_id = res.headers.get('X-Transmission-Session-Id')
            continue
        res.raise_for_status()
        return res.json()
    res.raise_for_status()
    return {}


def _fetch_transmission_status(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    if not base:
        raise ValueError('Transmission URL required')
    user = config.get('username')
    pwd = config.get('password')
    session = _transmission_rpc(base, user, pwd, 'session-get')
    args = session.get('arguments') or {}
    torrents_res = _transmission_rpc(
        base, user, pwd, 'torrent-get',
        {'fields': ['id', 'name', 'percentDone', 'rateDownload', 'rateUpload', 'status']},
    )
    torrents = (torrents_res.get('arguments') or {}).get('torrents') or []
    active = []
    for tor in torrents:
        if tor.get('status') not in (4, 3):
            continue
        active.append({
            'name': tor.get('name', 'Torrent'),
            'progress': round(float(tor.get('percentDone', 0)) * 100, 1),
            'dlspeed': tor.get('rateDownload', 0),
            'upspeed': tor.get('rateUpload', 0),
        })
        if len(active) >= 8:
            break
    return {
        'client': 'Transmission',
        'dl_speed': args.get('download-speed', 0),
        'up_speed': args.get('upload-speed', 0),
        'active_count': len(active),
        'torrents': active,
    }


def fetch_media_sessions(integration_type, config):
    itype = (integration_type or '').lower()
    if itype == 'jellyfin':
        return _fetch_jellyfin_sessions(config)
    if itype == 'emby':
        return _fetch_emby_sessions(config)
    raise ValueError(f'Unsupported media integration: {integration_type}')


def _fetch_jellyfin_sessions(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('Jellyfin URL and API key required')
    headers = {'X-MediaBrowser-Token': api_key}
    sessions = requests.get(f'{base}/Sessions', headers=headers, timeout=8).json()
    counts = requests.get(f'{base}/Items/Counts', headers=headers, timeout=8).json()
    return _normalize_media_sessions(sessions, counts)


def _fetch_emby_sessions(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('Emby URL and API key required')
    headers = {'X-Emby-Token': api_key, 'X-MediaBrowser-Token': api_key}
    sessions = requests.get(f'{base}/Sessions', headers=headers, timeout=8).json()
    counts = requests.get(f'{base}/Items/Counts', headers=headers, timeout=8).json()
    return _normalize_media_sessions(sessions, counts)


def _normalize_media_sessions(sessions, counts):
    active = []
    for s in sessions if isinstance(sessions, list) else []:
        item = s.get('NowPlayingItem')
        if not item:
            continue
        pos = (s.get('PlayState') or {}).get('PositionTicks') or 0
        runtime = item.get('RunTimeTicks') or 1
        progress = round((pos / runtime) * 100, 1) if runtime else 0
        active.append({
            'user': s.get('UserName') or 'User',
            'title': item.get('Name') or 'Playing',
            'type': item.get('Type') or '',
            'progress': progress,
        })
    return {
        'active_sessions': len(active),
        'total_movies': counts.get('MovieCount', 0),
        'total_series': counts.get('SeriesCount', 0),
        'sessions': active,
    }


def fetch_tautulli_streams(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('Tautulli URL and API key required')
    res = requests.get(
        f'{base}/api/v2',
        params={'apikey': api_key, 'cmd': 'get_activity'},
        timeout=10,
    )
    res.raise_for_status()
    data = (res.json() or {}).get('response', {}).get('data', {})
    sessions = data.get('sessions') or []
    streams = []
    for s in sessions if isinstance(sessions, list) else []:
        streams.append({
            'user': s.get('user') or s.get('friendly_name') or 'User',
            'title': s.get('title') or s.get('full_title') or 'Stream',
            'transcode': s.get('video_decision') == 'transcode' or s.get('transcode_decision') == 'transcode',
            'progress': round(float(s.get('progress_percent') or 0), 1),
        })
    return {
        'stream_count': len(streams),
        'streams': streams,
        'transcodes': sum(1 for x in streams if x.get('transcode')),
    }


def fetch_plex_status(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    token = (config.get('api_token') or '').strip()
    if not base or not token:
        raise ValueError('Plex URL and token required')
    headers = {'Accept': 'application/xml', 'X-Plex-Token': token}
    sessions_res = requests.get(f'{base}/status/sessions', headers=headers, timeout=8)
    sessions_res.raise_for_status()
    root = ET.fromstring(sessions_res.content)
    streams = []
    for video in root.findall('.//Video'):
        user = video.find('User')
        streams.append({
            'user': user.attrib.get('title', 'User') if user is not None else 'User',
            'title': video.attrib.get('title', 'Playing'),
            'type': 'video',
            'progress': 0,
        })
    for track in root.findall('.//Track'):
        user = track.find('User')
        streams.append({
            'user': user.attrib.get('title', 'User') if user is not None else 'User',
            'title': track.attrib.get('title', 'Playing'),
            'type': 'music',
            'progress': 0,
        })
    sections_res = requests.get(f'{base}/library/sections', headers=headers, timeout=8)
    sections_res.raise_for_status()
    sections = ET.fromstring(sections_res.content)
    libraries = len(sections.findall('.//Directory'))
    return {
        'active_streams': len(streams),
        'library_count': libraries,
        'streams': streams,
    }


OVERSEERR_REQUEST_STATUS = {
    1: 'Ausstehend',
    2: 'Genehmigt',
    3: 'Abgelehnt',
    4: 'Fehlgeschlagen',
    5: 'Abgeschlossen',
}

OVERSEERR_MEDIA_STATUS = {
    1: 'Unbekannt',
    2: 'Ausstehend',
    3: 'Wird geladen',
    4: 'Teilweise verfügbar',
    5: 'Verfügbar',
    6: 'Gelöscht',
}

OVERSEERR_MEDIA_TYPE_LABEL = {
    'movie': 'Film',
    'tv': 'Serie',
}

OVERSEERR_STATUS_FILTER_OPTIONS = (
    (1, 'Ausstehend'),
    (2, 'Genehmigt'),
    (3, 'Abgelehnt'),
    (4, 'Fehlgeschlagen'),
    (5, 'Abgeschlossen'),
)


def _overseerr_parse_hidden_statuses(widget_config=None):
    """Return status codes to hide from the widget list (empty = show all)."""
    widget_config = widget_config or {}
    raw = widget_config.get('hidden_request_statuses') or ''
    hidden = set()
    for part in str(raw).split(','):
        part = part.strip()
        if part.isdigit():
            hidden.add(int(part))
    return hidden


def _overseerr_media_type(request_row, media):
    media_type = (request_row.get('type') or media.get('mediaType') or media.get('type') or '').lower()
    if media_type in OVERSEERR_MEDIA_TYPE_LABEL:
        return media_type
    if media.get('tvdbId'):
        return 'tv'
    return 'movie'


def _overseerr_format_seasons(request_row, media_type):
    if media_type != 'tv':
        return ''
    seasons = request_row.get('seasons')
    if seasons == 'all':
        return 'Alle Staffeln'
    if not isinstance(seasons, list) or not seasons:
        return ''
    nums = []
    for entry in seasons:
        if isinstance(entry, dict):
            num = entry.get('seasonNumber')
        elif isinstance(entry, (int, float)):
            num = int(entry)
        else:
            num = None
        if num is not None:
            nums.append(int(num))
    if not nums:
        return ''
    nums = sorted(set(nums))
    if len(nums) == 1:
        return f'Staffel {nums[0]}'
    return 'Staffeln ' + ', '.join(str(n) for n in nums)


def _overseerr_lookup_media(base, headers, cache, tmdb_id, media_type):
    key = (media_type, tmdb_id)
    if key in cache:
        return cache[key]

    title = ''
    year = ''
    poster_path = None
    resolved_type = media_type

    if tmdb_id:
        paths = ('movie', 'tv') if media_type == 'movie' else ('tv', 'movie')
        for path in paths:
            try:
                res = requests.get(f'{base}/api/v1/{path}/{tmdb_id}', headers=headers, timeout=8)
                if res.status_code == 404:
                    continue
                res.raise_for_status()
                data = res.json()
                title = (data.get('title') or data.get('name') or '').strip()
                date = data.get('releaseDate') or data.get('firstAirDate') or ''
                year = str(date)[:4] if date else ''
                poster_path = data.get('posterPath')
                if title:
                    resolved_type = path
                    break
            except requests.RequestException:
                continue

    if not title and tmdb_id:
        label = OVERSEERR_MEDIA_TYPE_LABEL.get(media_type, 'Medien')
        title = f'{label} #{tmdb_id}'

    cache[key] = (title, year, poster_path, resolved_type)
    return cache[key]


def fetch_overseerr_requests(config, limit=8, widget_config=None):
    limit = int(limit or 8)
    hidden_statuses = _overseerr_parse_hidden_statuses(widget_config)
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('Overseerr URL and API key required')
    headers = {'X-Api-Key': api_key, 'Accept': 'application/json'}
    count_res = requests.get(f'{base}/api/v1/request/count', headers=headers, timeout=10)
    count_res.raise_for_status()
    counts = count_res.json()
    fetch_take = min(100, max(limit * 4, 24))
    req_res = requests.get(
        f'{base}/api/v1/request',
        params={'take': fetch_take, 'skip': 0, 'sort': 'added'},
        headers=headers,
        timeout=10,
    )
    req_res.raise_for_status()
    body = req_res.json()
    results = body.get('results') if isinstance(body, dict) else body
    requests_list = []
    media_cache = {}
    for r in (results or []):
        if not isinstance(r, dict):
            continue
        req_status = r.get('status')
        if req_status in hidden_statuses:
            continue
        if len(requests_list) >= limit:
            break
        media = r.get('media') or {}
        media_type = _overseerr_media_type(r, media)
        tmdb_id = media.get('tmdbId')
        title, year, poster_path, media_type = _overseerr_lookup_media(
            base, headers, media_cache, tmdb_id, media_type,
        )
        media_status = media.get('status')
        requests_list.append({
            'id': r.get('id'),
            'title': title,
            'year': year,
            'type': media_type,
            'type_label': OVERSEERR_MEDIA_TYPE_LABEL.get(media_type, media_type),
            'status': req_status,
            'status_label': OVERSEERR_REQUEST_STATUS.get(req_status, str(req_status or '')),
            'media_status': media_status,
            'media_status_label': OVERSEERR_MEDIA_STATUS.get(media_status, ''),
            'requested_by': (r.get('requestedBy') or {}).get('displayName') or '',
            'created_at': r.get('createdAt') or '',
            'updated_at': r.get('updatedAt') or '',
            'seasons': _overseerr_format_seasons(r, media_type),
            'is_4k': bool(r.get('is4k')),
            'poster_path': poster_path,
        })
    return {
        'pending': counts.get('pending', 0),
        'approved': counts.get('approved', 0),
        'available': counts.get('available', 0),
        'processing': counts.get('processing', 0),
        'requests': requests_list,
        'filtered': bool(hidden_statuses),
    }


def fetch_jellyfin_recent(config, limit=10, media_types='Movie,Episode'):
    limit = int(limit or 10)
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('Jellyfin URL and API key required')
    headers = {'X-MediaBrowser-Token': api_key}
    params = {
        'SortBy': 'DateCreated',
        'SortOrder': 'Descending',
        'Recursive': 'true',
        'IncludeItemTypes': media_types,
        'Fields': 'SeriesName,DateCreated,Overview',
        'Limit': limit,
        'EnableImages': 'true',
        'ImageTypeLimit': 1,
        'EnableImageTypes': 'Primary',
    }
    res = requests.get(f'{base}/Items', headers=headers, params=params, timeout=8)
    res.raise_for_status()
    raw = res.json().get('Items') or []
    items = []
    for item in raw:
        title = item.get('Name') or ''
        if item.get('Type') == 'Episode':
            series = item.get('SeriesName') or ''
            ep_num = item.get('IndexNumber')
            season = item.get('ParentIndexNumber')
            if series:
                title = f'{series} — {("S%02dE%02d " % (season, ep_num)) if (season and ep_num) else ""}{title}'
        img_tag = item.get('ImageTags') or {}
        image_url = None
        if img_tag.get('Primary'):
            image_url = f'{base}/Items/{item["Id"]}/Images/Primary?maxHeight=80&quality=80'
        items.append({
            'id': item.get('Id'),
            'title': title,
            'type': item.get('Type') or '',
            'date': (item.get('DateCreated') or '')[:10],
            'image_url': image_url,
        })
    return {'items': items, 'count': len(items)}


def fetch_arr_calendar(integration_type, config, days_ahead=7):
    import datetime as _dt
    try:
        days_ahead = max(1, min(int(days_ahead or 7), 90))
    except (TypeError, ValueError):
        days_ahead = 7
    itype = (integration_type or '').lower()
    version = 'v3'
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('Server URL und API Key erforderlich')
    headers = {'X-Api-Key': api_key, 'Accept': 'application/json'}
    now = _dt.datetime.utcnow()
    start = now.strftime('%Y-%m-%d')
    end = (now + _dt.timedelta(days=days_ahead)).strftime('%Y-%m-%d')
    params = {'unmonitored': 'false', 'start': start, 'end': end}
    if itype == 'sonarr':
        params['includeSeries'] = 'true'
    res = requests.get(f'{base}/api/{version}/calendar', headers=headers, params=params, timeout=10)
    res.raise_for_status()
    raw = res.json() or []
    items = []
    for entry in raw[:30]:
        if itype == 'sonarr':
            series = (entry.get('series') or {}).get('title') or entry.get('seriesTitle') or ''
            ep = entry.get('episodeNumber')
            season = entry.get('seasonNumber')
            ep_label = f'S{season:02d}E{ep:02d}' if (season is not None and ep is not None) else ''
            title = f'{series} {ep_label} — {entry.get("title") or ""}'.strip(' —')
            air_date = (entry.get('airDateUtc') or entry.get('airDate') or '')[:10]
            has_file = bool(entry.get('hasFile'))
        else:
            title = entry.get('title') or ''
            air_date = (entry.get('physicalRelease') or entry.get('digitalRelease') or entry.get('inCinemas') or '')[:10]
            has_file = bool(entry.get('hasFile'))
        items.append({'title': title, 'date': air_date, 'has_file': has_file})
    items.sort(key=lambda x: x['date'])
    return {'items': items, 'count': len(items), 'start': start, 'end': end}


def fetch_rss_feed(config, limit=10):
    limit = int(limit or 10)
    rss_mod = importlib.import_module('homy.integrations.rss.rss')
    payload = rss_mod.fetch_payload(config)
    items = (payload.get('items') or [])[: max(1, min(int(limit), 30))]
    return {
        'feed_count': payload.get('feed_count', 0),
        'items': items,
    }


def fetch_portainer_containers(config, limit=15):
    limit = int(limit or 15)
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('Portainer URL and API key required')
    headers = {'X-API-Key': api_key}
    endpoints = requests.get(f'{base}/api/endpoints', headers=headers, timeout=10)
    endpoints.raise_for_status()
    endpoint_list = endpoints.json() if isinstance(endpoints.json(), list) else []
    containers = []
    for ep in endpoint_list:
        eid = ep.get('Id')
        if eid is None:
            continue
        try:
            res = requests.get(
                f'{base}/api/endpoints/{eid}/docker/containers/json',
                headers=headers,
                params={'all': 'true'},
                timeout=10,
            )
            res.raise_for_status()
            raw = res.json()
            for c in raw if isinstance(raw, list) else []:
                names = c.get('Names') or []
                name = names[0].strip('/') if names else c.get('Id', '')[:12]
                containers.append({
                    'name': name,
                    'state': c.get('State', 'unknown'),
                    'status': c.get('Status', ''),
                    'endpoint': ep.get('Name') or f'Endpoint {eid}',
                })
                if len(containers) >= limit:
                    break
        except Exception:
            continue
        if len(containers) >= limit:
            break
    running = sum(1 for c in containers if c.get('state') == 'running')
    return {
        'endpoints_count': len(endpoint_list),
        'container_count': len(containers),
        'running_count': running,
        'containers': containers,
    }


def fetch_prowlarr_indexers(config):
    payload = fetch_prowlarr_stats(config.get('server_url'), config.get('api_key'))
    indexers = []
    for idx in (payload.get('indexers') or [])[:20]:
        if not isinstance(idx, dict):
            continue
        indexers.append({
            'name': idx.get('name') or 'Indexer',
            'enabled': idx.get('enable', False),
            'protocol': idx.get('protocol') or '',
        })
    return {
        'version': payload.get('version', ''),
        'indexers_total': payload.get('indexers_total', 0),
        'indexers_enabled': payload.get('indexers_enabled', 0),
        'indexers': indexers,
    }


def fetch_bazarr_missing(config):
    payload = fetch_bazarr_stats(config.get('server_url'), config.get('api_key'))
    return {
        'version': payload.get('version', ''),
        'movies': payload.get('movies', 0),
        'episodes': payload.get('episodes', 0),
        'missing_movies': payload.get('missing_movies', 0),
        'missing_episodes': payload.get('missing_episodes', 0),
    }


def _resolve_json_path(data, path):
    """Walk dot-notation path through nested dicts/lists. Returns (value, found)."""
    if not path:
        return data, True
    parts = str(path).split('.')
    cur = data
    for part in parts:
        if isinstance(cur, dict):
            if part not in cur:
                return None, False
            cur = cur[part]
        elif isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError):
                return None, False
        else:
            return None, False
    return cur, True


def fetch_json_value(manager, integration, config, json_path=''):
    """Fetch the integration payload and extract a single value by dot-path."""
    payload = manager.fetch_payload(integration.type, config)
    value, found = _resolve_json_path(payload, json_path)
    if not found:
        raise ValueError(f'Path not found: {json_path!r}')
    if isinstance(value, (dict, list)):
        import json as _json
        display = _json.dumps(value, ensure_ascii=False)[:200]
    else:
        display = str(value) if value is not None else '—'
    return {'value': display, 'raw': value, 'path': json_path, 'payload_keys': list(payload.keys()) if isinstance(payload, dict) else []}


def fetch_pihole_stats(config):
    """Extended pi-hole statistics for the stats widget."""
    base = (config.get('server_url') or '').strip().rstrip('/')
    token = (config.get('api_token') or '').strip()
    if not base or not token:
        raise ValueError('Pi-hole URL and token required')
    res = requests.get(f'{base}/api.php?summaryRaw&topItems=5&auth={token}', timeout=8)
    res.raise_for_status()
    data = res.json()
    top_ads = data.get('top_ads') or {}
    top_queries = data.get('top_queries') or {}
    return {
        'dns_queries_today': data.get('dns_queries_today', 0),
        'ads_blocked_today': data.get('ads_blocked_today', 0),
        'ads_percentage_today': round(float(data.get('ads_percentage_today') or 0), 1),
        'domains_being_blocked': data.get('domains_being_blocked', 0),
        'status': data.get('status', 'unknown'),
        'top_ads': [{'domain': d, 'count': c} for d, c in list(top_ads.items())[:5]],
        'top_queries': [{'domain': d, 'count': c} for d, c in list(top_queries.items())[:5]],
    }


def fetch_adguard_stats(config):
    """Extended AdGuard Home statistics including top blocked domains."""
    base = (config.get('server_url') or '').strip().rstrip('/')
    username = (config.get('username') or '').strip()
    password = config.get('password') or ''
    if not base or not username:
        raise ValueError('AdGuard URL and username required')
    auth = (username, password)
    status = requests.get(f'{base}/control/status', auth=auth, timeout=10)
    status.raise_for_status()
    stats = requests.get(f'{base}/control/stats', auth=auth, timeout=10)
    stats.raise_for_status()
    status_data = status.json()
    stats_data = stats.json()
    top_blocked = [
        {'domain': d, 'count': c}
        for d, c in list((stats_data.get('top_blocked_domains') or {}).items())[:5]
    ]
    top_clients = [
        {'client': d, 'count': c}
        for d, c in list((stats_data.get('top_clients') or {}).items())[:5]
    ]
    queries = stats_data.get('num_dns_queries') or stats_data.get('dns_queries') or 0
    blocked = stats_data.get('blocked_filtering') or 0
    pct = round((blocked / queries) * 100, 1) if queries else 0
    return {
        'protection_enabled': status_data.get('protection_enabled', False),
        'dns_queries': queries,
        'blocked_filtering': blocked,
        'blocked_percentage': pct,
        'top_blocked_domains': top_blocked,
        'top_clients': top_clients,
    }


def fetch_immich_stats(config):
    base = (config.get('server_url') or '').strip().rstrip('/')
    api_key = (config.get('api_key') or '').strip()
    if not base or not api_key:
        raise ValueError('Immich URL and API key required')
    headers = {'x-api-key': api_key, 'Accept': 'application/json'}
    info = requests.get(f'{base}/api/server-info', headers=headers, timeout=10)
    info.raise_for_status()
    stats = requests.get(f'{base}/api/server/statistics', headers=headers, timeout=10)
    stats.raise_for_status()
    info_data = info.json()
    stats_data = stats.json()
    photos = stats_data.get('photos', 0)
    videos = stats_data.get('videos', 0)
    if photos is None and isinstance(stats_data.get('usageByUser'), list):
        photos = sum(u.get('photos', 0) for u in stats_data['usageByUser'])
    if videos is None and isinstance(stats_data.get('usageByUser'), list):
        videos = sum(u.get('videos', 0) for u in stats_data['usageByUser'])
    usage = stats_data.get('usage', 0)
    usage_gb = round(usage / (1024 ** 3), 2) if usage else 0
    return {
        'version': info_data.get('version', ''),
        'photos': photos or 0,
        'videos': videos or 0,
        'usage_gb': usage_gb,
    }


def format_bytes_per_sec(n):
    n = float(n or 0)
    if n >= 1024 ** 2:
        return f'{n / (1024 ** 2):.1f} MB/s'
    if n >= 1024:
        return f'{n / 1024:.1f} KB/s'
    return f'{int(n)} B/s'
