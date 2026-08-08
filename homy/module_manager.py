import os
import re
import sys
import logging
import configparser
import importlib.util
from flask import send_from_directory, jsonify

from homy.widget_route_util import register_widget_routes, should_skip_superseded_module

logger = logging.getLogger(__name__)

GLOBAL_REFRESH_FALLBACK = 30


def _parse_refresh_defaults(config, module_name):
    """Read refresh intervals from info.cfg ([info] + optional [refresh] section)."""
    per_type = {}
    if config.has_section('refresh'):
        for key, value in config.items('refresh'):
            key = key.strip()
            if not key:
                continue
            try:
                per_type[key] = int(str(value).strip())
            except ValueError:
                logger.warning('Invalid refresh value for %s.%s: %s', module_name, key, value)

    module_default = None
    if config.has_option('info', 'default_refresh_interval'):
        try:
            module_default = int(config.get('info', 'default_refresh_interval').strip())
        except ValueError:
            logger.warning('Invalid default_refresh_interval in %s info.cfg', module_name)

    return per_type, module_default


def _resolve_widget_refresh(widget_type, module_name, per_type, module_default):
    if widget_type in per_type:
        return per_type[widget_type]
    if module_default is not None:
        return module_default
    if module_name in per_type:
        return per_type[module_name]
    return GLOBAL_REFRESH_FALLBACK


def _parse_integration_types(raw):
    if not raw:
        return []
    return [t.strip() for t in str(raw).split(',') if t.strip()]


def _register_widget_entry(manager, entry, module_name, refresh_per_type, module_refresh_default):
    w_type = entry.get('type')
    if not w_type:
        return
    refresh_interval = _resolve_widget_refresh(
        w_type,
        module_name,
        refresh_per_type,
        module_refresh_default,
    )
    widget_def = {
        'module': module_name,
        'type': w_type,
        'name': entry.get('name', w_type),
        'default_size_x': entry.get('default_size_x', 3),
        'default_size_y': entry.get('default_size_y', 2),
        'config_schema': entry.get('config_schema', {}),
        'default_refresh_interval': refresh_interval,
        'supports_auto_refresh': refresh_interval != 0,
        'integration_types': entry.get('integration_types', []),
        'widget_source': entry.get('widget_source', 'module'),
        'widget_role': entry.get('widget_role', 'display'),
        'icon': entry.get('icon', 'box'),
        'js_file': entry.get('js_file'),
        'css_file': entry.get('css_file'),
        'dual_data_source': entry.get('dual_data_source', False),
    }
    manager.widgets_registry[w_type] = widget_def
    return widget_def


def _get_disabled_module_ids():
    from homy.database import Setting
    try:
        settings = Setting.query.filter(
            Setting.key.like('module_disabled_%'),
            Setting.value == 'true'
        ).all()
        return [s.key[len('module_disabled_'):] for s in settings]
    except Exception as e:
        logger.error(f"Error querying disabled modules: {e}")
        return []


