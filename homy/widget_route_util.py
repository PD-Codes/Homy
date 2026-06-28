"""Safe Flask route registration for widget plugins."""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

# Modules moved to integrations/<id>/ — skip legacy copies under modules/ when present.
SUPERSEDED_MODULE_IDS = frozenset({'aniworld_downloader'})


def register_widget_routes(app, widget_obj, *, context: str = 'widget') -> bool:
    """Call widget.register(app); return False if routes were already registered."""
    if not app or not hasattr(widget_obj, 'register'):
        return False
    try:
        widget_obj.register(app)
        return True
    except AssertionError as exc:
        msg = str(exc)
        if 'overwriting an existing endpoint' in msg:
            logger.warning('Skipping duplicate widget routes (%s): %s', context, msg)
            return False
        raise


def should_skip_superseded_module(app, module_name: str) -> bool:
    """Skip legacy modules/ copy when the same id exists under integrations/."""
    if module_name not in SUPERSEDED_MODULE_IDS:
        return False
    integration_path = os.path.join(app.root_path, 'integrations', module_name)
    return os.path.isdir(integration_path)
