"""Tests for duplicate widget route registration guard."""

from flask import Flask

from homy.widget_route_util import register_widget_routes


def test_register_widget_routes_skips_duplicate_endpoints():
    app = Flask(__name__)

    def make_widget():
        class Widget:
            @staticmethod
            def register(flask_app):
                @flask_app.route('/api/demo/data', methods=['GET'], endpoint='widget_demo_data')
                def demo_data():
                    return {'ok': True}

        return Widget()

    widget = make_widget()
    assert register_widget_routes(app, widget, context='demo') is True
    assert register_widget_routes(app, widget, context='demo-duplicate') is False
    assert 'widget_demo_data' in app.view_functions
