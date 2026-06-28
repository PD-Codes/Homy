"""Validate uploaded .zip packages for modules, integrations, and templates."""

import io
import json
import os
import zipfile
import configparser


PACKAGE_TYPES = ('module', 'integration', 'template')

FORBIDDEN_CODE_PATTERNS = (
    r'\bos\.system\s*\(',
    r'\bsubprocess\b',
    r'\beval\s*\(',
    r'\bexec\s*\(',
    r'__import__\s*\(',
    r'\bopen\s*\([^)]*settings',
    r'\bregister\s*\(',
    r'\binit_db\s*\(',
    r'User\.query',
    r'db\.session\.commit',
    r'ALTER\s+TABLE',
    r'DROP\s+TABLE',
)

FORBIDDEN_FILENAMES = frozenset({
    'app.py', 'database.py', 'auth.py', 'admin_settings.py', 'wsgi.py',
})


def _max_package_bytes():
    try:
        from homy.admin_settings import get_upload_limits
        return get_upload_limits()['package']
    except Exception:
        return 15 * 1024 * 1024


def _zip_root_names(zf):
    roots = set()
    for name in zf.namelist():
        if name.endswith('/'):
            name = name[:-1]
        parts = name.split('/')
        if parts and parts[0]:
            roots.add(parts[0])
    return roots


def _find_in_zip(zf, suffix):
    matches = [n for n in zf.namelist() if n.endswith(suffix) and not n.endswith('/')]
    return matches


def _security_scan_zip(zf):
    """Reject archives with suspicious code or protected filenames."""
    import re

    for name in zf.namelist():
        if name.endswith('/'):
            continue
        base = os.path.basename(name).lower()
        if base in FORBIDDEN_FILENAMES:
            return False, f'Unzulässige Datei im Paket: {base}'
        if not name.lower().endswith('.py'):
            continue
        try:
            text = zf.read(name).decode('utf-8', errors='ignore')
        except Exception:
            continue
        for pattern in FORBIDDEN_CODE_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                return False, f'Sicherheitsprüfung fehlgeschlagen ({name}: verbotenes Muster)'
    return True, ''


def _read_zip_text(zf, path):
    try:
        return zf.read(path).decode('utf-8')
    except Exception:
        return None


def validate_package_zip(file_storage, package_type):
    if package_type not in PACKAGE_TYPES:
        return False, f'Unbekannter Paket-Typ: {package_type}', None

    if not file_storage or not file_storage.filename:
        return False, 'Keine Datei ausgewählt', None

    if not file_storage.filename.lower().endswith('.zip'):
        return False, 'Nur .zip Dateien erlaubt', None

    file_storage.stream.seek(0, os.SEEK_END)
    size = file_storage.stream.tell()
    file_storage.stream.seek(0)
    if size <= 0:
        return False, 'Datei ist leer', None
    max_bytes = _max_package_bytes()
    if size > max_bytes:
        return False, f'Paket zu groß (max. {max_bytes // (1024 * 1024)} MB)', None

    try:
        raw = file_storage.read()
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        return False, 'Ungültige ZIP-Datei', None

    names = [n for n in zf.namelist() if not n.endswith('/')]
    if not names:
        return False, 'ZIP ist leer', None

    if any('..' in n or n.startswith('/') for n in zf.namelist()):
        return False, 'ZIP enthält ungültige Pfade', None

    sec_ok, sec_msg = _security_scan_zip(zf)
    if not sec_ok:
        return False, sec_msg, None

    roots = _zip_root_names(zf)
    manifest = None

    if package_type == 'module':
        ok, msg, manifest = _validate_module_zip(zf, roots)
    elif package_type == 'integration':
        ok, msg, manifest = _validate_integration_zip(zf, roots)
    else:
        ok, msg, manifest = _validate_template_zip(zf, roots)

    preview_path = None
    if ok and manifest:
        for candidate in ('preview.png', 'preview.jpg', 'preview.webp', 'thumbnail.png'):
            hits = _find_in_zip(zf, candidate)
            if hits:
                preview_path = hits[0]
                break
        manifest = dict(manifest)
        manifest['preview_in_zip'] = preview_path

    return ok, msg, manifest


