import os
import shutil
import time
import subprocess
import logging
from flask import jsonify
from homy.cache import widget_cache, cache_key as make_cache_key, should_bypass_cache

logger = logging.getLogger(__name__)

WIDGETS = [
    {
        "type": "system_info",
        "name": "System Info",
        "default_size_x": 6,
        "default_size_y": 5,
        "config_schema": {
            "show_cpu": {
                "type": "select",
                "label": "CPU anzeigen / Show CPU",
                "options": ["Ja", "Nein"],
                "default": "Ja"
            },
            "show_ram": {
                "type": "select",
                "label": "RAM anzeigen / Show RAM",
                "options": ["Ja", "Nein"],
                "default": "Ja"
            },
            "show_disk": {
                "type": "select",
                "label": "Festplatte anzeigen / Show Disk",
                "options": ["Ja", "Nein"],
                "default": "Ja"
            },
            "show_uptime": {
                "type": "select",
                "label": "Uptime anzeigen / Show Uptime",
                "options": ["Ja", "Nein"],
                "default": "Ja"
            },
            "show_network": {
                "type": "select",
                "label": "Netzwerk anzeigen / Show Network",
                "options": ["Ja", "Nein"],
                "default": "Nein"
            }
        }
    }
]

CACHE_NS = 'system_info'
CACHE_TTL = 8  # refresh every 8 seconds

def get_cpu_usage():
    cpu_percent = 0.0
    try:
        if os.path.exists('/proc/stat'):
            with open('/proc/stat', 'r') as f:
                line = f.readline()
            parts = line.split()
            if len(parts) >= 5:
                user, nice, system, idle = map(int, parts[1:5])
                total = user + nice + system + idle
                last_stat = widget_cache.get('sys_cpu_last_stat')
                t_now = time.time()
                widget_cache.set('sys_cpu_last_stat', (total, idle, t_now), ttl=60)
                if last_stat:
                    prev_total, prev_idle, prev_t = last_stat
                    total_diff = total - prev_total
                    idle_diff = idle - prev_idle
                    if total_diff > 0:
                        cpu_percent = max(0.0, min(100.0, (1.0 - idle_diff / total_diff) * 100))
                        return round(cpu_percent, 1)
                
            if hasattr(os, 'getloadavg'):
                return round(os.getloadavg()[0] * 10, 1)
        elif os.name == 'nt':
            try:
                # Use powershell command as WMIC might be deprecated on newer Windows builds,
                # or try WMIC first and fall back to powershell
                out = subprocess.check_output('wmic cpu get LoadPercentage /value', shell=True, timeout=1, text=True)
                for line in out.splitlines():
                    if 'LoadPercentage=' in line:
                        return float(line.split('=')[1].strip())
            except Exception:
                try:
                    # Fallback to powershell CPU counter
                    out = subprocess.check_output('powershell -Command "(Get-CimInstance Win32_Processor).LoadPercentage"', shell=True, timeout=1, text=True)
                    val = out.strip()
                    if val:
                        return float(val)
                except Exception:
                    pass
    except Exception as e:
        logger.debug("Failed to fetch CPU: %s", e)
    return 12.5

def get_ram_usage():
    total_gb = 0.0
    used_gb = 0.0
    percent = 0.0
    try:
        if os.path.exists('/proc/meminfo'):
            meminfo = {}
            with open('/proc/meminfo', 'r') as f:
                for line in f:
                    parts = line.split(':')
                    if len(parts) == 2:
                        meminfo[parts[0].strip()] = int(parts[1].split()[0])
            total = meminfo.get('MemTotal', 0)
            free = meminfo.get('MemFree', 0)
            buffers = meminfo.get('Buffers', 0)
            cached = meminfo.get('Cached', 0)
            available = meminfo.get('MemAvailable', free + buffers + cached)
            used = total - available
            total_gb = round(total / (1024 * 1024), 1)
            used_gb = round(used / (1024 * 1024), 1)
            if total > 0:
                percent = round((used / total) * 100, 1)
        elif os.name == 'nt':
            try:
                out = subprocess.check_output('wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /Value', shell=True, timeout=1, text=True)
                mem = {}
                for line in out.splitlines():
                    if '=' in line:
                        k, v = line.split('=', 1)
                        mem[k.strip()] = int(v.strip())
                total_kb = mem.get('TotalVisibleMemorySize', 0)
                free_kb = mem.get('FreePhysicalMemory', 0)
                used_kb = total_kb - free_kb
                total_gb = round(total_kb / (1024 * 1024), 1)
                used_gb = round(used_kb / (1024 * 1024), 1)
                if total_kb > 0:
                    percent = round((used_kb / total_kb) * 100, 1)
            except Exception:
                try:
                    # Powershell fallback
                    out = subprocess.check_output('powershell -Command "Get-CimInstance Win32_OperatingSystem | Select FreePhysicalMemory,TotalVisibleMemorySize | Format-List"', shell=True, timeout=1, text=True)
                    mem = {}
                    for line in out.splitlines():
                        if ':' in line:
                            k, v = line.split(':', 1)
                            mem[k.strip()] = int(v.strip())
                    total_kb = mem.get('TotalVisibleMemorySize', 0)
                    free_kb = mem.get('FreePhysicalMemory', 0)
                    used_kb = total_kb - free_kb
                    total_gb = round(total_kb / (1024 * 1024), 1)
                    used_gb = round(used_kb / (1024 * 1024), 1)
                    if total_kb > 0:
                        percent = round((used_kb / total_kb) * 100, 1)
                except Exception:
                    pass
    except Exception as e:
        logger.debug("Failed to fetch RAM: %s", e)
    return {
        'total': total_gb or 16.0,
        'used': used_gb or 4.0,
        'percent': percent or 25.0
    }

