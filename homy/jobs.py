"""Background job queue."""

import json
import logging
from datetime import datetime, timezone

from homy.database import db, BackgroundJob

logger = logging.getLogger(__name__)


def enqueue_job(job_type, payload=None, priority=0, scheduled_at=None):
    job = BackgroundJob(
        job_type=job_type,
        payload_json=json.dumps(payload or {}),
        status='pending',
        priority=priority,
        scheduled_at=scheduled_at,
    )
    db.session.add(job)
    db.session.commit()
    return job


def process_pending_jobs(app, limit=10):
    with app.app_context():
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        query = BackgroundJob.query.filter_by(status='pending').order_by(
            BackgroundJob.priority.desc(),
            BackgroundJob.id.asc(),
        )
        jobs = query.limit(limit).all()
        for job in jobs:
            if job.scheduled_at and job.scheduled_at > now:
                continue
            _run_job(job, app)


def _run_job(job, app):
    job.status = 'running'
    job.started_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.session.commit()
    try:
        payload = job._parse_payload()
        if job.job_type == 'clear_widget_cache':
            from homy.cache import widget_cache
            widget_cache.clear()
        elif job.job_type == 'send_notification':
            from homy.notification_service import notify_user
            uid = payload.get('user_id')
            if uid:
                notify_user(uid, payload.get('subject', 'Homy'), payload.get('message', ''))
        elif job.job_type == 'full_backup':
            from homy.backup_service import create_full_backup
            create_full_backup()
        else:
            raise ValueError(f'Unbekannter Job-Typ: {job.job_type}')
        job.status = 'done'
        job.error_message = None
    except Exception as e:
        logger.exception('Job %s failed', job.id)
        job.status = 'failed'
        job.error_message = str(e)[:500]
    job.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.session.commit()
