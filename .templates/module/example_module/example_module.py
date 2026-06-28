"""
Example module — defines what widgets this module exposes and optionally
registers Flask routes for any backend API those widgets need.

Rename this file and the containing folder to the same name (snake_case).
"""

# WIDGETS tells Homy what this module offers. Each entry becomes a widget
# that users can drag onto their dashboard.
WIDGETS = [
    {
        # 'type' is the unique identifier for this widget. It has to match
        # the string you pass to WidgetRegistry.register() in the JS file.
        'type': 'example_hello',

        # Display name shown in the "Add widget" panel.
        'name': 'Example: Hello',

        # Lucide icon name shown in the widget panel. Browse icons at lucide.dev.
        'icon': 'sparkles',

        # Default grid size in columns (max 24) and rows.
        'default_size_x': 4,
        'default_size_y': 2,

        # Optional config fields. Users set these in the widget settings panel.
        # Supported types: 'text', 'password', 'select', 'textarea'
        'config_schema': {
            'greeting': {
                'type': 'text',
                'label': 'Greeting text',
                'default': 'Hello, Dashboard!',
                # 'placeholder' and 'help' are also supported:
                # 'placeholder': 'Type something...',
                # 'help': 'Shown below the label as a small hint.',
            },
            'style': {
                'type': 'select',
                'label': 'Style',
                'options': ['Default', 'Bold', 'Muted'],
                'default': 'Default',
            },
        },
    },
]


def register(app):
    """Register Flask routes for this module's widgets.

    Leave this empty if your widget is purely frontend — no server calls needed.
    Add routes here if you need to fetch data, talk to local APIs, etc.
    """
    pass

    # Example route — uncomment and adjust if needed:
    #
    # from flask import jsonify, request
    # from homy.auth import login_required
    #
    # @app.route('/api/example_hello/data', methods=['GET'])
    # def example_hello_data():
    #     widget_id = request.args.get('widget_id')
    #     return jsonify({'message': 'Hello from the server', 'widget_id': widget_id})
