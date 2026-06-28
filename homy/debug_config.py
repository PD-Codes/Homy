"""Global debug flags (CLI: homy --debug)."""

import logging
import os
import sys

_DEBUG = False


def is_debug():
    env = os.environ.get('HOMY_DEBUG', '')
    return _DEBUG or env.lower() in ('1', 'true', 'yes', 'on')


def enable_debug():
    global _DEBUG
    _DEBUG = True
    os.environ['HOMY_DEBUG'] = 'true'

    root = logging.getLogger()
    root.setLevel(logging.DEBUG)

    for name in (
        'homy',
        'homy.app',
        'homy.favicon_service',
        'homy.module_manager',
        'homy.integration_manager',
        'werkzeug',
    ):
        logging.getLogger(name).setLevel(logging.DEBUG)

    # Keep SQLAlchemy quiet unless explicitly needed
    logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)

    print('[Homy] Debug mode enabled — verbose logs to stderr', file=sys.stderr)
    print('[Homy] Favicon fetches log cache hits/misses and download sources', file=sys.stderr)


def debug_log(logger, message, *args):
    if is_debug():
        logger.info('[Homy:debug] ' + message, *args)
