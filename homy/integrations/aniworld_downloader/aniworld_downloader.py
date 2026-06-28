"""MRX AniWorld Downloader — GET API integration (v1 + legacy catalog/status routes)."""
import logging
from urllib.parse import urlencode

import requests

logger = logging.getLogger(__name__)

# endpoint key -> definition
ANIWORLD_ENDPOINTS = {
    # --- External REST API v1 (X-Api-Key) ---
    'v1_status': {
        'label': 'v1 · Status',
        'path': '/api/v1/status',
        'auth': 'api_key',
        'metrics': [
            {'path': 'version', 'label': 'Version'},
            {'path': 'paused', 'label': 'Pausiert'},
            {'path': 'queue.total', 'label': 'Queue gesamt'},
            {'path': 'queue.queued', 'label': 'In Warteschlange'},
            {'path': 'queue.running', 'label': 'Laufend'},
            {'path': 'queue.completed', 'label': 'Abgeschlossen'},
            {'path': 'queue.failed', 'label': 'Fehlgeschlagen'},
            {'path': 'queue.cancelled', 'label': 'Abgebrochen'},
            {'path': 'currently_running.title', 'label': 'Aktueller Titel'},
            {'path': 'currently_running.current_episode', 'label': 'Aktuelle Episode'},
            {'path': 'currently_running.total_episodes', 'label': 'Episoden gesamt'},
            {'path': 'currently_running.overall_progress_percent', 'label': 'Fortschritt %'},
            {'path': 'currently_running.episode_progress.percent', 'label': 'Episode Fortschritt %'},
        ],
    },
    'v1_queue': {
        'label': 'v1 · Warteschlange',
        'path': '/api/v1/queue',
        'auth': 'api_key',
        'query_from': ['status_filter'],
        'metrics': [
            {'path': 'count', 'label': 'Anzahl Einträge'},
            {'path': 'items', 'label': 'Queue-Liste (Array)'},
        ],
    },
    'v1_queue_item': {
        'label': 'v1 · Queue-Eintrag',
        'path': '/api/v1/queue/{queue_id}',
        'auth': 'api_key',
        'requires': ['queue_id'],
        'metrics': [
            {'path': 'id', 'label': 'ID'},
            {'path': 'title', 'label': 'Titel'},
            {'path': 'status', 'label': 'Status'},
            {'path': 'current_episode', 'label': 'Aktuelle Episode'},
            {'path': 'total_episodes', 'label': 'Episoden gesamt'},
        ],
    },
    'v1_stats': {
        'label': 'v1 · Statistiken',
        'path': '/api/v1/stats',
        'auth': 'api_key',
        'metrics': [
            {'path': 'total_downloads', 'label': 'Downloads gesamt'},
            {'path': 'completed', 'label': 'Abgeschlossen'},
            {'path': 'failed', 'label': 'Fehlgeschlagen'},
            {'path': 'total_episodes', 'label': 'Episoden gesamt'},
            {'path': 'last_24h_completed', 'label': 'Letzte 24h'},
            {'path': 'average_speed_mbps', 'label': 'Ø Geschwindigkeit Mbit/s'},
            {'path': 'total_size_mb', 'label': 'Gesamtgröße MB'},
            {'path': 'anime_downloads', 'label': 'Anime-Downloads'},
            {'path': 'series_downloads', 'label': 'Serien-Downloads'},
            {'path': 'movie_downloads', 'label': 'Film-Downloads'},
        ],
    },
    'v1_library': {
        'label': 'v1 · Bibliothek (alle)',
        'path': '/api/v1/library',
        'auth': 'api_key',
        'metrics': [{'path': 'count', 'label': 'Speicherorte'}, {'path': 'locations', 'label': 'Standorte (Array)'}],
    },
    'v1_library_series': {
        'label': 'v1 · Bibliothek Serien',
        'path': '/api/v1/library/series',
        'auth': 'api_key',
        'metrics': [{'path': 'count', 'label': 'Speicherorte'}, {'path': 'locations', 'label': 'Standorte (Array)'}],
    },
    'v1_library_movies': {
        'label': 'v1 · Bibliothek Filme',
        'path': '/api/v1/library/movies',
        'auth': 'api_key',
        'metrics': [{'path': 'count', 'label': 'Speicherorte'}, {'path': 'locations', 'label': 'Standorte (Array)'}],
    },
    # --- Legacy WebUI GET (Session optional — funktioniert ohne Login wenn Auth aus) ---
    'legacy_queue': {
        'label': 'WebUI · Warteschlange',
        'path': '/api/queue',
        'auth': 'optional',
        'metrics': [
            {'path': 'paused', 'label': 'Pausiert'},
            {'path': 'items', 'label': 'Queue-Items'},
            {'path': 'ffmpeg_progress.percent', 'label': 'FFmpeg Fortschritt %'},
        ],
    },
    'legacy_stats': {
        'label': 'WebUI · Statistiken (gesamt)',
        'path': '/api/stats',
        'auth': 'optional',
        'metrics': [
            {'path': 'general.total_downloads', 'label': 'Downloads gesamt'},
            {'path': 'queue.total', 'label': 'Queue gesamt'},
            {'path': 'sync.total_jobs', 'label': 'AutoSync Jobs'},
        ],
    },
    'legacy_stats_general': {
        'label': 'WebUI · Statistiken allgemein',
        'path': '/api/stats/general',
        'auth': 'optional',
        'metrics': [
            {'path': 'total_downloads', 'label': 'Downloads gesamt'},
            {'path': 'completed', 'label': 'Abgeschlossen'},
            {'path': 'average_speed_mbps', 'label': 'Ø Mbit/s'},
        ],
    },
    'legacy_stats_queue': {
        'label': 'WebUI · Statistiken Queue',
        'path': '/api/stats/queue',
        'auth': 'optional',
        'metrics': [
            {'path': 'total', 'label': 'Queue gesamt'},
            {'path': 'currently_running.title', 'label': 'Läuft gerade'},
        ],
    },
    'legacy_stats_sync': {
        'label': 'WebUI · Statistiken AutoSync',
        'path': '/api/stats/sync',
        'auth': 'optional',
        'metrics': [
            {'path': 'total_jobs', 'label': 'Jobs gesamt'},
            {'path': 'enabled', 'label': 'Aktiv'},
        ],
    },
    'legacy_autosync': {
        'label': 'WebUI · AutoSync Jobs',
        'path': '/api/autosync',
        'auth': 'optional',
        'metrics': [{'path': 'jobs', 'label': 'Jobs (Array)'}],
    },
    'legacy_autosync_running': {
        'label': 'WebUI · AutoSync läuft',
        'path': '/api/autosync/running',
        'auth': 'optional',
        'metrics': [{'path': 'running', 'label': 'Laufende Job-IDs'}],
    },
    'legacy_favourites': {
        'label': 'WebUI · Favoriten',
        'path': '/api/favourites',
        'auth': 'optional',
        'metrics': [{'path': 'favourites', 'label': 'Favoriten (Array)'}],
    },
    'legacy_library': {
        'label': 'WebUI · Bibliothek',
        'path': '/api/library',
        'auth': 'optional',
        'metrics': [
            {'path': 'is_scanning', 'label': 'Scan läuft'},
            {'path': 'locations', 'label': 'Standorte (Array)'},
        ],
    },
    'legacy_library_status': {
        'label': 'WebUI · Bibliothek Status',
        'path': '/api/library/status',
        'auth': 'optional',
        'metrics': [
            {'path': 'is_scanning', 'label': 'Scan läuft'},
            {'path': 'last_updated', 'label': 'Zuletzt aktualisiert'},
        ],
    },
    'legacy_new_animes': {
        'label': 'Katalog · Neue Animes',
        'path': '/api/new-animes',
        'auth': 'optional',
        'metrics': [{'path': 'results', 'label': 'Ergebnisse (Array)'}],
    },
    'legacy_popular_animes': {
        'label': 'Katalog · Beliebte Animes',
        'path': '/api/popular-animes',
        'auth': 'optional',
        'metrics': [{'path': 'results', 'label': 'Ergebnisse (Array)'}],
    },
    'legacy_new_series': {
        'label': 'Katalog · Neue Serien (s.to)',
        'path': '/api/new-series',
        'auth': 'optional',
        'metrics': [{'path': 'results', 'label': 'Ergebnisse (Array)'}],
    },
    'legacy_popular_series': {
        'label': 'Katalog · Beliebte Serien (s.to)',
        'path': '/api/popular-series',
        'auth': 'optional',
        'metrics': [{'path': 'results', 'label': 'Ergebnisse (Array)'}],
    },
    'legacy_new_movies': {
        'label': 'Katalog · Neue Filme (FilmPalast)',
        'path': '/api/new-movies',
        'auth': 'optional',
        'metrics': [{'path': 'results', 'label': 'Ergebnisse (Array)'}],
    },
    'legacy_downloaded_folders': {
        'label': 'WebUI · Heruntergeladene Ordner',
        'path': '/api/downloaded-folders',
        'auth': 'optional',
        'metrics': [{'path': 'folders', 'label': 'Ordner (Array)'}],
    },
    'legacy_seerr_requests': {
        'label': 'WebUI · Seerr Anfragen',
        'path': '/api/seerr/requests',
        'auth': 'optional',
        'query_from': ['seerr_take', 'seerr_skip'],
        'metrics': [
            {'path': 'total', 'label': 'Anfragen gesamt'},
            {'path': 'requests', 'label': 'Anfragen (Array)'},
        ],
    },
    'legacy_update_check': {
        'label': 'WebUI · Update-Check',
        'path': '/api/update-check',
        'auth': 'optional',
        'metrics': [
            {'path': 'local_version', 'label': 'Lokale Version'},
            {'path': 'latest_version', 'label': 'Neueste Version'},
            {'path': 'update_available', 'label': 'Update verfügbar'},
        ],
    },
    'legacy_upscale_queue': {
        'label': 'WebUI · Upscale Queue',
        'path': '/api/upscale/queue',
        'auth': 'optional',
        'metrics': [
            {'path': 'badge', 'label': 'Badge Count'},
            {'path': 'items', 'label': 'Items (Array)'},
        ],
    },
    'legacy_upscale_progress': {
        'label': 'WebUI · Upscale Fortschritt',
        'path': '/api/upscale/progress',
        'auth': 'optional',
        'metrics': [{'path': 'progress.percent', 'label': 'Fortschritt %'}],
    },
    'legacy_upscale_badge': {
        'label': 'WebUI · Upscale Badge',
        'path': '/api/upscale/badge',
        'auth': 'optional',
        'metrics': [{'path': 'count', 'label': 'Anzahl'}],
    },
    'legacy_mediascan_library': {
        'label': 'WebUI · MediaScan Bibliothek',
        'path': '/api/mediascan/library',
        'auth': 'optional',
        'metrics': [
            {'path': 'enabled', 'label': 'Aktiv'},
            {'path': 'source', 'label': 'Quelle'},
            {'path': 'titles', 'label': 'Titel (Array)'},
        ],
    },
    # --- Catalog (query param resource_url) ---
    'catalog_series': {
        'label': 'Katalog · Serie (Metadaten)',
        'path': '/api/series',
        'auth': 'optional',
        'query_from': ['resource_url'],
        'requires': ['resource_url'],
        'metrics': [
            {'path': 'title', 'label': 'Titel'},
            {'path': 'release_year', 'label': 'Jahr'},
            {'path': 'genres', 'label': 'Genres'},
        ],
    },
    'catalog_seasons': {
        'label': 'Katalog · Staffeln',
        'path': '/api/seasons',
        'auth': 'optional',
        'query_from': ['resource_url'],
        'requires': ['resource_url'],
        'metrics': [{'path': 'seasons', 'label': 'Staffeln (Array)'}],
    },
    'catalog_episodes': {
        'label': 'Katalog · Episoden',
        'path': '/api/episodes',
        'auth': 'optional',
        'query_from': ['resource_url'],
        'requires': ['resource_url'],
        'metrics': [{'path': 'episodes', 'label': 'Episoden (Array)'}],
    },
    'catalog_providers': {
        'label': 'Katalog · Provider',
        'path': '/api/providers',
        'auth': 'optional',
        'query_from': ['resource_url'],
        'requires': ['resource_url'],
        'metrics': [{'path': 'providers', 'label': 'Provider'}],
    },
    'catalog_random': {
        'label': 'Katalog · Zufällige Serie',
        'path': '/api/random',
        'auth': 'optional',
        'query_from': ['site'],
        'metrics': [{'path': 'url', 'label': 'URL'}],
    },
    'catalog_tmdb_genres': {
        'label': 'TMDB · Genres',
        'path': '/api/tmdb/genres',
        'auth': 'optional',
        'metrics': [{'path': 'tv', 'label': 'TV Genres'}, {'path': 'movie', 'label': 'Film Genres'}],
    },
    'catalog_tmdb_info': {
        'label': 'TMDB · Info',
        'path': '/api/tmdb/info',
        'auth': 'optional',
        'query_from': ['tmdb_title', 'tmdb_imdb_id'],
        'metrics': [
            {'path': 'found', 'label': 'Gefunden'},
            {'path': 'tmdb_id', 'label': 'TMDB ID'},
            {'path': 'vote_average', 'label': 'Bewertung'},
        ],
    },
}


