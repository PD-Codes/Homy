"""Central TTL cache for widget API responses and external service calls."""
import time
import threading
from collections import OrderedDict
from flask import request


class TTLCache:
    def __init__(self, default_ttl=30, max_size=1000):
        # OrderedDict as LRU: most recently used entries are moved to the end
        self._store = OrderedDict()
        self._default_ttl = default_ttl
        self._max_size = max_size
        self._lock = threading.Lock()

    def get(self, key):
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            if entry['expires'] <= time.time():
                del self._store[key]
                return None
            self._store.move_to_end(key)
            return entry['data']

    def set(self, key, data, ttl=None):
        ttl = ttl if ttl is not None else self._default_ttl
        with self._lock:
            if len(self._store) >= self._max_size and key not in self._store:
                self._evict_oldest()
            self._store[key] = {
                'data': data,
                'expires': time.time() + ttl,
            }
            self._store.move_to_end(key)

    def invalidate(self, key):
        with self._lock:
            self._store.pop(key, None)

    def invalidate_prefix(self, prefix):
        with self._lock:
            keys = [k for k in self._store if k.startswith(prefix)]
            for k in keys:
                del self._store[k]

    def clear(self):
        with self._lock:
            self._store.clear()

    def stats(self):
        with self._lock:
            now = time.time()
            active = sum(1 for e in self._store.values() if e['expires'] > now)
            return {'entries': len(self._store), 'active': active}

    def _evict_oldest(self):
        # O(1) LRU eviction: drop the least recently used entry
        if self._store:
            self._store.popitem(last=False)


# Shared cache instance for all widget modules (namespaced keys: "module:id")
widget_cache = TTLCache(default_ttl=30, max_size=1000)


def cache_key(namespace, *parts):
    return ':'.join([namespace] + [str(p) for p in parts if p is not None])


def should_bypass_cache():
    try:
        from flask import has_request_context
        if not has_request_context():
            return False
        return request.args.get('nocache') == '1'
    except Exception:
        return False


def get_cached(namespace, key_parts, ttl, fetch_fn):
    """
    Return cached data or call fetch_fn() to populate cache.
    Respects ?nocache=1 on the current request.
    """
    key = cache_key(namespace, *key_parts)
    if not should_bypass_cache():
        cached = widget_cache.get(key)
        if cached is not None:
            return cached, True

    data = fetch_fn()
    widget_cache.set(key, data, ttl=ttl)
    return data, False


def invalidate_widget(namespace, widget_id):
    widget_cache.invalidate(cache_key(namespace, widget_id))
