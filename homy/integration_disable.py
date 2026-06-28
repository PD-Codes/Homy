"""Persist which integration plugins are disabled by the admin."""


def get_disabled_integration_ids():
    from homy.database import Setting

    try:
        rows = Setting.query.filter(
            Setting.key.like('integration_disabled_%'),
            Setting.value == 'true',
        ).all()
        return [r.key[len('integration_disabled_'):] for r in rows]
    except Exception:
        return []


def is_integration_enabled(integration_id):
    return integration_id not in get_disabled_integration_ids()


def set_integration_enabled(integration_id, enabled):
    from homy.database import db, Setting

    key = f'integration_disabled_{integration_id}'
    row = Setting.query.get(key)
    val = 'false' if enabled else 'true'
    if row:
        row.value = val
    else:
        db.session.add(Setting(key=key, value=val))
    db.session.commit()
