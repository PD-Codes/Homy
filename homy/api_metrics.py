"""In-process API request counter (rolling per clock hour)."""

import threading
import time

_lock = threading.Lock()
_hour_bucket = int(time.time() // 3600)
_count = 0


def record_api_call():
    global _hour_bucket, _count
    with _lock:
        bucket = int(time.time() // 3600)
        if bucket != _hour_bucket:
            _hour_bucket = bucket
            _count = 0
        _count += 1


def api_calls_per_hour():
    with _lock:
        bucket = int(time.time() // 3600)
        if bucket != _hour_bucket:
            return 0
        return _count
