"""CLI admin utilities (password reset without starting the server)."""

from __future__ import annotations

import getpass
import sys

from homy.admin_settings import validate_password


def reset_password_interactive(username: str) -> int:
    """Reset a local user's password and exit."""
    from homy.app import app
    from homy.database import User, db
    from werkzeug.security import generate_password_hash

    username = (username or '').strip()
    if not username:
        print('Error: username required.', file=sys.stderr)
        return 1

    with app.app_context():
        user = User.query.filter_by(username=username).first()
        if not user:
            print(f'Error: user "{username}" not found.', file=sys.stderr)
            return 1
        if (user.auth_provider or 'local') != 'local':
            print('Error: only local accounts can be reset via CLI.', file=sys.stderr)
            return 1

        print(f'New password for user "{username}":', end=' ', flush=True)
        try:
            pwd1 = getpass.getpass('')
            pwd2 = getpass.getpass('Confirm password: ')
        except (KeyboardInterrupt, EOFError):
            print('\nAborted.', file=sys.stderr)
            return 130

        if pwd1 != pwd2:
            print('Error: passwords do not match.', file=sys.stderr)
            return 1

        err = validate_password(pwd1)
        if err:
            print(f'Error: {err}', file=sys.stderr)
            return 1

        user.password_hash = generate_password_hash(pwd1)
        db.session.commit()
        print(f'Password updated for "{username}". Start Homy normally to log in.')
        return 0