def get_integration_type():
    """Build integration type metadata for aniworld_downloader."""
    default_key = 'v1_status'

    all_metrics = [{'path': '_raw', 'label': 'Komplette Antwort (JSON)'}]
    seen_paths = {'_raw'}
    for ep in ANIWORLD_ENDPOINTS.values():
        for m in ep.get('metrics', []):
            if m['path'] not in seen_paths:
                seen_paths.add(m['path'])
                all_metrics.append(m)

    return {
        'name': 'MRX AniWorld Downloader',
        'icon': 'download-cloud',
        'fields': {
            'server_url': {
                'type': 'text',
                'label': 'Downloader URL',
                'default': 'http://localhost:8080',
            },
            'api_key': {
                'type': 'password',
                'label': 'API Key (X-Api-Key, für v1-Endpunkte)',
                'default': '',
            },
        },
        'metrics': all_metrics,
        'widget_endpoints': [
            {
                'key': key,
                'label': ep.get('label') or key,
                'path': ep.get('path') or '',
                'auth': ep.get('auth') or 'optional',
                'requires': ep.get('requires', []),
                'query_from': ep.get('query_from', []),
            }
            for key, ep in ANIWORLD_ENDPOINTS.items()
        ],
        'default_widget_endpoint': default_key,
    }


