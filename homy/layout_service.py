"""Layout helpers shared by the classic routes in app.py and the v2 API.

Moved out of app.py so blueprints can use them without importing the app module.
"""
import logging

from flask import session

from homy.database import db, Setting, AuditLog, WidgetInstance

logger = logging.getLogger(__name__)


def log_activity(event_type, message, commit=None):
    """Add an audit log entry to the current session.

    It must never commit the caller's half-finished transaction. When the session
    already carries pending changes (new/dirty/deleted objects), the entry is only
    added and the caller's own commit() persists both atomically. When nothing else
    is pending, the entry is committed right away so it is not lost at teardown.
    Pass commit=True/False to force the behaviour.
    """
    try:
        username = session.get('username')
        log_entry = AuditLog(username=username, event_type=event_type, message=message)
        db.session.add(log_entry)
        if commit is None:
            pending_new = [o for o in db.session.new if o is not log_entry]
            commit = not (pending_new or db.session.dirty or db.session.deleted)
        if commit:
            db.session.commit()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")

def is_layout_locked():
    setting = db.session.get(Setting, 'global_layout_locked')
    return setting and setting.value == 'true'

def check_layout_lock():
    if is_layout_locked() and session.get('role') != 'admin':
        return True
    return False


def layout_context(layout_type):
    """Resolve tabs setting key, widget owner user_id, and dashboard_layout filter."""
    if layout_type == 'public':
        return 'tabs_public', None, 'desktop'
    if layout_type == 'mobile':
        if 'user_id' in session:
            return f'tabs_mobile_user_{session["user_id"]}', session['user_id'], 'mobile'
        return 'tabs_public', None, 'mobile'
    if layout_type == 'guest' or 'user_id' not in session:
        return 'tabs_public', None, 'desktop'
    return f'tabs_user_{session["user_id"]}', session['user_id'], 'desktop'


def widgets_query(user_id, dashboard_layout):
    from sqlalchemy import or_

    q = WidgetInstance.query
    if dashboard_layout == 'desktop':
        q = q.filter(or_(
            WidgetInstance.dashboard_layout == 'desktop',
            WidgetInstance.dashboard_layout.is_(None),
            WidgetInstance.dashboard_layout == '',
        ))
    else:
        q = q.filter_by(dashboard_layout=dashboard_layout)
    if user_id is None:
        return q.filter_by(user_id=None)
    return q.filter_by(user_id=user_id)



