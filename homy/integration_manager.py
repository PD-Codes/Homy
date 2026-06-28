"""Discover and load integration plugins from homy/integrations/."""

import importlib.util
import logging
import os
import sys

import configparser
from flask import jsonify, send_from_directory

logger = logging.getLogger(__name__)

_manager = None


def get_integration_manager():
    return _manager


class IntegrationManager:
    def __init__(self, app=None, module_manager=None):
        self.app = app
        self.module_manager = module_manager
        self.integrations_dir = None
        self.integrations = {}
        self.integration_types = {}
        self.fetch_handlers = {}

        if app:
            self.init_app(app)

    def init_app(self, app, module_manager=None):
        if module_manager is not None:
            self.module_manager = module_manager
        self.app = app
        self.integrations_dir = os.path.join(app.root_path, 'integrations')
        os.makedirs(self.integrations_dir, exist_ok=True)
        self.discover_and_load_integrations()
        self._sync_service_registry()
        self.register_routes()

    def discover_and_load_integrations(self):
        logger.info('Scanning for integrations in %s...', self.integrations_dir)
        if not os.path.exists(self.integrations_dir):
            return

        from homy.integration_service import SUPERSEDED_INTEGRATION_FOLDERS

        for entry in os.scandir(self.integrations_dir):
            if entry.is_dir() and not entry.name.startswith('_'):
                if entry.name in SUPERSEDED_INTEGRATION_FOLDERS:
                    canonical = os.path.join(self.integrations_dir, 'weather')
                    if os.path.isdir(canonical):
                        logger.info(
                            'Skipping superseded integration folder %s (use weather/)',
                            entry.name,
                        )
                        continue
                try:
                    self.load_integration(entry.name)
                except Exception as exc:
                    logger.error('Failed to load integration %s: %s', entry.name, exc, exc_info=True)

    def load_integration(self, folder_name):
        integration_path = os.path.join(self.integrations_dir, folder_name)
        info_file = os.path.join(integration_path, 'info.cfg')
        py_file = os.path.join(integration_path, f'{folder_name}.py')

        if not os.path.exists(info_file):
            logger.warning('Skipping integration %s: info.cfg not found', folder_name)
            return None

        cfg = configparser.ConfigParser()
        cfg.read(info_file, encoding='utf-8')
        integration_id = cfg.get('info', 'id', fallback=folder_name).strip() or folder_name
        default_language = cfg.get('info', 'default_language', fallback='enUS').strip() or 'enUS'

        lang_files = {}
        lang_dir = os.path.join(integration_path, 'lang')
        if os.path.exists(lang_dir) and os.path.isdir(lang_dir):
            for f_entry in os.scandir(lang_dir):
                if f_entry.is_file() and f_entry.name.endswith('.js'):
                    lang_code = f_entry.name[:-3]
                    lang_files[lang_code] = f'/integrations/{folder_name}/lang/{f_entry.name}'
                    if lang_code == 'deDE':
                        lang_files['de-DE'] = f'/integrations/{folder_name}/lang/{f_entry.name}'
                    elif lang_code == 'enUS':
                        lang_files['en-US'] = f'/integrations/{folder_name}/lang/{f_entry.name}'

        if not os.path.exists(py_file):
            logger.warning('Skipping integration %s: %s.py not found', folder_name, folder_name)
            return None

        spec = importlib.util.spec_from_file_location(
            f'homy._integration_plugins.{folder_name}',
            py_file,
        )
        if not spec or not spec.loader:
            raise ImportError(f'Cannot load integration module {py_file}')

        module_obj = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module_obj
        spec.loader.exec_module(module_obj)

        if hasattr(module_obj, 'get_integration_type'):
            type_def = module_obj.get_integration_type()
        elif hasattr(module_obj, 'INTEGRATION_TYPE'):
            type_def = getattr(module_obj, 'INTEGRATION_TYPE')
        else:
            raise AttributeError(f'{folder_name}.py must define INTEGRATION_TYPE or get_integration_type()')

        if not isinstance(type_def, dict):
            raise TypeError(f'Integration type definition for {folder_name} must be a dict')

        if not hasattr(module_obj, 'fetch_payload'):
            raise AttributeError(f'{folder_name}.py must define fetch_payload(config)')

        if hasattr(module_obj, 'register') and self.app:
            module_obj.register(self.app)

        info = {
            'id': integration_id,
            'folder': folder_name,
            'name': type_def.get('name') or cfg.get('info', 'name', fallback=integration_id),
            'author': cfg.get('info', 'author', fallback='Unknown'),
            'description': cfg.get('info', 'description', fallback=''),
            'url': cfg.get('info', 'url', fallback=''),
            'version': cfg.get('info', 'version', fallback='1.0.0'),
            'icon': type_def.get('icon') or cfg.get('info', 'icon', fallback='plug'),
            'default_language': default_language,
            'lang_files': lang_files,
        }

        type_def = dict(type_def)
        type_def.setdefault('name', info['name'])
        type_def.setdefault('icon', info['icon'])
        type_def['default_language'] = default_language
        type_def['lang_files'] = lang_files

        from homy.integration_ssl import VERIFY_SSL_FIELD
        fields = type_def.setdefault('fields', {})
        if 'verify_ssl' not in fields:
            fields['verify_ssl'] = VERIFY_SSL_FIELD

        self.integrations[integration_id] = {
            'info': info,
            'module_object': module_obj,
            'folder': folder_name,
        }
        self.integration_types[integration_id] = type_def
        self.fetch_handlers[integration_id] = module_obj.fetch_payload

        logger.info('Successfully loaded integration: %s v%s', integration_id, info['version'])
        self._sync_service_registry()
        if self.module_manager:
            from homy.integration_widgets import load_integration_widgets_for_folder

            load_integration_widgets_for_folder(
                self,
                self.module_manager,
                folder_name,
                integration_id,
            )
        return integration_id

    def _sync_service_registry(self):
        import homy.integration_service as svc

        # Legacy fetch alias only (do not expose duplicate type in UI).
        from homy.integration_service import LEGACY_INTEGRATION_TYPE_ALIASES

        for legacy_id, canonical_id in LEGACY_INTEGRATION_TYPE_ALIASES.items():
            if canonical_id in self.fetch_handlers:
                self.fetch_handlers[legacy_id] = self.fetch_handlers[canonical_id]

        svc.INTEGRATION_TYPES.clear()
        svc.INTEGRATION_TYPES.update(self.integration_types)
        svc._FETCH_HANDLERS.clear()
        svc._FETCH_HANDLERS.update(self.fetch_handlers)

    def fetch_payload(self, integration_type, config):
        from homy.integration_ssl import reset_ssl_context, set_ssl_context
        handler = self.fetch_handlers.get(integration_type)
        if not handler:
            raise ValueError(f'Unbekannter Integrationstyp: {integration_type}')
        config = dict(config or {})
        token = set_ssl_context(config)
        try:
            return handler(config)
        finally:
            reset_ssl_context(token)

    def register_routes(self):
        @self.app.route('/integrations/<integration_name>/<path:filename>')
        def serve_integration_static(integration_name, filename):
            integration_path = os.path.join(self.integrations_dir, integration_name)
            return send_from_directory(integration_path, filename)

        @self.app.route('/api/integration-plugins')
        def list_integration_plugins():
            from homy.integration_disable import get_disabled_integration_ids

            disabled = set(get_disabled_integration_ids())
            return jsonify({
                'integrations': [
                    item['info']
                    for iid, item in self.integrations.items()
                    if iid not in disabled
                ],
            })


def init_integration_manager(app, module_manager=None):
    global _manager
    _manager = IntegrationManager(app, module_manager=module_manager)
    return _manager
