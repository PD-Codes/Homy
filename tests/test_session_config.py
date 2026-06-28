from homy.session_config import (
    DEFAULT_SESSION_DAYS,
    MAX_SESSION_DAYS,
    MIN_SESSION_DAYS,
    clamp_session_days,
)


def test_clamp_session_days_defaults_invalid():
    assert clamp_session_days('') == DEFAULT_SESSION_DAYS
    assert clamp_session_days('abc') == DEFAULT_SESSION_DAYS


def test_clamp_session_days_range():
    assert clamp_session_days(0) == MIN_SESSION_DAYS
    assert clamp_session_days(30) == 30
    assert clamp_session_days(9999) == MAX_SESSION_DAYS