def _resolve_endpoint_key(config):
    """Map stored endpoint label or key to internal endpoint key."""
    raw = (config.get('endpoint') or 'v1_status').strip()
    if raw in ANIWORLD_ENDPOINTS:
        return raw
    for key, ep in ANIWORLD_ENDPOINTS.items():
        if ep['label'] == raw:
            return key
    return 'v1_status'


def _build_query(endpoint_key, config, ep_def):
    params = {}
    for field in ep_def.get('query_from', []):
        val = (config.get(field) or '').strip()
        if not val:
            continue
        if field == 'status_filter':
            params['status'] = val
        elif field == 'resource_url':
            params['url'] = val
        elif field == 'site':
            params['site'] = val
        elif field == 'seerr_take':
            params['take'] = min(int(val or 20), 50)
        elif field == 'seerr_skip':
            params['skip'] = max(int(val or 0), 0)
        elif field == 'tmdb_title':
            params['title'] = val
        elif field == 'tmdb_imdb_id':
            params['imdb_id'] = val
    return params


def _normalize_payload(endpoint_key, data):
    """Add helper fields for widgets."""
    if isinstance(data, list):
        if endpoint_key.startswith('v1_library'):
            return {'locations': data, 'count': len(data), '_endpoint': endpoint_key}
        return {'items': data, 'count': len(data), '_endpoint': endpoint_key}
    if isinstance(data, dict):
        out = dict(data)
        out['_endpoint'] = endpoint_key
        if endpoint_key == 'v1_status' and data.get('queue'):
            q = data['queue']
            out['queue_running'] = q.get('running', 0)
            out['queue_queued'] = q.get('queued', 0)
        return out
    return {'value': data, '_endpoint': endpoint_key}


