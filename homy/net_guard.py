"""SSRF guard: validate outbound URLs before fetching them.

Resolves the target hostname and rejects addresses that point at
loopback, RFC1918/private, link-local (incl. the cloud metadata
endpoint 169.254.169.254), multicast or reserved ranges.

Because Homy is a homelab dashboard that legitimately talks to
private addresses, loopback/private targets can be permitted via the
HOMY_ALLOW_PRIVATE_URLS environment variable (default: enabled).
Link-local/metadata, multicast and reserved addresses are always
rejected.
"""

from __future__ import annotations

import ipaddress
import logging
import os
import socket
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)

_MAX_REDIRECTS = 5


class BlockedUrlError(ValueError):
    """Raised when a URL resolves to a forbidden address."""


def allow_private_urls() -> bool:
    raw = (os.environ.get('HOMY_ALLOW_PRIVATE_URLS', '1') or '').strip().lower()
    return raw in ('1', 'true', 'yes')


def resolve_host_ips(hostname: str):
    """Resolve a hostname to all its IP addresses."""
    try:
        infos = socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise BlockedUrlError(f'Cannot resolve host {hostname!r}: {exc}') from exc
    ips = []
    for info in infos:
        try:
            ips.append(ipaddress.ip_address(info[4][0]))
        except ValueError:
            continue
    if not ips:
        raise BlockedUrlError(f'No usable addresses for host {hostname!r}')
    return ips


def ensure_url_allowed(url: str, allow_private=None):
    """Validate scheme and resolved IPs of a URL; raise BlockedUrlError otherwise."""
    if allow_private is None:
        allow_private = allow_private_urls()
    parsed = urlparse(url or '')
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        raise BlockedUrlError(f'Unsupported or invalid URL: {url!r}')
    for ip in resolve_host_ips(parsed.hostname):
        # Always reject: link-local (incl. 169.254.169.254 metadata),
        # multicast, unspecified and reserved addresses.
        if ip.is_link_local or ip.is_multicast or ip.is_unspecified or ip.is_reserved:
            raise BlockedUrlError(f'Blocked address {ip} for host {parsed.hostname!r}')
        if not allow_private and (ip.is_loopback or ip.is_private):
            raise BlockedUrlError(f'Private address {ip} not allowed for host {parsed.hostname!r}')
    return parsed


def guarded_get(url: str, allow_private=None, **kwargs):
    """requests.get with SSRF validation on the initial URL and every redirect hop."""
    import requests

    kwargs.pop('allow_redirects', None)
    current = url
    for _ in range(_MAX_REDIRECTS + 1):
        ensure_url_allowed(current, allow_private=allow_private)
        resp = requests.get(current, allow_redirects=False, **kwargs)
        if resp.is_redirect or resp.is_permanent_redirect:
            location = resp.headers.get('Location')
            if not location:
                return resp
            current = urljoin(current, location)
            continue
        return resp
    raise BlockedUrlError(f'Too many redirects for {url!r}')