def _validate_module_zip(zf, roots):
    info_files = _find_in_zip(zf, 'info.cfg')
    if not info_files:
        return False, 'info.cfg fehlt (Modul-Metadaten)', None

    info_path = info_files[0]
    if info_path.count('/') > 1:
        return False, 'info.cfg muss im Modul-Root liegen (max. eine Unterordner-Ebene)', None

    module_dir = info_path.rsplit('/', 1)[0] if '/' in info_path else ''
    module_name = os.path.basename(module_dir) if module_dir else None

    if module_dir:
        if len(roots) != 1:
            return False, 'Modul-ZIP soll genau einen Top-Level-Ordner enthalten', None
        module_name = list(roots)[0]
    else:
        return False, 'Modul muss in einem Ordner liegen (z.B. my_module/info.cfg)', None

    py_file = f'{module_dir}/{module_name}.py'
    if py_file not in zf.namelist():
        return False, f'{module_name}.py fehlt', None

    cfg = configparser.ConfigParser()
    cfg.read_string(_read_zip_text(zf, info_path) or '')
    if not cfg.has_section('info'):
        return False, 'info.cfg braucht einen [info] Abschnitt', None

    manifest = {
        'type': 'module',
        'module_id': module_name,
        'name': cfg.get('info', 'name', fallback=module_name),
        'version': cfg.get('info', 'version', fallback='1.0.0'),
        'description': cfg.get('info', 'description', fallback=''),
    }
    return True, 'Modul-Format OK', manifest


def _validate_integration_zip(zf, roots):
    info_files = _find_in_zip(zf, 'info.cfg')
    if info_files:
        info_path = info_files[0]
        if info_path.count('/') > 1:
            return False, 'info.cfg muss im Integrations-Root liegen (max. eine Unterordner-Ebene)', None

        integration_dir = info_path.rsplit('/', 1)[0] if '/' in info_path else ''
        if not integration_dir:
            return False, 'Integration muss in einem Ordner liegen (z.B. my_api/info.cfg)', None
        if len(roots) != 1:
            return False, 'Integrations-ZIP soll genau einen Top-Level-Ordner enthalten', None

        folder_name = list(roots)[0]
        py_file = f'{integration_dir}/{folder_name}.py'
        if py_file not in zf.namelist():
            return False, f'{folder_name}.py fehlt', None

        cfg = configparser.ConfigParser()
        cfg.read_string(_read_zip_text(zf, info_path) or '')
        if not cfg.has_section('info'):
            return False, 'info.cfg braucht einen [info] Abschnitt', None

        integration_id = cfg.get('info', 'id', fallback=folder_name).strip() or folder_name
        manifest = {
            'type': 'integration',
            'id': integration_id,
            'folder': folder_name,
            'name': cfg.get('info', 'name', fallback=integration_id),
            'version': cfg.get('info', 'version', fallback='1.0.0'),
            'description': cfg.get('info', 'description', fallback=''),
            'icon': cfg.get('info', 'icon', fallback='plug'),
        }
        return True, 'Integrations-Format OK', manifest

    manifest_files = _find_in_zip(zf, 'manifest.json')
    if not manifest_files:
        return False, 'info.cfg oder manifest.json fehlt', None

    manifest_path = manifest_files[0]
    raw = _read_zip_text(zf, manifest_path)
    if not raw:
        return False, 'manifest.json nicht lesbar', None

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return False, 'manifest.json ist kein gültiges JSON', None

    if data.get('type') != 'integration':
        return False, 'manifest.json: type muss "integration" sein', None
    if not data.get('id'):
        return False, 'manifest.json: id fehlt', None
    if not data.get('name'):
        return False, 'manifest.json: name fehlt', None

    return True, 'Integrations-Format OK (manifest.json)', data


def _validate_template_zip(zf, roots):
    manifest_files = _find_in_zip(zf, 'manifest.json')
    if not manifest_files:
        return False, 'manifest.json fehlt', None

    raw = _read_zip_text(zf, manifest_files[0])
    if not raw:
        return False, 'manifest.json nicht lesbar', None

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return False, 'manifest.json ist kein gültiges JSON', None

    if data.get('type') != 'template':
        return False, 'manifest.json: type muss "template" sein', None
    if not data.get('name'):
        return False, 'manifest.json: name fehlt', None

    return True, 'Template-Format OK', data


