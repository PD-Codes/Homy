import time
from homy.cache import TTLCache, cache_key, get_cached


def test_ttl_cache_get_set_and_expiry():
    c = TTLCache(default_ttl=1, max_size=10)
    c.set('a', {'x': 1}, ttl=1)
    assert c.get('a') == {'x': 1}
    time.sleep(1.1)
    assert c.get('a') is None


def test_cache_key_namespacing():
    assert cache_key('proxmox', 'wid-1') == 'proxmox:wid-1'


def test_get_cached_bypass():
    from homy.cache import widget_cache
    widget_cache.clear()
    calls = {'n': 0}

    def fetch():
        calls['n'] += 1
        return {'ok': True}

    data, hit = get_cached('test', 'k1', 30, fetch)
    assert hit is False
    assert data == {'ok': True}
    assert calls['n'] == 1

    data2, hit2 = get_cached('test', 'k1', 30, fetch)
    assert hit2 is True
    assert data2 == {'ok': True}
    assert calls['n'] == 1
