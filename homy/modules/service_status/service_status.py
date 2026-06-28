import logging
import platform
import re
import socket
import subprocess
import time
from urllib.parse import urlparse

import requests
from flask import request, jsonify
from homy.database import WidgetInstance
from homy.cache import widget_cache, cache_key as make_cache_key, should_bypass_cache

logger = logging.getLogger(__name__)

WIDGETS = [
    {
        "type": "service_status",
        "name": "Service Status",
        "default_size_x": 6,
        "default_size_y": 5,
        "config_schema": {
            "services": {
                "type": "textarea",
                "label": "Dienste (pro Zeile: Name|URL)",
                "default": "Router|https://192.168.1.1\nNAS|http://192.168.1.10"
            },
            "timeout_sec": {
                "type": "select",
                "label": "Timeout (Sekunden)",
                "options": ["2", "5", "10"],
                "default": "5"
            },
            "request_method": {
                "type": "select",
                "label": "HTTP-Methode",
                "options": ["HEAD", "GET"],
                "default": "HEAD"
            },
            "verify_ssl": {
                "type": "select",
                "label": "SSL-Zertifikat prüfen",
                "options": ["Ja", "Nein"],
                "default": "Nein"
            }
        }
    }
]

CACHE_NS = 'service_status'
CACHE_TTL = 45


def _host_from_url(url):
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        if host:
            return host
    except Exception:
        pass
    return None


def _port_from_url(url, default=80):
    try:
        parsed = urlparse(url)
        if parsed.port:
            return parsed.port
        if parsed.scheme == 'https':
            return 443
    except Exception:
        pass
    return default


def _tcp_connect_ms(host, port, timeout_sec):
    if not host:
        return None
    t0 = time.time()
    try:
        with socket.create_connection((host, int(port)), timeout=timeout_sec):
            return max(0, int((time.time() - t0) * 1000))
    except OSError:
        return None


def _icmp_ping_ms(host, timeout_sec=2):
    """ICMP ping when available; returns round-trip ms or None."""
    if not host:
        return None
    timeout_ms = max(500, int(timeout_sec * 1000))
    system = platform.system().lower()
    try:
        if system == 'windows':
            cmd = ['ping', '-n', '1', '-w', str(timeout_ms), host]
        else:
            wait_sec = max(1, int(timeout_sec))
            cmd = ['ping', '-c', '1', '-W', str(wait_sec), host]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            timeout=timeout_sec + 1,
            check=False,
        )
        output = (proc.stdout or b'').decode('utf-8', errors='ignore')
        output += (proc.stderr or b'').decode('utf-8', errors='ignore')
        if proc.returncode != 0:
            return None
        for pattern in (
            r'[Mm]ittelwert\s*=\s*(\d+)\s*ms',
            r'[Aa]verage\s*=\s*(\d+)\s*ms',
            r'[Zz]eit[=<]\s*(\d+)\s*ms',
            r'time[=<]\s*(\d+)\s*ms',
            r'(\d+)\s*ms',
        ):
            match = re.search(pattern, output)
            if match:
                return int(match.group(1))
        if re.search(r'[Zz]eit\s*<\s*1\s*ms|time\s*<\s*1\s*ms', output, re.I):
            return 0
    except (subprocess.TimeoutExpired, OSError, ValueError):
        return None
    return None


def _measure_latency(svc, timeout_sec):
    host = _host_from_url(svc['url'])
    if not host:
        return None
    ping_ms = _icmp_ping_ms(host, timeout_sec)
    if ping_ms is not None:
        return ping_ms
    return _tcp_connect_ms(host, _port_from_url(svc['url']), timeout_sec)


def _parse_services(text):
    services = []
    if not text:
        return services
    for line in str(text).strip().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '|' in line:
            name, url = line.split('|', 1)
        else:
            name, url = line, line
        name = name.strip()
        url = url.strip()
        if url and not url.startswith(('http://', 'https://')):
            url = 'http://' + url
        if name and url:
            services.append({'name': name, 'url': url})
    return services


def register(app):
    @app.route('/api/service_status/check', methods=['GET'])
    def check_services():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({'error': 'Bad Request', 'message': 'widget_id is required'}), 400

        widget = WidgetInstance.query.get(widget_id)
        if not widget:
            return jsonify({'error': 'Not Found', 'message': 'Widget not found'}), 404

        config = widget.config
        services = _parse_services(config.get('services', ''))
        timeout = int(config.get('timeout_sec', 5) or 5)
        method = (config.get('request_method') or 'HEAD').upper()
        verify = config.get('verify_ssl', 'Nein') == 'Ja'

        if not services:
            return jsonify({
                'configured': False,
                'message': 'Bitte mindestens einen Dienst eintragen (Format: Name|URL pro Zeile).',
            })

        ck = make_cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        results = []
        for svc in services[:15]:
            online = False
            latency_ms = None
            status_code = None
            error = None
            latency_ms = _measure_latency(svc, timeout)
            try:
                fn = requests.head if method == 'HEAD' else requests.get
                res = fn(svc['url'], timeout=timeout, verify=verify, allow_redirects=True)
                status_code = res.status_code
                online = res.status_code < 500
                if latency_ms is None:
                    latency_ms = 0
            except requests.exceptions.SSLError:
                error = 'SSL-Fehler'
            except requests.exceptions.Timeout:
                error = 'Timeout'
            except Exception as ex:
                error = str(ex)[:80]

            results.append({
                'name': svc['name'],
                'url': svc['url'],
                'online': online,
                'latency_ms': latency_ms,
                'status_code': status_code,
                'error': error,
            })

        up = sum(1 for r in results if r['online'])
        result = {
            'configured': True,
            'online': True,
            'summary': {'up': up, 'total': len(results)},
            'services': results,
        }
        widget_cache.set(ck, result, ttl=CACHE_TTL)
        return jsonify(result)
