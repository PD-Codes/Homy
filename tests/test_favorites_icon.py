import unittest

from homy.app import _normalize_favorite_icon_fields


class TestFavoritesIcon(unittest.TestCase):
    def test_normalize_auto(self):
        self.assertEqual(_normalize_favorite_icon_fields('auto', ''), ('auto', ''))
        self.assertEqual(_normalize_favorite_icon_fields('icon', 'link'), ('auto', ''))
        self.assertEqual(_normalize_favorite_icon_fields('icon', 'auto'), ('auto', ''))

    def test_normalize_lucide(self):
        self.assertEqual(_normalize_favorite_icon_fields('icon', 'star'), ('icon', 'star'))

    def test_favorites_icon_js_logic(self):
        """Mirror FavoritesIcon.usesFavicon for legacy DB rows."""
        def uses_favicon(icon_type, icon_value, url='https://example.com'):
            f = {'icon_type': icon_type, 'icon_value': icon_value, 'url': url}
            if f['icon_type'] == 'auto':
                return True
            if f['icon_type'] == 'icon':
                v = str(f['icon_value'] or '').strip()
                return not v or v in ('auto', 'link')
            return bool(url)
        self.assertTrue(uses_favicon('icon', 'link'))
        self.assertTrue(uses_favicon('auto', ''))
        self.assertFalse(uses_favicon('icon', 'star'))