def fetch_payload(config):
    server_url = (config.get('server_url') or '').strip().rstrip('/')
    if not server_url:
        raise ValueError('Downloader URL fehlt')

    endpoint_key = _resolve_endpoint_key(config)
    ep_def = ANIWORLD_ENDPOINTS.get(endpoint_key)
    if not ep_def:
        raise ValueError(f'Unbekannter Endpunkt: {endpoint_key}')

    for req in ep_def.get('requires', []):
        if not (config.get(req) or '').strip():
            label = req
            if req == 'resource_url':
                label = 'Serien/Episoden-URL'
            elif req == 'queue_id':
                label = 'Queue-ID'
            raise ValueError(f'Pflichtfeld fehlt: {label}')

    api_key = (config.get('api_key') or '').strip()
    if ep_def.get('auth') == 'api_key' and not api_key:
        raise ValueError('API Key erforderlich für v1-Endpunkte (Einstellungen im Downloader → API Key)')

    path = ep_def['path']
    if '{queue_id}' in path:
        qid = (config.get('queue_id') or '').strip()
        path = path.replace('{queue_id}', qid)

    query = _build_query(endpoint_key, config, ep_def)
    url = f"{server_url}{path}"
    if query:
        url = f"{url}?{urlencode(query)}"

    headers = {'Accept': 'application/json'}
    if api_key:
        headers['X-Api-Key'] = api_key

    logger.debug('AniWorld integration fetch: %s', url)
    res = requests.get(url, headers=headers, timeout=12)
    if res.status_code == 401:
        raise ValueError('Unauthorized — API Key ungültig oder fehlt')
    if res.status_code == 404:
        raise ValueError('Nicht gefunden (404)')
    res.raise_for_status()

    try:
        data = res.json()
    except Exception as exc:
        raise ValueError(f'Antwort ist kein JSON: {exc}') from exc

    return _normalize_payload(endpoint_key, data)
