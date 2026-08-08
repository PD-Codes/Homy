"""Full database and settings backup / restore."""

import io
import json
import os
import shutil
import sqlite3
import zipfile
from datetime import datetime, timezone

from flask import current_app

from homy.database import db, Setting, User, AuditLog, WidgetInstance, FavoriteLink, Integration


def _data_dir():
    uri = db.engine.url.database
    if uri and os.path.isfile(uri):
        return os.path.dirname(os.path.abspath(uri))
    return os.environ.get('DATA_DIR', os.path.join(os.path.expanduser('~'), '.homy'))


def create_full_backup():
    """Return (bytes, filename) for a zip backup."""
    data_dir = _data_dir()
    buf = io.BytesIO()
    exported_at = datetime.now(timezone.utc).isoformat()

    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        manifest = {
            'version': '1.0',
            'exported_at': exported_at,
            'type': 'homy_full_backup',
        }
        zf.writestr('manifest.json', json.dumps(manifest, indent=2))

        from homy.admin_settings import settings_dict_for_admin
        zf.writestr('settings.json', json.dumps(settings_dict_for_admin(), indent=2))

        db_path = db.engine.url.database
        if db_path and os.path.isfile(db_path):
            zf.write(db_path, 'homy.db')

        assets_dir = os.path.join(data_dir, 'uploads', 'assets')
        if os.path.isdir(assets_dir):
            for root, _dirs, files in os.walk(assets_dir):
                for name in files:
                    full = os.path.join(root, name)
                    arc = os.path.join('assets', os.path.relpath(full, assets_dir))
                    zf.write(full, arc.replace('\\', '/'))

    buf.seek(0)
    fname = f'homy_full_backup_{datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")}.zip'
    return buf.getvalue(), fname


def restore_full_backup(zip_bytes):
    """Restore from zip; returns summary dict. Requires app restart for some changes."""
    data_dir = _data_dir()
    summary = {'settings': 0, 'database': False, 'assets': 0}

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        if 'manifest.json' in zf.namelist():
            manifest = json.loads(zf.read('manifest.json'))
            if manifest.get('type') != 'homy_full_backup':
                raise ValueError('Ungültiges Backup-Format')

        if 'settings.json' in zf.namelist():
            from homy.admin_settings import save_admin_settings
            settings = json.loads(zf.read('settings.json'))
            save_admin_settings(settings, skip_masked=False)
            summary['settings'] = len(settings)

        db_archive = 'homy.db' if 'homy.db' in zf.namelist() else None
        if db_archive:
            db_path = db.engine.url.database
            if not db_path:
                raise ValueError('Keine SQLite-Datenbank konfiguriert')
            db.session.remove()
            db.engine.dispose()
            backup_path = db_path + '.bak'
            if os.path.isfile(db_path):
                shutil.copy2(db_path, backup_path)
            with open(db_path, 'wb') as out:
                out.write(zf.read(db_archive))
            summary['database'] = True

        uploads_root = os.path.realpath(os.path.join(data_dir, 'uploads'))
        for name in zf.namelist():
            if name.startswith('assets/') and not name.endswith('/'):
                target = os.path.join(data_dir, 'uploads', name)
                # Reject entries that escape the uploads directory (zip slip).
                real_target = os.path.realpath(target)
                if not real_target.startswith(uploads_root + os.sep):
                    continue
                target = real_target
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with zf.open(name) as src, open(target, 'wb') as dst:
                    dst.write(src.read())
                summary['assets'] += 1

    return summary