class ModuleManager:
    def __init__(self, app=None):
        self.app = app
        self.modules = {} # Key: module_name, Value: dict of metadata and module object
        self.widgets_registry = {} # Key: widget_type, Value: dict of widget config schema
        
        if app:
            self.init_app(app)

    def init_app(self, app):
        self.app = app
        self.modules_dir = os.path.join(app.root_path, 'modules')
        
        if not os.path.exists(self.modules_dir):
            os.makedirs(self.modules_dir, exist_ok=True)
            
        self.discover_and_load_modules()
        self.register_routes()

    def discover_and_load_modules(self):
        logger.info(f"Scanning for modules in {self.modules_dir}...")
        
        if not os.path.exists(self.modules_dir):
            return
            
        for entry in os.scandir(self.modules_dir):
            if entry.is_dir() and not entry.name.startswith('_'):
                module_name = entry.name
                if should_skip_superseded_module(self.app, module_name):
                    logger.info(
                        'Skipping legacy module %s (superseded by integrations/%s)',
                        module_name,
                        module_name,
                    )
                    continue
                try:
                    self.load_module(module_name)
                except Exception as e:
                    logger.error(f"Failed to load module {module_name}: {e}", exc_info=True)

    def _load_widgets_subdirectory(self, module_path, module_name, refresh_per_type, module_refresh_default, info):
        widgets_dir = os.path.join(module_path, 'widgets')
        if not os.path.isdir(widgets_dir):
            return

        for entry in os.scandir(widgets_dir):
            if not entry.is_dir() or entry.name.startswith('_'):
                continue

            folder = entry.name
            widget_path = entry.path
            cfg_file = os.path.join(widget_path, 'widget.cfg')
            py_file = os.path.join(widget_path, f'{folder}.py')

            widget_meta = {
                'type': None,
                'name': folder.replace('_', ' ').title(),
                'integration_types': [],
                'default_size_x': 4,
                'default_size_y': 3,
                'config_schema': {},
                'icon': 'box',
            }

            if os.path.exists(cfg_file):
                wcfg = configparser.ConfigParser()
                wcfg.read(cfg_file, encoding='utf-8')
                if wcfg.has_section('widget'):
                    widget_meta['type'] = wcfg.get('widget', 'type', fallback=None)
                    widget_meta['name'] = wcfg.get('widget', 'name', fallback=widget_meta['name'])
                    widget_meta['integration_types'] = _parse_integration_types(
                        wcfg.get('widget', 'integration_types', fallback='')
                    )
                    widget_meta['icon'] = wcfg.get('widget', 'icon', fallback='box')
                    try:
                        widget_meta['default_size_x'] = wcfg.getint('widget', 'default_size_x', fallback=4)
                        widget_meta['default_size_y'] = wcfg.getint('widget', 'default_size_y', fallback=3)
                    except ValueError:
                        pass

            widget_obj = None
            if os.path.exists(py_file):
                spec = importlib.util.spec_from_file_location(
                    f'homy.modules.{module_name}.widgets.{folder}',
                    py_file,
                )
                if spec and spec.loader:
                    widget_obj = importlib.util.module_from_spec(spec)
                    sys.modules[spec.name] = widget_obj
                    spec.loader.exec_module(widget_obj)

                    if hasattr(widget_obj, 'WIDGET') and isinstance(widget_obj.WIDGET, dict):
                        w = widget_obj.WIDGET
                        widget_meta['type'] = w.get('type') or widget_meta['type']
                        widget_meta['name'] = w.get('name', widget_meta['name'])
                        widget_meta['default_size_x'] = w.get('default_size_x', widget_meta['default_size_x'])
                        widget_meta['default_size_y'] = w.get('default_size_y', widget_meta['default_size_y'])
                        widget_meta['config_schema'] = w.get('config_schema', widget_meta['config_schema'])
                        if w.get('integration_types'):
                            widget_meta['integration_types'] = list(w['integration_types'])
                        if w.get('icon'):
                            widget_meta['icon'] = w['icon']

                    if self.app:
                        register_widget_routes(
                            self.app,
                            widget_obj,
                            context=f'{module_name}/widgets/{folder}',
                        )

            if not widget_meta['type']:
                logger.warning('Skipping widget folder %s/%s: no type in widget.cfg or WIDGET', module_name, folder)
                continue

            js_name = f'{folder}.js'
            css_name = f'{folder}.css'
            js_path = os.path.join(widget_path, js_name)
            css_path = os.path.join(widget_path, css_name)

            entry_def = {
                **widget_meta,
                'widget_source': 'module_widget',
                'widget_role': 'integration',
                'js_file': f'/modules/{module_name}/widgets/{folder}/{js_name}' if os.path.exists(js_path) else None,
                'css_file': f'/modules/{module_name}/widgets/{folder}/{css_name}' if os.path.exists(css_path) else None,
            }

            if not entry_def['config_schema']:
                entry_def['config_schema'] = {
                    'integration_id': {
                        'type': 'text',
                        'label': 'Integration ID',
                        'default': '',
                    },
                }

            registered = _register_widget_entry(
                self,
                entry_def,
                module_name,
                refresh_per_type,
                module_refresh_default,
            )
            if registered:
                info['widgets'].append(registered)
                info.setdefault('widget_assets', []).append({
                    'type': registered['type'],
                    'js_file': registered.get('js_file'),
                    'css_file': registered.get('css_file'),
                })
                logger.info('Loaded subfolder widget %s from module %s', registered['type'], module_name)

    def load_module(self, name):
        module_path = os.path.join(self.modules_dir, name)
        info_file = os.path.join(module_path, 'info.cfg')
        py_file = os.path.join(module_path, f'{name}.py')
        
        if not os.path.exists(info_file):
            logger.warning(f"Skipping module {name}: info.cfg not found")
            return
            
        # Parse info.cfg
        config = configparser.ConfigParser()
        config.read(info_file, encoding='utf-8')
        refresh_per_type, module_refresh_default = _parse_refresh_defaults(config, name)
        
        # Scan for language files
        lang_files = {}
        lang_dir = os.path.join(module_path, 'lang')
        if os.path.exists(lang_dir) and os.path.isdir(lang_dir):
            for f_entry in os.scandir(lang_dir):
                if f_entry.is_file() and f_entry.name.endswith('.js'):
                    lang_code = f_entry.name[:-3] # Remove '.js'
                    lang_files[lang_code] = f'/modules/{name}/lang/{f_entry.name}'
                    # Standardize common mappings:
                    if lang_code == 'deDE':
                        lang_files['de-DE'] = f'/modules/{name}/lang/{f_entry.name}'
                    elif lang_code == 'enUS':
                        lang_files['en-US'] = f'/modules/{name}/lang/{f_entry.name}'

        info = {
            'id': name,
            'name': config.get('info', 'name', fallback=name),
            'author': config.get('info', 'author', fallback='Unknown'),
            'description': config.get('info', 'description', fallback=''),
            'url': config.get('info', 'url', fallback=''),
            'version': config.get('info', 'version', fallback='1.0.0'),
            'js_file': f'/modules/{name}/{name}.js' if os.path.exists(os.path.join(module_path, f'{name}.js')) else None,
            'css_file': f'/modules/{name}/{name}.css' if os.path.exists(os.path.join(module_path, f'{name}.css')) else None,
            'lang_files': lang_files,
            'widgets': [],
            'widget_assets': [],
        }
        
        # Load Python module dynamically if exists
        module_obj = None
        if os.path.exists(py_file):
            spec = importlib.util.spec_from_file_location(f"homy.modules.{name}", py_file)
            if spec and spec.loader:
                module_obj = importlib.util.module_from_spec(spec)
                sys.modules[spec.name] = module_obj
                spec.loader.exec_module(module_obj)
                
                # Check for register hook
                if hasattr(module_obj, 'register'):
                    module_obj.register(self.app)
                    logger.info(f"Registered routes for module {name}")
                
                # Read widgets schema defined in python
                if hasattr(module_obj, 'WIDGETS'):
                    widgets = getattr(module_obj, 'WIDGETS')
                    for w in widgets:
                        w_type = w.get('type')
                        if not w_type:
                            continue
                        entry_def = {
                            'type': w_type,
                            'name': w.get('name', w_type),
                            'default_size_x': w.get('default_size_x', 3),
                            'default_size_y': w.get('default_size_y', 2),
                            'config_schema': w.get('config_schema', {}),
                            'integration_types': w.get('integration_types', []),
                            'widget_source': 'module',
                            'widget_role': w.get('widget_role', 'display'),
                            'icon': w.get('icon', 'box'),
                            'js_file': info['js_file'],
                            'css_file': info['css_file'],
                            'dual_data_source': w.get('dual_data_source', False),
                        }
                        registered = _register_widget_entry(
                            self,
                            entry_def,
                            name,
                            refresh_per_type,
                            module_refresh_default,
                        )
                        if registered:
                            info['widgets'].append(registered)

        self._load_widgets_subdirectory(
            module_path,
            name,
            refresh_per_type,
            module_refresh_default,
            info,
        )
                            
        self.modules[name] = {
            'info': info,
            'module_object': module_obj
        }
        logger.info(f"Successfully loaded module: {name} v{info['version']}")

    def register_routes(self):
        # Serve module static assets
        @self.app.route('/modules/<module_name>/<path:filename>')
        def serve_module_static(module_name, filename):
            # The module name becomes part of the base directory, so send_from_directory
            # cannot protect it — validate it explicitly against traversal.
            if not re.fullmatch(r'[A-Za-z0-9_-]+', module_name or ''):
                return jsonify({'error': 'Not Found'}), 404
            module_path = os.path.join(self.modules_dir, module_name)
            return send_from_directory(module_path, filename)
            
        # API listing modules
        @self.app.route('/api/modules')
        def get_modules():
            disabled_modules = _get_disabled_module_ids()
                
            modules_list = [m['info'] for name, m in self.modules.items() if name not in disabled_modules]
            widgets_list = [
                w for w_type, w in self.widgets_registry.items()
                if w.get('widget_source') != 'integration' and w['module'] not in disabled_modules
            ]
            integration_widget_assets = [
                {
                    'type': w['type'],
                    'js_file': w.get('js_file'),
                    'css_file': w.get('css_file'),
                }
                for w in self.widgets_registry.values()
                if w.get('widget_source') == 'integration' and w.get('js_file')
            ]
            if integration_widget_assets:
                modules_list.append({
                    'id': '_integration_widgets',
                    'name': 'Integration Widgets',
                    'widget_assets': integration_widget_assets,
                })

            widgets_list.extend(
                w for w in self.widgets_registry.values()
                if w.get('widget_source') == 'integration'
            )

            return jsonify({
                'modules': modules_list,
                'widgets': widgets_list,
            })
