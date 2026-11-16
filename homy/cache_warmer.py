"""Keep widget data warm in the background.

Every widget's data endpoint is called in-process on a schedule (setting
``cache_warm_interval``, seconds, 0 = off), so dashboards — and the browser add-on —
show current values instantly even when nobody had Homy open. The endpoints fill
the normal widget cache; nothing else changes.
"""
import logging
import time
from collections import defaultdict

logger = logging.getLogger(__name__)

_last_run = 0.0
INTERNAL_ENV = 'homy.internal'


def _targets(app, widgets):
    rules = {r.rule for r in app.url_map.iter_rules()}
    for w in widgets:
        data_url = f'/api/{w.type}/data'
        if data_url in rules:
            yield w, data_url, {'widget_id': w.id}
            continue
        cfg = w.resolve_config() or {}
        raw = cfg.get('integration_id')
        try:
            iid = int(raw)
        except (TypeError, ValueError):
            continue
        yield w, f'/api/integrations/{iid}/fetch', {}


def warm_widget_caches(app, force=False):
    """Call every widget data endpoint once. Returns the number of requests made."""
    global _last_run
    from homy.admin_settings import CACHE_WARM_INTERVAL, get_setting_int
    from homy.database import User, WidgetInstance, db

    with app.app_context():
        interval = get_setting_int(CACHE_WARM_INTERVAL, 120, 0, 86400)
        if not force and (interval <= 0 or time.monotonic() - _last_run < interval):
            return 0
        _last_run = time.monotonic()

        by_owner = defaultdict(list)
        for w in WidgetInstance.query.all():
            by_owner[w.user_id].append(w)
        if not by_owner:
            return 0
        admin = User.query.filter_by(role='admin').order_by(User.id).first()

        client = app.test_client()
        seen = set()
        count = 0
        started = time.monotonic()
        for owner_id, widgets in by_owner.items():
            user = db.session.get(User, owner_id) if owner_id is not None else admin
            if not user or getattr(user, 'is_locked', False):
                continue
            with client.session_transaction() as sess:
                sess['user_id'] = user.id
                sess['username'] = user.username
                sess['role'] = user.role
            for w, url, params in _targets(app, widgets):
                key = (owner_id, url, params.get('widget_id'))
                if key in seen:
                    continue
                seen.add(key)
                try:
                    client.get(url, query_string=params, environ_base={INTERNAL_ENV: True, 'REMOTE_ADDR': '127.0.0.1'})
                    count += 1
                except Exception as exc:  # pragma: no cover - a broken widget must not stop the run
                    logger.debug('Warm-up of %s failed: %s', url, exc)
        logger.info('Widget cache warmed: %d requests in %.1fs', count, time.monotonic() - started)
        return count
