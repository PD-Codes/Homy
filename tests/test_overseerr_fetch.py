from homy.integration_widget_fetch import (
    OVERSEERR_REQUEST_STATUS,
    _overseerr_format_seasons,
    _overseerr_media_type,
    _overseerr_parse_hidden_statuses,
)


def test_overseerr_media_type_from_request_type():
    assert _overseerr_media_type({'type': 'tv'}, {}) == 'tv'
    assert _overseerr_media_type({}, {'tvdbId': 1}) == 'tv'
    assert _overseerr_media_type({}, {'tmdbId': 1}) == 'movie'


def test_overseerr_format_seasons():
    assert _overseerr_format_seasons({'seasons': [1, 2]}, 'tv') == 'Staffeln 1, 2'
    assert _overseerr_format_seasons({'seasons': [{'seasonNumber': 3}]}, 'tv') == 'Staffel 3'
    assert _overseerr_format_seasons({'seasons': 'all'}, 'tv') == 'Alle Staffeln'
    assert _overseerr_format_seasons({'seasons': [1]}, 'movie') == ''


def test_overseerr_request_status_includes_completed():
    assert OVERSEERR_REQUEST_STATUS[5] == 'Abgeschlossen'


def test_overseerr_parse_hidden_statuses():
    assert _overseerr_parse_hidden_statuses({}) == set()
    assert _overseerr_parse_hidden_statuses({'hidden_request_statuses': '2,3,5'}) == {2, 3, 5}
    assert _overseerr_parse_hidden_statuses({'hidden_request_statuses': ' 2 , 3 '}) == {2, 3}
