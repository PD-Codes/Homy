import os
import tempfile
import unittest
from unittest.mock import patch, MagicMock

from homy.favicon_service import fetch_favicon, cache_dir


class TestFaviconService(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.mkdtemp()
        self._env = patch.dict(os.environ, {'DATA_DIR': self._tmp})
        self._env.start()

    def tearDown(self):
        self._env.stop()

    def test_fetch_google_candidate(self):
        png = b'\x89PNG\r\n\x1a\n' + b'\x00' * 64
        html_resp = MagicMock()
        html_resp.ok = True
        html_resp.content = b'<html></html>'
        html_resp.text = '<html></html>'
        html_resp.headers = {'Content-Type': 'text/html; charset=utf-8'}
        html_resp.status_code = 200
        html_resp.url = 'https://example.com/'

        png_resp = MagicMock()
        png_resp.ok = True
        png_resp.content = png
        png_resp.headers = {'Content-Type': 'image/png'}
        png_resp.status_code = 200
        png_resp.url = 'https://www.google.com/s2/favicons?domain=example.com&sz=64'

        def side_effect(url, **kwargs):
            if 'google.com/s2/favicons' in url:
                return png_resp
            return html_resp

        with patch('homy.favicon_service._request_url', side_effect=side_effect):
            result = fetch_favicon('https://example.com')
        self.assertTrue(result['ok'])
        self.assertEqual(result['source'], 'google_s2')
        self.assertFalse(result['from_cache'])

        result2 = fetch_favicon('https://example.com')
        self.assertTrue(result2['ok'])
        self.assertTrue(result2['from_cache'])

    def test_cache_dir_under_data_dir(self):
        self.assertTrue(cache_dir().startswith(self._tmp))

    def test_accepts_png_on_404_when_magic_valid(self):
        from homy.favicon_service import _is_valid_image

        png = b'\x89PNG\r\n\x1a\n' + b'\x00' * 64
        resp = MagicMock()
        resp.ok = False
        resp.status_code = 404
        resp.content = png
        resp.headers = {'Content-Type': 'image/png'}
        self.assertTrue(_is_valid_image(resp))


if __name__ == '__main__':
    unittest.main()
