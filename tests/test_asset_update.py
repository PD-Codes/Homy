"""Tests for asset update."""

import io
import os
import tempfile

import pytest

from homy.app import app
from homy.database import db, User
from homy.asset_service import save_asset, update_asset, delete_asset
from werkzeug.security import generate_password_hash


class FakeFile:
    def __init__(self, filename, content, mimetype=None):
        self.filename = filename
        self.stream = io.BytesIO(content if isinstance(content, bytes) else content.encode())
        self.mimetype = mimetype

    def save(self, path):
        with open(path, 'wb') as f:
            self.stream.seek(0)
            f.write(self.stream.read())


@pytest.fixture
def asset_app(tmp_path):
    os.environ['DATA_DIR'] = str(tmp_path)
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    with app.app_context():
        db.create_all()
        user = User(username='u1', password_hash=generate_password_hash('x'), role='user')
        db.session.add(user)
        db.session.commit()
        session = {'user_id': user.id, 'role': 'user', 'username': 'u1'}
        yield app, session
        db.session.remove()
        db.drop_all()


def test_update_asset_rename(asset_app):
    _, session = asset_app
    with app.app_context():
        f = FakeFile('icon.png', b'\x89PNG\r\n\x1a\n' + b'0' * 50, 'image/png')
        asset, err, code = save_asset(f, session, 'icon', is_global=False)
        assert err is None

        updated, err, code = update_asset(asset.id, session, {'original_name': 'Mein Icon'})
        assert err is None
        assert updated.original_name == 'Mein Icon'

        delete_asset(asset.id, session)