def get_disk_usage():
    total_gb = 0.0
    used_gb = 0.0
    percent = 0.0
    try:
        path = '/' if os.name != 'nt' else 'C:\\'
        usage = shutil.disk_usage(path)
        total_gb = round(usage.total / (1024**3), 1)
        used_gb = round(usage.used / (1024**3), 1)
        if usage.total > 0:
            percent = round((usage.used / usage.total) * 100, 1)
    except Exception as e:
        logger.debug("Failed to fetch Disk: %s", e)
    return {
        'total': total_gb or 250.0,
        'used': used_gb or 50.0,
        'percent': percent or 20.0
    }

def get_system_uptime():
    try:
        if os.path.exists('/proc/uptime'):
            with open('/proc/uptime', 'r') as f:
                uptime_seconds = float(f.readline().split()[0])
            return uptime_seconds
        elif os.name == 'nt':
            try:
                out = subprocess.check_output('wmic os get lastbootuptime /value', shell=True, timeout=1, text=True)
                for line in out.splitlines():
                    if 'LastBootUpTime=' in line:
                        val = line.split('=')[1].strip()
                        import datetime
                        boot_dt = datetime.datetime.strptime(val.split('.')[0], '%Y%m%d%H%M%S')
                        # account for timezone offset
                        uptime_seconds = (datetime.datetime.now() - boot_dt).total_seconds()
                        return uptime_seconds
            except Exception:
                try:
                    # Powershell fallback
                    out = subprocess.check_output('powershell -Command "[Management.ManagementDateTimeConverter]::ToDateTime((Get-CimInstance Win32_OperatingSystem).LastBootUpTime)"', shell=True, timeout=1, text=True)
                    # out is string timestamp representation, parsing it:
                    # simpler: (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
                    out_sec = subprocess.check_output('powershell -Command "((Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalSeconds"', shell=True, timeout=1, text=True)
                    if out_sec.strip():
                        return float(out_sec.strip())
                except Exception:
                    pass
    except Exception:
        pass
    return time.time() - getattr(time, '_start_time', time.time())

def get_network_usage():
    """Return network RX/TX speed in bytes/sec using cached previous reading."""
    try:
        if os.path.exists('/proc/net/dev'):
            rx_total = tx_total = 0
            with open('/proc/net/dev', 'r') as f:
                for line in f:
                    line = line.strip()
                    if ':' not in line or line.startswith('Inter'):
                        continue
                    iface, rest = line.split(':', 1)
                    iface = iface.strip()
                    if iface in ('lo',):
                        continue
                    parts = rest.split()
                    if len(parts) >= 9:
                        rx_total += int(parts[0])
                        tx_total += int(parts[8])
            now = time.time()
            prev = widget_cache.get('sys_net_prev')
            widget_cache.set('sys_net_prev', (rx_total, tx_total, now), ttl=120)
            if prev:
                prev_rx, prev_tx, prev_t = prev
                dt = now - prev_t
                if dt > 0.1:
                    return {
                        'rx_speed': max(0, round((rx_total - prev_rx) / dt)),
                        'tx_speed': max(0, round((tx_total - prev_tx) / dt)),
                    }
        elif os.name == 'nt':
            out = subprocess.check_output(
                'powershell -Command "Get-NetAdapter -Physical | Where-Object Status -eq Up | Get-NetAdapterStatistics | Measure-Object ReceivedBytes,SentBytes -Sum | Select-Object Property,Sum | ConvertTo-Json"',
                shell=True, timeout=2, text=True,
            )
            import json as _json
            rows = _json.loads(out.strip())
            if not isinstance(rows, list):
                rows = [rows]
            rx = tx = 0
            for row in rows:
                prop = (row.get('Property') or '').lower()
                val = int(row.get('Sum') or 0)
                if 'received' in prop:
                    rx = val
                elif 'sent' in prop:
                    tx = val
            now = time.time()
            prev = widget_cache.get('sys_net_prev')
            widget_cache.set('sys_net_prev', (rx, tx, now), ttl=120)
            if prev:
                prev_rx, prev_tx, prev_t = prev
                dt = now - prev_t
                if dt > 0.1:
                    return {
                        'rx_speed': max(0, round((rx - prev_rx) / dt)),
                        'tx_speed': max(0, round((tx - prev_tx) / dt)),
                    }
    except Exception as exc:
        logger.debug('Network stats failed: %s', exc)
    return {'rx_speed': 0, 'tx_speed': 0}


def register(app):
    if not hasattr(time, '_start_time'):
        time._start_time = time.time()

    @app.route('/api/system_info/stats', methods=['GET'])
    def system_info_stats():
        ck = make_cache_key(CACHE_NS, 'global')
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        cpu = get_cpu_usage()
        ram = get_ram_usage()
        disk = get_disk_usage()
        uptime = get_system_uptime()
        net = get_network_usage()

        days = int(uptime // (24 * 3600))
        hours = int((uptime % (24 * 3600)) // 3600)
        minutes = int((uptime % 3600) // 60)

        if days > 0:
            uptime_str = f"{days}d {hours}h {minutes}m"
        elif hours > 0:
            uptime_str = f"{hours}h {minutes}m"
        else:
            uptime_str = f"{minutes}m"

        stats = {
            'cpu': cpu,
            'ram': ram,
            'disk': disk,
            'uptime': uptime_str,
            'raw_uptime': uptime,
            'network': net,
        }
        widget_cache.set(ck, stats, ttl=CACHE_TTL)
        return jsonify(stats)
