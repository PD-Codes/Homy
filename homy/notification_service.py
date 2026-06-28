"""Send notifications via SMTP and webhooks."""

import json
import logging
import smtplib
from email.mime.text import MIMEText

import requests

from homy.admin_settings import (
    SMTP_FROM,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_TLS,
    SMTP_USER,
    get_setting_raw,
    get_user_notifications,
)

logger = logging.getLogger(__name__)


def _smtp_settings():
    return {
        'host': (get_setting_raw(SMTP_HOST, '') or '').strip(),
        'port': int(get_setting_raw(SMTP_PORT, '587') or 587),
        'user': (get_setting_raw(SMTP_USER, '') or '').strip(),
        'password': get_setting_raw(SMTP_PASSWORD, '') or '',
        'from_addr': (get_setting_raw(SMTP_FROM, '') or '').strip(),
        'tls': str(get_setting_raw(SMTP_TLS, 'true')).lower() in ('1', 'true', 'yes'),
    }


def send_smtp(to_addr, subject, body, html=False):
    cfg = _smtp_settings()
    if not cfg['host'] or not to_addr:
        return False, 'SMTP nicht konfiguriert oder Empfänger fehlt'
    msg = MIMEText(body, 'html' if html else 'plain', 'utf-8')
    msg['Subject'] = subject
    msg['From'] = cfg['from_addr'] or cfg['user'] or 'dashboard@localhost'
    msg['To'] = to_addr
    try:
        if cfg['tls']:
            server = smtplib.SMTP(cfg['host'], cfg['port'], timeout=15)
            server.starttls()
        else:
            server = smtplib.SMTP(cfg['host'], cfg['port'], timeout=15)
        if cfg['user']:
            server.login(cfg['user'], cfg['password'])
        server.send_message(msg)
        server.quit()
        return True, 'E-Mail gesendet'
    except Exception as e:
        logger.warning('SMTP send failed: %s', e)
        return False, str(e)


def send_discord(webhook_url, content, username='Homy'):
    if not webhook_url:
        return False, 'Webhook-URL fehlt'
    r = requests.post(webhook_url, json={'content': content, 'username': username}, timeout=15)
    if r.status_code in (200, 204):
        return True, 'Discord gesendet'
    return False, f'HTTP {r.status_code}'


def send_teams(webhook_url, text):
    if not webhook_url:
        return False, 'Webhook-URL fehlt'
    r = requests.post(webhook_url, json={'text': text}, timeout=15)
    if r.status_code in (200, 202):
        return True, 'Teams gesendet'
    return False, f'HTTP {r.status_code}'


def send_telegram(token_chat, text):
    """token_chat format: bot_token|chat_id or full API URL."""
    if not token_chat:
        return False, 'Telegram-Konfiguration fehlt'
    if token_chat.startswith('http'):
        url = token_chat
        payload = {'text': text}
    else:
        parts = token_chat.split('|')
        if len(parts) < 2:
            return False, 'Format: bot_token|chat_id'
        token, chat_id = parts[0].strip(), parts[1].strip()
        url = f'https://api.telegram.org/bot{token}/sendMessage'
        payload = {'chat_id': chat_id, 'text': text}
    r = requests.post(url, json=payload, timeout=15)
    data = r.json() if r.headers.get('content-type', '').startswith('application/json') else {}
    if r.status_code == 200 and data.get('ok', True):
        return True, 'Telegram gesendet'
    return False, data.get('description', f'HTTP {r.status_code}')


def send_ntfy(url, message, title='Homy'):
    if not url:
        return False, 'ntfy-URL fehlt'
    topic_url = url.rstrip('/')
    if not topic_url.startswith('http'):
        topic_url = f'https://ntfy.sh/{topic_url}'
    r = requests.post(topic_url, data=message.encode('utf-8'), headers={'Title': title}, timeout=15)
    if r.status_code == 200:
        return True, 'ntfy gesendet'
    return False, f'HTTP {r.status_code}'


def send_pushover(user_key, message, title='Homy', api_token=None):
    """user_key may be user_key|api_token."""
    if not user_key:
        return False, 'Pushover-Key fehlt'
    token = api_token
    user = user_key
    if '|' in user_key:
        user, token = [p.strip() for p in user_key.split('|', 1)]
    token = token or ''
    if not token:
        return False, 'Pushover API-Token fehlt (user_key|api_token)'
    r = requests.post(
        'https://api.pushover.net/1/messages.json',
        data={'token': token, 'user': user, 'message': message, 'title': title},
        timeout=15,
    )
    data = r.json() if r.content else {}
    if r.status_code == 200 and data.get('status') == 1:
        return True, 'Pushover gesendet'
    return False, data.get('errors', [f'HTTP {r.status_code}'])[0] if isinstance(data.get('errors'), list) else str(data)


def send_to_channel(channel, config, subject, message):
    ch = channel.lower()
    if ch == 'smtp':
        to_addr = config.get('to') or config.get('url') or config.get('email')
        return send_smtp(to_addr, subject, message)
    if ch == 'discord':
        return send_discord(config.get('url', ''), message)
    if ch == 'teams':
        return send_teams(config.get('url', ''), message)
    if ch == 'telegram':
        return send_telegram(config.get('url', ''), message)
    if ch == 'ntfy':
        return send_ntfy(config.get('url', ''), message, title=subject)
    if ch == 'pushover':
        return send_pushover(config.get('url', ''), message, title=subject)
    return False, f'Unbekannter Kanal: {channel}'


def notify_user(user_id, subject, message):
    """Send to all enabled user notification channels."""
    channels = get_user_notifications(user_id)
    results = []
    for name, cfg in channels.items():
        if not cfg:
            continue
        if isinstance(cfg, dict) and cfg.get('enabled') is False:
            continue
        payload = cfg if isinstance(cfg, dict) else {'url': str(cfg)}
        if name != 'smtp' and not payload.get('url') and not payload.get('to'):
            continue
        ok, detail = send_to_channel(name, payload, subject, message)
        results.append({'channel': name, 'ok': ok, 'detail': detail})
    return results


def send_test_notification(user_id, channel, config):
    return send_to_channel(
        channel,
        config,
        'Homy Test',
        'Dies ist eine Test-Benachrichtigung vom Homy.',
    )
