"""System health checks for the admin dashboard."""

import os
import shutil
import time
from datetime import datetime, timezone

from homy.api_metrics import api_calls_per_hour


def _check(check_id, label_key, status, detail_key=None, detail_params=None, detail=None,
           latency_ms=None, meta=None):
    return {
        'id': check_id,
        'label_key': label_key,
        'status': status,
        'detail_key': detail_key,
        'detail_params': detail_params or {},
        'detail': detail,
        'latency_ms': latency_ms,
        'meta': meta or {},
    }


def check_database():
    from homy.database import db

    t0 = time.perf_counter()
    try:
        db.session.execute(db.text('SELECT 1'))
        db.session.commit()
        ms = round((time.perf_counter() - t0) * 1000, 1)
        from homy.health_thresholds import status_database_latency

        uri = db.engine.url.database or 'sqlite'
        name = os.path.basename(str(uri)) if uri else 'sqlite'
        return _check(
            'database', 'health_database', status_database_latency(ms),
            detail_key='health_db_ok', detail_params={'name': name},
            latency_ms=ms,
        )
    except Exception as e:
        ms = round((time.perf_counter() - t0) * 1000, 1)
        return _check('database', 'health_database', 'error', detail=str(e)[:120], latency_ms=ms)


def check_redis():
    url = os.environ.get('REDIS_URL', '').strip()
    if not url:
        return _check(
            'redis', 'health_redis', 'na',
            detail_key='health_redis_inmemory',
        )
    t0 = time.perf_counter()
    try:
        import redis
        client = redis.from_url(url, socket_connect_timeout=2)
        client.ping()
        ms = round((time.perf_counter() - t0) * 1000, 1)
        return _check(
            'redis', 'health_redis', 'ok',
            detail_key='health_redis_connected',
            latency_ms=ms,
        )
    except ImportError:
        return _check(
            'redis', 'health_redis', 'warn',
            detail_key='health_redis_pkg_missing',
        )
    except Exception as e:
        ms = round((time.perf_counter() - t0) * 1000, 1)
        return _check('redis', 'health_redis', 'error', detail=str(e)[:120], latency_ms=ms)


def check_widget_cache():
    from homy.cache import widget_cache

    try:
        stats = widget_cache.stats()
        active = stats.get('active', 0)
        entries = stats.get('entries', 0)
        return _check(
            'widget_cache', 'health_widget_cache', 'ok',
            detail_key='health_cache_ok',
            detail_params={'active': active, 'entries': entries},
            meta=stats,
        )
    except Exception as e:
        return _check('widget_cache', 'health_widget_cache', 'error', detail=str(e)[:120])


def check_background_jobs():
    from homy.scheduler_service import scheduler_status
    from homy.database import BackgroundJob

    st = scheduler_status()
    pending = BackgroundJob.query.filter_by(status='pending').count()
    running = BackgroundJob.query.filter_by(status='running').count()
    if st.get('running'):
        return _check(
            'background_jobs', 'health_background_jobs', 'ok',
            detail_key='health_jobs_ok',
            detail_params={'pending': pending, 'running': running},
            meta=st,
        )
    return _check(
        'background_jobs', 'health_background_jobs', 'warn',
        detail_key='health_jobs_warn',
        detail_params={'pending': pending},
        meta=st,
    )


def check_storage():
    data_dir = os.environ.get(
        'DATA_DIR',
        os.path.join(os.path.expanduser('~'), '.homy'),
    )
    if not os.path.isdir(data_dir):
        try:
            os.makedirs(data_dir, exist_ok=True)
        except OSError as e:
            return _check(
                'storage', 'health_storage', 'error',
                detail_key='health_storage_dir_error',
                detail_params={'error': str(e)},
            )

    try:
        usage = shutil.disk_usage(data_dir)
        used_pct = round((usage.used / usage.total) * 100, 1) if usage.total else 0
        free_gb = round(usage.free / (1024 ** 3), 2)
        total_gb = round(usage.total / (1024 ** 3), 2)

        dir_bytes = 0
        for root, _dirs, files in os.walk(data_dir):
            for f in files:
                fp = os.path.join(root, f)
                try:
                    dir_bytes += os.path.getsize(fp)
                except OSError:
                    pass
        data_mb = round(dir_bytes / (1024 ** 2), 1)

        from homy.health_thresholds import status_storage

        status = status_storage(used_pct)

        return _check(
            'storage', 'health_storage', status,
            detail_key='health_storage_detail',
            detail_params={
                'pct': used_pct,
                'mb': data_mb,
                'free': free_gb,
                'total': total_gb,
            },
            meta={'used_percent': used_pct, 'data_dir_mb': data_mb, 'path': data_dir},
        )
    except Exception as e:
        return _check('storage', 'health_storage', 'error', detail=str(e)[:120])


def check_api_calls():
    from homy.health_thresholds import status_api_calls

    count = api_calls_per_hour()
    status = status_api_calls(count)
    return _check(
        'api_calls', 'health_api_calls', status,
        detail_key='health_api_per_hour',
        detail_params={'count': f'{count:,}'.replace(',', '.')},
        meta={'per_hour': count},
    )


def check_smtp():
    from homy.admin_settings import SMTP_HOST, get_setting_raw

    host = (get_setting_raw(SMTP_HOST, '') or '').strip()
    if host:
        return _check(
            'smtp', 'health_smtp', 'ok',
            detail_key='health_smtp_ok',
            detail_params={'host': host},
        )
    return _check('smtp', 'health_smtp', 'na', detail_key='health_smtp_na')


def check_maintenance():
    from homy.admin_settings import get_setting_bool, MAINTENANCE_MODE

    if get_setting_bool(MAINTENANCE_MODE, False):
        return _check(
            'maintenance', 'health_maintenance', 'warn',
            detail_key='health_maint_active',
        )
    return _check(
        'maintenance', 'health_maintenance', 'ok',
        detail_key='health_maint_inactive',
    )


def overall_status(checks):
    priority = {'error': 3, 'warn': 2, 'ok': 1, 'na': 0}
    worst = 'ok'
    for c in checks:
        s = c.get('status', 'ok')
        if priority.get(s, 0) > priority.get(worst, 0):
            worst = s
    return worst


def get_system_health():
    checks = [
        check_database(),
        check_redis(),
        check_widget_cache(),
        check_background_jobs(),
        check_storage(),
        check_api_calls(),
        check_smtp(),
        check_maintenance(),
    ]
    return {
        'overall': overall_status(checks),
        'checks': checks,
        'checked_at': datetime.now(timezone.utc).isoformat(),
    }
