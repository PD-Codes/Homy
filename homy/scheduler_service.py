"""APScheduler integration for background jobs."""

import logging

logger = logging.getLogger(__name__)
_scheduler = None


def init_scheduler(app):
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
    except ImportError:
        logger.warning('APScheduler not installed — background jobs disabled')
        return None

    from homy.jobs import process_pending_jobs

    scheduler = BackgroundScheduler(daemon=True)

    def tick():
        try:
            process_pending_jobs(app, limit=20)
        except Exception as e:
            logger.error('Job processor error: %s', e)

    scheduler.add_job(tick, 'interval', seconds=30, id='homy_job_processor', replace_existing=True)

    def warm():
        try:
            from homy.cache_warmer import warm_widget_caches
            warm_widget_caches(app)
        except Exception as e:
            logger.error('Cache warm-up error: %s', e)

    # Checks every 30 s; the actual interval comes from the cache_warm_interval setting.
    scheduler.add_job(warm, 'interval', seconds=30, id='homy_cache_warmer', replace_existing=True,
                      max_instances=1, coalesce=True)
    scheduler.start()
    _scheduler = scheduler
    logger.info('Background job scheduler started (30s interval)')
    return scheduler


def scheduler_status():
    if _scheduler is None:
        return {'running': False, 'jobs': []}
    return {
        'running': _scheduler.running,
        'jobs': [
            {'id': j.id, 'next_run': str(j.next_run_time) if j.next_run_time else None}
            for j in _scheduler.get_jobs()
        ],
    }
