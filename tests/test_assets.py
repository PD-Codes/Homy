"""Tests for asset upload and package validation."""

import io
import json
import zipfile
import pytest

from homy.package_validator import validate_package_zip, _validate_module_zip
from homy.asset_service import validate_asset_file, get_asset_categories


class FakeFile:
    def __init__(self, filename, content, mimetype=None):
        self.filename = filename
        self.stream = io.BytesIO(content if isinstance(content, bytes) else content.encode())
        self.mimetype = mimetype

    def read(self):
        self.stream.seek(0)
        return self.stream.read()


def _module_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as zf:
        zf.writestr('example-module/info.cfg', '[info]\nname = Test\nversion = 1.0.0\n')
        zf.writestr('example-module/example-module.py', 'WIDGETS = []\n')
    buf.seek(0)
    return buf.getvalue()


def test_validate_module_zip_ok():
    raw = _module_zip()
    zf = zipfile.ZipFile(io.BytesIO(raw))
    ok, msg, manifest = _validate_module_zip(zf, {'example-module'})
    assert ok is True
    assert manifest['module_id'] == 'example-module'


def test_validate_package_zip_module():
    f = FakeFile('mod.zip', _module_zip(), 'application/zip')
    ok, msg, manifest = validate_package_zip(f, 'module')
    assert ok is True
    assert manifest['type'] == 'module'


def test_validate_template_zip():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, 'w') as zf:
        zf.writestr('manifest.json', json.dumps({'type': 'template', 'name': 'T'}))
        zf.writestr('preview.png', b'fake')
    f = FakeFile('t.zip', buf.getvalue(), 'application/zip')
    ok, msg, manifest = validate_package_zip(f, 'template')
    assert ok is True
    assert manifest['preview_in_zip'] == 'preview.png'


def test_validate_asset_png():
    f = FakeFile('icon.png', b'\x89PNG\r\n\x1a\n' + b'0' * 100, 'image/png')
    ok, msg = validate_asset_file(f, 'icon')
    assert ok is True
