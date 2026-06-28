"""Discover and register widgets shipped under integrations/<id>/widgets/."""

from __future__ import annotations

import configparser
import importlib.util
import logging
import os
import sys

from homy.module_manager import (
    GLOBAL_REFRESH_FALLBACK,
    _parse_integration_types,
    _parse_refresh_defaults,
    _register_widget_entry,
    _resolve_widget_refresh,
)
from homy.widget_route_util import register_widget_routes

logger = logging.getLogger(__name__)


def load_integration_widgets(integration_manager, module_manager):
    """Scan loaded integrations for widgets/ subfolders and register in widgets_registry."""
    if not integration_manager or not module_manager:
        return

    for integration_id, entry in integration_manager.integrations.items():
        folder = entry.get('folder') or integration_id
        load_integration_widgets_for_folder(
            integration_manager,
            module_manager,
            folder,
            integration_id,
        )


def load_integration_widgets_for_folder(
    integration_manager,
    module_manager,
    folder_name,
    integration_id,
):
    """Load widgets/ for one integration folder (used at startup and after package install)."""
    integration_path = os.path.join(integration_manager.integrations_dir, folder_name)
    info_cfg = os.path.join(integration_path, 'info.cfg')
    refresh_per_type, module_refresh_default = {}, GLOBAL_REFRESH_FALLBACK
    if os.path.isfile(info_cfg):
        cfg = configparser.ConfigParser()
        cfg.read(info_cfg, encoding='utf-8')
        refresh_per_type, module_refresh_default = _parse_refresh_defaults(cfg, folder_name)

    _load_widgets_subdirectory(
        integration_path,
        folder_name,
        integration_id,
        module_manager,
        refresh_per_type,
        module_refresh_default,
    )


def _load_widgets_subdirectory(
    integration_path,
    folder_name,
    integration_id,
    module_manager,
    refresh_per_type,
    module_refresh_default,
):
    widgets_dir = os.path.join(integration_path, 'widgets')
    if not os.path.isdir(widgets_dir):
        return

    for entry in os.scandir(widgets_dir):
        if not entry.is_dir() or entry.name.startswith('_'):
            continue

        sub = entry.name
        widget_path = entry.path
        cfg_file = os.path.join(widget_path, 'widget.cfg')
        py_file = os.path.join(widget_path, f'{sub}.py')

        widget_meta = {
            'type': None,
            'name': sub.replace('_', ' ').title(),
            'integration_types': [integration_id],
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
                parsed_types = _parse_integration_types(
                    wcfg.get('widget', 'integration_types', fallback='')
                )
                if parsed_types:
                    widget_meta['integration_types'] = parsed_types
                widget_meta['icon'] = wcfg.get('widget', 'icon', fallback='box')
                try:
                    widget_meta['default_size_x'] = wcfg.getint('widget', 'default_size_x', fallback=4)
                    widget_meta['default_size_y'] = wcfg.getint('widget', 'default_size_y', fallback=3)
                except ValueError:
                    pass

        widget_obj = None
        if os.path.exists(py_file):
            spec = importlib.util.spec_from_file_location(
                f'homy.integrations.{folder_name}.widgets.{sub}',
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

                if module_manager.app:
                    register_widget_routes(
                        module_manager.app,
                        widget_obj,
                        context=f'{folder_name}/widgets/{sub}',
                    )

        if not widget_meta['type']:
            logger.warning(
                'Skipping integration widget %s/%s: no type in widget.cfg or WIDGET',
                folder_name,
                sub,
            )
            continue

        js_name = f'{sub}.js'
        css_name = f'{sub}.css'
        js_path = os.path.join(widget_path, js_name)
        css_path = os.path.join(widget_path, css_name)

        entry_def = {
            **widget_meta,
            'widget_source': 'integration',
            'widget_role': 'integration',
            'js_file': (
                f'/integrations/{folder_name}/widgets/{sub}/{js_name}'
                if os.path.exists(js_path)
                else None
            ),
            'css_file': (
                f'/integrations/{folder_name}/widgets/{sub}/{css_name}'
                if os.path.exists(css_path)
                else None
            ),
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
            module_manager,
            entry_def,
            folder_name,
            refresh_per_type,
            module_refresh_default,
        )
        if registered:
            logger.info(
                'Loaded integration widget %s from %s',
                registered['type'],
                folder_name,
            )
