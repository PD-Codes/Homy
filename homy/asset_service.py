"""User-uploaded assets (icons, backgrounds) — storage and access control."""

import os
import uuid
import mimetypes
from werkzeug.utils import secure_filename

from homy.database import db, UserAsset

def _category_rules():
    from homy.admin_settings import get_upload_limits

    limits = get_upload_limits()
    return {
        'icon': {
            'mime_types': {
                'image/png', 'image/jpeg', 'image/webp', 'image/gif',
                'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon',
            },
            'max_bytes': limits['icon'],
            'extensions': {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico'},
            'verify_image': False,
            'optimize_max_side': 256,
        },
        'avatar': {
            'mime_types': {'image/png', 'image/jpeg', 'image/webp', 'image/gif'},
            'max_bytes': limits['avatar'],
            'extensions': {'.png', '.jpg', '.jpeg', '.webp', '.gif'},
            'verify_image': True,
            'optimize_max_side': 512,
        },
        'background': {
            'mime_types': {'image/png', 'image/jpeg', 'image/webp', 'image/gif'},
            'max_bytes': limits['background'],
            'extensions': {'.png', '.jpg', '.jpeg', '.webp', '.gif'},
            'verify_image': True,
            'optimize_max_side': 1920,
        },
    }


def get_asset_categories():
    return _category_rules()


def get_data_dir():
    default_data_dir = os.path.join(os.path.expanduser('~'), '.homy')
    return os.environ.get('DATA_DIR', default_data_dir)


def get_uploads_root():
    root = os.path.join(get_data_dir(), 'uploads', 'assets')
    os.makedirs(root, exist_ok=True)
    return root


def get_packages_root():
    root = os.path.join(get_data_dir(), 'uploads', 'packages')
    os.makedirs(root, exist_ok=True)
    return root


def _storage_subdir(user_id, is_global):
    if is_global:
        return os.path.join(get_uploads_root(), 'global')
    return os.path.join(get_uploads_root(), f'user_{user_id}')


def _packages_subdir(user_id, is_global):
    if is_global:
        return os.path.join(get_packages_root(), 'global')
    return os.path.join(get_packages_root(), f'user_{user_id}')


def get_branding_dir():
    root = os.path.join(get_data_dir(), 'uploads', 'branding')
    os.makedirs(root, exist_ok=True)
    return root


def site_logo_file_path():
    return os.path.join(get_branding_dir(), 'site_logo')


def validate_asset_file(file_storage, category):
    rules = _category_rules().get(category)
    if not rules:
        return False, 'Unbekannte Kategorie'

    if not file_storage or not file_storage.filename:
        return False, 'Keine Datei ausgewählt'

    original = secure_filename(file_storage.filename)
    if not original:
        return False, 'Ungültiger Dateiname'

    ext = os.path.splitext(original)[1].lower()
    if ext not in rules['extensions']:
        return False, f'Dateityp nicht erlaubt ({ext or "ohne Endung"})'

    file_storage.stream.seek(0, os.SEEK_END)
    size = file_storage.stream.tell()
    file_storage.stream.seek(0)

    if size <= 0:
        return False, 'Datei ist leer'
    if size > rules['max_bytes']:
        max_mb = rules['max_bytes'] / (1024 * 1024)
        return False, f'Datei zu groß (max. {max_mb:.1f} MB)'

    mime = file_storage.mimetype or mimetypes.guess_type(original)[0] or 'application/octet-stream'
    if mime not in rules['mime_types'] and ext != '.ico':
        return False, f'MIME-Typ nicht erlaubt ({mime})'

    return True, original


def can_access_asset(asset, session):
    if asset.user_id is None:
        return True
    user_id = session.get('user_id')
    if not user_id:
        return False
    if session.get('role') == 'admin':
        return True
    return asset.user_id == user_id


def can_delete_asset(asset, session):
    if session.get('role') == 'admin':
        return True
    user_id = session.get('user_id')
    if not user_id:
        return False
    if asset.user_id is None:
        return session.get('role') == 'admin'
    return asset.user_id == user_id


def can_edit_asset(asset, session):
    if session.get('role') == 'admin':
        return True
    user_id = session.get('user_id')
    return bool(user_id and asset.user_id == user_id)


def _session_user(session):
    if not session.get('user_id'):
        return None
    return {'user_id': session['user_id'], 'role': session.get('role')}


def asset_file_path(asset):
    sub = _storage_subdir(asset.user_id, asset.user_id is None)
    return os.path.join(sub, asset.stored_filename)


def asset_public_url(asset_id):
    return f'/api/assets/{asset_id}/file'


def list_assets(session, category=None, scope='all'):
    query = UserAsset.query
    if category:
        query = query.filter_by(category=category)

    user_id = session.get('user_id')
    session_user = _session_user(session)

    if scope == 'mine':
        if not user_id:
            return []
        query = query.filter(UserAsset.user_id == user_id)
    elif scope == 'global':
        query = query.filter(UserAsset.user_id.is_(None))
    elif user_id:
        from sqlalchemy import or_
        query = query.filter(or_(UserAsset.user_id.is_(None), UserAsset.user_id == user_id))
    else:
        query = query.filter(UserAsset.user_id.is_(None))

    assets = query.order_by(UserAsset.created_at.desc()).all()
    return [a.to_dict(session_user) for a in assets]


def save_asset(file_storage, session, category, is_global=False):
    if 'user_id' not in session:
        return None, 'Anmeldung erforderlich', 401

    if is_global and session.get('role') != 'admin':
        return None, 'Nur Admins können globale Assets hochladen', 403

    ok, message = validate_asset_file(file_storage, category)
    if not ok:
        return None, message, 400

    original_name = message
    ext = os.path.splitext(original_name)[1].lower()
    stored_filename = f'{uuid.uuid4().hex}{ext}'
    target_user_id = None if is_global else session['user_id']
    subdir = _storage_subdir(target_user_id, is_global)
    os.makedirs(subdir, exist_ok=True)
    full_path = os.path.join(subdir, stored_filename)

    file_storage.stream.seek(0)
    file_storage.save(full_path)

    rules = _category_rules().get(category) or {}
    if rules.get('verify_image'):
        from homy.image_util import verify_image_stream, optimize_image_file
        with open(full_path, 'rb') as fh:
            ok_img, img_err = verify_image_stream(fh)
        if not ok_img:
            os.remove(full_path)
            return None, img_err, 400
        optimize_image_file(full_path, max_side=rules.get('optimize_max_side', 512))

    mime = file_storage.mimetype or mimetypes.guess_type(original_name)[0] or 'application/octet-stream'
    size = os.path.getsize(full_path)

    asset = UserAsset(
        user_id=target_user_id,
        category=category,
        stored_filename=stored_filename,
        original_name=original_name,
        mime_type=mime,
        size_bytes=size,
    )
    db.session.add(asset)
    db.session.commit()
    return asset, None, 201


def update_asset(asset_id, session, data):
    import shutil

    asset = db.session.get(UserAsset, asset_id)
    if not asset:
        return None, 'Asset nicht gefunden', 404
    if not can_edit_asset(asset, session):
        return None, 'Keine Berechtigung', 403

    if 'original_name' in data:
        name = (data.get('original_name') or '').strip()
        if name:
            asset.original_name = name[:255]

    if 'is_global' in data:
        want_global = bool(data['is_global'])
        currently_global = asset.user_id is None
        if want_global != currently_global:
            if want_global and session.get('role') != 'admin':
                return None, 'Nur Admins können Assets global freigeben', 403
            if currently_global and not want_global and session.get('role') != 'admin':
                return None, 'Nur Admins können die globale Freigabe aufheben', 403

            old_path = asset_file_path(asset)
            if want_global:
                asset.user_id = None
            else:
                asset.user_id = session['user_id']

            new_dir = _storage_subdir(asset.user_id, asset.user_id is None)
            os.makedirs(new_dir, exist_ok=True)
            new_path = os.path.join(new_dir, asset.stored_filename)
            if os.path.isfile(old_path) and old_path != new_path:
                shutil.move(old_path, new_path)

    db.session.commit()
    session_user = _session_user(session)
    return asset, None, 200


def delete_asset(asset_id, session):
    asset = db.session.get(UserAsset, asset_id)
    if not asset:
        return False, 'Asset nicht gefunden', 404
    if not can_delete_asset(asset, session):
        return False, 'Keine Berechtigung', 403

    path = asset_file_path(asset)
    if os.path.isfile(path):
        try:
            os.remove(path)
        except OSError:
            pass

    db.session.delete(asset)
    db.session.commit()
    return True, None, 200


_SITE_LOGO_EXTS = ('.png', '.jpg', '.jpeg', '.webp', '.gif')


def find_site_logo_path():
    base = site_logo_file_path()
    for ext in _SITE_LOGO_EXTS:
        path = base + ext
        if os.path.isfile(path):
            return path
    return None


def branding_logo_url():
    if find_site_logo_path():
        return '/api/branding/logo'
    return None


def clear_site_logo_files():
    base = site_logo_file_path()
    for ext in _SITE_LOGO_EXTS:
        path = base + ext
        if os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass


def save_site_logo(file_storage):
    """Store site logo under uploads/branding (separate from media library)."""
    if not file_storage or not file_storage.filename:
        return None, 'Keine Datei', 400

    rules = _category_rules().get('icon') or {}
    ok, message = validate_asset_file(file_storage, 'icon')
    if not ok:
        return None, message, 400

    original_name = message
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in rules.get('extensions', {'.png'}):
        return None, 'Dateityp nicht erlaubt', 400

    clear_site_logo_files()
    dest = site_logo_file_path() + ext
    file_storage.stream.seek(0)
    file_storage.save(dest)

    from homy.image_util import verify_image_stream, optimize_image_file
    with open(dest, 'rb') as fh:
        ok_img, img_err = verify_image_stream(fh)
    if not ok_img:
        os.remove(dest)
        return None, img_err, 400
    optimize_image_file(dest, max_side=256)

    return branding_logo_url(), None, 200
