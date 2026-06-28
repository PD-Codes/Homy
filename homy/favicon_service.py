"""Favicon fetch + disk cache for favorites."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
from urllib.parse import urljoin, urlparse

import requests

from homy.debug_config import debug_log, is_debug

logger = logging.getLogger(__name__)

_CACHE_SUBDIR = 'favicon_cache'
_USER_AGENT = 'Homy/1.0 (+https://github.com/dommekologe)'
_MIN_BYTES = 32
_CACHE_TTL_SECONDS = 7 * 24 * 3600  # 7 days
_HTML_CT = re.compile(r'text/html', re.I)
_LINK_ICON_RE = re.compile(
    r'<link[^>]+(?:rel=["\'](?:shortcut\s+icon|icon|apple-touch-icon(?:-precomposed)?)["\'][^>]*href=["\']([^"\']+)["\']'
    r'|href=["\']([^"\']+)["\'][^>]*rel=["\'](?:shortcut\s+icon|icon|apple-touch-icon(?:-precomposed)?)["\'])',
    re.I,
)


def _data_dir():
    default = os.path.join(os.path.expanduser('~'), '.homy')
    return os.environ.get('DATA_DIR', default)


def cache_dir():
    path = os.path.join(_data_dir(), _CACHE_SUBDIR)
    os.makedirs(path, exist_ok=True)
    return path


def _cache_key(page_url: str, domain: str) -> str:
    raw = f'{domain}|{page_url.strip().lower()}'
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:20]


def _cache_paths(key: str):
    base = os.path.join(cache_dir(), key)
    return base + '.bin', base + '.json'


def _parse_page_url(page_url: str):
    raw = (page_url or '').strip()
    if not raw:
        return None
    if '://' not in raw:
        raw = f'https://{raw}'
    parsed = urlparse(raw)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        return None
    return parsed


def _read_cache(key: str):
    bin_path, meta_path = _cache_paths(key)
    if not os.path.isfile(bin_path) or not os.path.isfile(meta_path):
        return None
    try:
        with open(meta_path, encoding='utf-8') as f:
            meta = json.load(f)
        fetched_at = int(meta.get('fetched_at', 0))
        if (time.time() - fetched_at) > _CACHE_TTL_SECONDS:
            debug_log(logger, 'cache STALE key=%s age=%ds', key, int(time.time() - fetched_at))
            return None
        with open(bin_path, 'rb') as f:
            data = f.read()
        if len(data) < _MIN_BYTES:
            return None
        meta['data'] = data
        meta['from_cache'] = True
        return meta
    except Exception as exc:
        debug_log(logger, 'cache read error key=%s: %s', key, exc)
        return None


def _write_cache(key: str, data: bytes, content_type: str, source: str, domain: str, page_url: str):
    bin_path, meta_path = _cache_paths(key)
    try:
        with open(bin_path, 'wb') as f:
            f.write(data)
        meta = {
            'content_type': content_type,
            'source': source,
            'domain': domain,
            'page_url': page_url,
            'size': len(data),
            'fetched_at': int(time.time()),
        }
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta, f)
        debug_log(
            logger,
            'cached domain=%s key=%s size=%d source=%s path=%s',
            domain,
            key,
            len(data),
            source,
            bin_path,
        )
    except Exception as exc:
        logger.warning('Failed to write favicon cache %s: %s', key, exc)


def _request_url(url: str, timeout=6, accept_html=False):
    verify = os.environ.get('HOMY_FAVICON_INSECURE', '')
    verify = verify.lower() not in ('1', 'true', 'yes')
    accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' if accept_html else 'image/*,*/*;q=0.8'
    headers = {'User-Agent': _USER_AGENT, 'Accept': accept}
    debug_log(logger, 'GET %s verify_ssl=%s', url, verify)
    resp = requests.get(url, timeout=timeout, headers=headers, verify=verify, allow_redirects=True)
    debug_log(
        logger,
        '  -> %s len=%s ctype=%s final=%s',
        resp.status_code,
        len(resp.content or []),
        resp.headers.get('Content-Type', ''),
        resp.url,
    )
    return resp


def _has_image_magic(content: bytes) -> bool:
    if not content or len(content) < _MIN_BYTES:
        return False
    head = content[:12]
    if head.startswith(b'\x89PNG') or head.startswith(b'GIF8') or head[:2] == b'\xff\xd8':
        return True
    if head[:4] == b'\x00\x00\x01\x00' or head[:2] in (b'\x00\x00', b'\x01\x00'):
        return True
    return False


def _is_valid_image(resp) -> bool:
    if not resp.content or len(resp.content) < _MIN_BYTES:
        return False
    ctype = (resp.headers.get('Content-Type') or '').lower()
    if _HTML_CT.search(ctype) and not _has_image_magic(resp.content):
        return False
    if _has_image_magic(resp.content):
        return True
    if resp.ok and ('image' in ctype or 'icon' in ctype or 'octet-stream' in ctype):
        return True
    return False


def _guess_mime(resp) -> str:
    ctype = resp.headers.get('Content-Type', '')
    if ctype and 'image' in ctype.lower() and 'html' not in ctype.lower():
        return ctype.split(';')[0].strip()
    if resp.content.startswith(b'\x89PNG'):
        return 'image/png'
    if resp.content.startswith(b'GIF8'):
        return 'image/gif'
    if resp.content[:2] == b'\xff\xd8':
        return 'image/jpeg'
    return 'image/x-icon'


def _extract_icon_hrefs(base_url: str, html: str):
    found = []
    if not html:
        return found
    for match in _LINK_ICON_RE.finditer(html):
        href = match.group(1) or match.group(2)
        if not href or href.startswith('data:'):
            continue
        full = urljoin(base_url, href.strip())
        if full not in found:
            found.append(full)
    return found


def _origin_icon_paths(origin: str):
    for path in (
        '/favicon.ico',
        '/favicon.png',
        '/favicon.svg',
        '/apple-touch-icon.png',
        '/static/favicon.ico',
        '/assets/favicon.ico',
    ):
        yield path


def _build_candidates(parsed, page_url: str):
    """Yield (source, url) — HTML/local first for homelab/intranet hosts."""
    domain = parsed.netloc
    seen = set()

    def emit(source, url):
        if url in seen:
            return
        seen.add(url)
        yield source, url

    # 1) Fetch page once — discover <link rel="icon"> (works on login pages too)
    try:
        resp = _request_url(page_url, timeout=8, accept_html=True)
        final = resp.url or page_url
        final_parsed = urlparse(final)
        origin = f'{final_parsed.scheme}://{final_parsed.netloc}'

        for href in _extract_icon_hrefs(final, resp.text if resp.text else ''):
            debug_log(logger, 'HTML icon candidate: %s', href)
            yield from emit('html_icon', href)

        for path in _origin_icon_paths(origin):
            yield from emit(f'origin{path}', origin + path)
    except Exception as exc:
        debug_log(logger, 'HTML discovery failed: %s', exc)
        origin = f'{parsed.scheme}://{domain}'
        for path in _origin_icon_paths(origin):
            yield from emit(f'origin{path}', origin + path)

    # 2) Public icon CDNs (often fail for .local / internal DNS)
    yield from emit('google_s2', f'https://www.google.com/s2/favicons?domain={domain}&sz=64')
    yield from emit('duckduckgo', f'https://icons.duckduckgo.com/ip3/{domain}.ico')


def fetch_favicon(page_url: str):
    """
    Returns dict: ok, data, content_type, source, domain, cache_key, from_cache, error
    """
    parsed = _parse_page_url(page_url)
    if not parsed:
        return {'ok': False, 'error': 'invalid_url', 'domain': '', 'page_url': page_url}

    domain = parsed.netloc
    key = _cache_key(page_url, domain)

    debug_log(logger, 'favicon request page_url=%s domain=%s cache_key=%s', page_url, domain, key)

    cached = _read_cache(key)
    if cached:
        age = int(time.time()) - int(cached.get('fetched_at', 0))
        debug_log(
            logger,
            'cache HIT domain=%s age=%ss size=%d source=%s',
            domain,
            age,
            cached.get('size', 0),
            cached.get('source'),
        )
        return {
            'ok': True,
            'data': cached['data'],
            'content_type': cached.get('content_type', 'image/png'),
            'source': cached.get('source', 'cache'),
            'domain': domain,
            'cache_key': key,
            'from_cache': True,
            'page_url': page_url,
        }

    debug_log(logger, 'cache MISS domain=%s — fetching candidates', domain)

    last_error = None
    for source, candidate_url in _build_candidates(parsed, page_url):
        try:
            if candidate_url.lower().endswith('.svg'):
                debug_log(logger, 'skip SVG candidate %s', candidate_url)
                continue
            resp = _request_url(candidate_url, timeout=5)
            if _is_valid_image(resp):
                data = resp.content
                ctype = _guess_mime(resp)
                _write_cache(key, data, ctype, source, domain, page_url)
                logger.info(
                    'Favicon OK domain=%s source=%s bytes=%d status=%s',
                    domain,
                    source,
                    len(data),
                    resp.status_code,
                )
                return {
                    'ok': True,
                    'data': data,
                    'content_type': ctype,
                    'source': source,
                    'domain': domain,
                    'cache_key': key,
                    'from_cache': False,
                    'page_url': page_url,
                }
            last_error = f'{source}: HTTP {resp.status_code}, not a valid image'
            debug_log(logger, 'candidate rejected: %s', last_error)
        except Exception as exc:
            last_error = f'{source}: {exc}'
            debug_log(logger, 'candidate failed: %s', last_error)

    logger.warning('Favicon failed for %s (%s)', domain, last_error)
    return {
        'ok': False,
        'error': last_error or 'all_candidates_failed',
        'domain': domain,
        'cache_key': key,
        'from_cache': False,
        'page_url': page_url,
    }


def debug_info(page_url: str):
    """Summary for /api/favicon/debug (no image bytes)."""
    parsed = _parse_page_url(page_url)
    if not parsed:
        return {'error': 'invalid_url', 'url': page_url}
    key = _cache_key(page_url, parsed.netloc)
    cached = _read_cache(key)
    fresh = fetch_favicon(page_url)
    return {
        'url': page_url,
        'domain': parsed.netloc,
        'cache_key': key,
        'cache_dir': cache_dir(),
        'cached_meta': {k: v for k, v in (cached or {}).items() if k != 'data'} if cached else None,
        'fetch_result': {k: v for k, v in fresh.items() if k != 'data'},
    }
