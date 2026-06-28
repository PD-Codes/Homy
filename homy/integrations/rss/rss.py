"""RSS / Atom integration for widget builder."""

import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

import requests

INTEGRATION_TYPE = {
    'name': 'RSS / Atom',
    'icon': 'rss',
    'fields': {
        'feed_urls': {
            'type': 'textarea',
            'label': 'Feed URLs (one per line)',
            'default': '',
        },
        'max_items': {
            'type': 'select',
            'label': 'Max items per feed',
            'options': ['5', '10', '15'],
            'default': '10',
        },
    },
    'metrics': [
        {'path': 'items', 'label': 'Feed items'},
        {'path': 'feed_count', 'label': 'Feeds loaded'},
    ],
}


def _strip_ns(tag):
    return tag.split('}')[-1] if '}' in tag else tag


def _first_text(parent, names):
    for name in names:
        el = parent.find(name) or parent.find(f'{{*}}{name}')
        if el is not None and (el.text or '').strip():
            return el.text.strip()
    return ''


def _parse_feed(url, max_items):
    res = requests.get(
        url,
        timeout=12,
        headers={'User-Agent': 'Homy/1.0'},
    )
    res.raise_for_status()
    root = ET.fromstring(res.content)
    tag = _strip_ns(root.tag).lower()
    items = []
    feed_title = url

    if tag == 'rss':
        channel = root.find('channel') or root
        feed_title = _first_text(channel, ['title']) or feed_title
        for item in channel.findall('item')[:max_items]:
            items.append({
                'feed': feed_title,
                'title': _first_text(item, ['title']),
                'link': _first_text(item, ['link']),
                'published': _first_text(item, ['pubDate']),
            })
    elif tag == 'feed':
        feed_title = _first_text(root, ['title']) or feed_title
        for entry in root.findall('{*}entry')[:max_items]:
            link = ''
            for link_el in entry.findall('{*}link'):
                if link_el.attrib.get('href'):
                    link = link_el.attrib['href']
                    break
            items.append({
                'feed': feed_title,
                'title': _first_text(entry, ['title']),
                'link': link,
                'published': _first_text(entry, ['updated', 'published']),
            })
    else:
        raise ValueError(f'Unsupported feed: {tag}')
    return feed_title, items


def fetch_payload(config):
    raw = (config.get('feed_urls') or '').strip()
    urls = [u.strip() for u in raw.splitlines() if u.strip()]
    if not urls:
        raise ValueError('At least one feed URL is required')

    max_items = int(config.get('max_items', 10) or 10)
    all_items = []
    loaded = 0
    for url in urls:
        try:
            title, items = _parse_feed(url, max_items)
            loaded += 1
            all_items.extend(items)
        except Exception as exc:
            all_items.append({
                'feed': url,
                'title': f'Error: {exc}',
                'link': '',
                'published': '',
            })

    return {
        'feed_count': loaded,
        'items': all_items[: max_items * max(loaded, 1)],
    }