def validate_package_zip_on_disk(zip_path, package_type):
    """Re-validate a stored package before install."""
    if package_type not in PACKAGE_TYPES:
        return False, f'Unbekannter Paket-Typ: {package_type}', None
    if not zip_path or not os.path.isfile(zip_path):
        return False, 'Paket-Datei fehlt', None

    size = os.path.getsize(zip_path)
    max_bytes = _max_package_bytes()
    if size <= 0:
        return False, 'Datei ist leer', None
    if size > max_bytes:
        return False, f'Paket zu groß (max. {max_bytes // (1024 * 1024)} MB)', None

    try:
        zf = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile:
        return False, 'Ungültige ZIP-Datei', None

    names = [n for n in zf.namelist() if not n.endswith('/')]
    if not names:
        return False, 'ZIP ist leer', None
    if any('..' in n or n.startswith('/') for n in zf.namelist()):
        return False, 'ZIP enthält ungültige Pfade', None

    sec_ok, sec_msg = _security_scan_zip(zf)
    if not sec_ok:
        return False, sec_msg, None

    roots = _zip_root_names(zf)
    if package_type == 'module':
        return _validate_module_zip(zf, roots)
    if package_type == 'integration':
        return _validate_integration_zip(zf, roots)
    return _validate_template_zip(zf, roots)


def extract_module_package(zip_path, modules_dir):
    """Extract validated module zip into modules_dir. Returns (module_id, error)."""
    ok, msg, _ = validate_package_zip_on_disk(zip_path, 'module')
    if not ok:
        return None, msg

    try:
        zf = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile as e:
        return None, str(e)

    info_files = _find_in_zip(zf, 'info.cfg')
    if not info_files:
        return None, 'info.cfg fehlt'

    info_path = info_files[0]
    module_dir = info_path.rsplit('/', 1)[0]
    module_name = os.path.basename(module_dir)

    target = os.path.join(modules_dir, module_name)
    if os.path.exists(target):
        return None, f'Modul "{module_name}" existiert bereits'

    prefix = module_dir + '/'
    os.makedirs(target, exist_ok=True)
    for member in zf.namelist():
        if not member.startswith(prefix) or member.endswith('/'):
            continue
        rel = member[len(prefix):]
        if not rel or '..' in rel:
            continue
        dest = os.path.join(target, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with zf.open(member) as src, open(dest, 'wb') as out:
            out.write(src.read())

    return module_name, None


def extract_integration_package(zip_path, integrations_dir):
    """Extract validated integration zip into integrations_dir. Returns (integration_id, error)."""
    ok, msg, _ = validate_package_zip_on_disk(zip_path, 'integration')
    if not ok:
        return None, msg

    try:
        zf = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile as e:
        return None, str(e)

    info_files = _find_in_zip(zf, 'info.cfg')
    if not info_files:
        return None, 'info.cfg fehlt'

    info_path = info_files[0]
    integration_dir = info_path.rsplit('/', 1)[0]
    folder_name = os.path.basename(integration_dir)

    cfg = configparser.ConfigParser()
    cfg.read_string(_read_zip_text(zf, info_path) or '')
    integration_id = cfg.get('info', 'id', fallback=folder_name).strip() or folder_name

    target = os.path.join(integrations_dir, folder_name)
    if os.path.exists(target):
        return None, f'Integration "{folder_name}" existiert bereits'

    prefix = integration_dir + '/'
    os.makedirs(target, exist_ok=True)
    for member in zf.namelist():
        if not member.startswith(prefix) or member.endswith('/'):
            continue
        rel = member[len(prefix):]
        if not rel or '..' in rel:
            continue
        dest = os.path.join(target, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with zf.open(member) as src, open(dest, 'wb') as out:
            out.write(src.read())

    return folder_name, None


def extract_preview_from_zip(zip_path, dest_path):
    try:
        zf = zipfile.ZipFile(zip_path)
    except zipfile.BadZipFile:
        return False
    for candidate in ('preview.png', 'preview.jpg', 'preview.webp', 'thumbnail.png'):
        hits = _find_in_zip(zf, candidate)
        if not hits:
            continue
        with zf.open(hits[0]) as src, open(dest_path, 'wb') as out:
            out.write(src.read())
        return True
    return False
