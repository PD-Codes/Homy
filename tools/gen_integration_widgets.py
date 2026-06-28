#!/usr/bin/env python3
"""Generate integration widget files."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'homy' / 'integrations'

COMMON_PY_HEAD = '''"""Integration widget — auto-generated scaffold."""
import logging

from flask import jsonify, request

from homy.cache import cache_key, should_bypass_cache, widget_cache
from homy.integration_widget_util import get_integration_for_widget, get_widget_config
from homy import integration_widget_fetch as iwf

logger = logging.getLogger(__name__)
'''

def py_widget(wtype, name, types, icon, sx, sy, ttl, fetch_call, extra_schema=''):
    types_repr = repr(types)
    schema_extra = extra_schema or ''
    return COMMON_PY_HEAD + f'''
WIDGET = {{
    'type': '{wtype}',
    'name': '{name}',
    'integration_types': {types_repr},
    'default_size_x': {sx},
    'default_size_y': {sy},
    'icon': '{icon}',
    'config_schema': {{
        'integration_id': {{'type': 'text', 'label': 'Integration ID', 'default': ''}},{schema_extra}
    }},
}}

CACHE_NS = '{wtype}'
CACHE_TTL = {ttl}


def register(app):
    @app.route('/api/{wtype}/data', methods=['GET'], endpoint='widget_{wtype}_data')
    def {wtype}_data():
        widget_id = request.args.get('widget_id')
        if not widget_id:
            return jsonify({{'error': 'Bad Request', 'message': 'widget_id required'}}), 400

        wcfg = get_widget_config(widget_id)
        if wcfg is None:
            return jsonify({{'error': 'Not Found'}}), 404

        integration, config, err, code = get_integration_for_widget(widget_id, {types_repr})
        if err:
            return jsonify({{'configured': False, 'online': False, 'message': err}}), code

        ck = cache_key(CACHE_NS, widget_id)
        if not should_bypass_cache():
            cached = widget_cache.get(ck)
            if cached is not None:
                return jsonify(cached)

        try:
            result = {fetch_call}
            result['configured'] = True
            result['online'] = True
            widget_cache.set(ck, result, ttl=CACHE_TTL)
            return jsonify(result)
        except Exception as exc:
            logger.warning('{wtype} failed: %s', exc)
            return jsonify({{'configured': True, 'online': False, 'message': str(exc)}}), 200
'''

def js_widget(wtype, render_body):
    return f'''window.WidgetRegistry.register('{wtype}', {{
    async render(container, widgetData, config) {{
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        try {{
            const data = await API.request(`/api/{wtype}/data?widget_id=${{widgetData.id}}`);
            container.innerHTML = '';
            if (!data.online) {{
                container.innerHTML = `<div class="widget-error text-center" style="padding:12px;">${{data.message || 'Not available'}}</div>`;
                return;
            }}
{render_body}
        }} catch (err) {{
            container.innerHTML = `<div class="widget-error">${{err.message}}</div>`;
        }}
    }},
}});
'''

CSS_COMMON = '''.iw-card { display:flex; flex-direction:column; gap:10px; height:100%; }
.iw-metrics { display:flex; gap:12px; flex-wrap:wrap; }
.iw-metric { display:flex; flex-direction:column; gap:2px; }
.iw-metric .label { font-size:0.72rem; color:var(--text-muted); }
.iw-metric .val { font-size:1.1rem; font-weight:700; }
.iw-list { display:flex; flex-direction:column; gap:6px; overflow-y:auto; max-height:100%; }
.iw-row { padding:6px 8px; border-radius:6px; background:rgba(255,255,255,0.03); border-left:3px solid var(--border-color); font-size:0.8rem; }
.iw-row.up, .iw-row.running { border-left-color: var(--success); }
.iw-row.down, .iw-row.stopped { border-left-color: var(--danger); }
.iw-row-title { font-weight:600; }
.iw-row-meta { font-size:0.72rem; color:var(--text-muted); }
.iw-empty { text-align:center; color:var(--text-muted); padding:16px; font-size:0.85rem; }
'''

SPECS = [
    {
        'folder': 'uptime_kuma', 'subdir': 'status', 'wtype': 'uptime_kuma_status',
        'name': 'Uptime Kuma Status', 'types': ['uptime_kuma'], 'icon': 'activity', 'sx': 8, 'sy': 5, 'ttl': 45,
        'fetch': 'iwf.fetch_uptime_kuma_monitors(config)',
        'schema': "'max_items': {'type': 'select', 'label': 'Max monitors', 'options': ['5','10','15'], 'default': '10'},",
        'js': '''            const m = data.monitors || [];
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics">
                    <div class="iw-metric"><span class="label">UP</span><span class="val text-success">${data.up_count||0}</span></div>
                    <div class="iw-metric"><span class="label">DOWN</span><span class="val text-danger">${data.down_count||0}</span></div>
                    <div class="iw-metric"><span class="label">Total</span><span class="val">${data.monitor_count||0}</span></div>
                </div>
                <div class="iw-list">${m.length ? m.map(x => `<div class="iw-row ${x.status}"><div class="iw-row-title">${x.name}</div><div class="iw-row-meta">${x.status.toUpperCase()}</div></div>`).join('') : '<div class="iw-empty">All monitors up</div>'}</div>
            </div>`;''',
    },
    {
        'folder': 'glances', 'subdir': 'system', 'wtype': 'glances_system',
        'name': 'Glances System', 'types': ['glances'], 'icon': 'cpu', 'sx': 6, 'sy': 4, 'ttl': 30,
        'fetch': 'iwf.fetch_glances_quick(config)',
        'js': '''            container.innerHTML = `<div class="iw-card"><div class="iw-metrics">
                <div class="iw-metric"><span class="label">CPU</span><span class="val">${data.cpu_percent||0}%</span></div>
                <div class="iw-metric"><span class="label">RAM</span><span class="val">${data.mem_percent||0}%</span></div>
                <div class="iw-metric"><span class="label">Disk</span><span class="val">${data.disk_percent!=null?data.disk_percent+'%':'—'}</span></div>
            </div></div>`;''',
    },
    {
        'folder': 'adguard_home', 'subdir': 'status', 'wtype': 'adguard_status',
        'name': 'AdGuard Home Status', 'types': ['adguard_home'], 'icon': 'shield-check', 'sx': 6, 'sy': 4, 'ttl': 30,
        'fetch': 'iwf.fetch_adguard_status(config)',
        'js': '''            const on = data.protection_enabled;
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics">
                    <div class="iw-metric"><span class="label">Schutz</span><span class="val ${on?'text-success':'text-danger'}">${on?'Aktiv':'Aus'}</span></div>
                    <div class="iw-metric"><span class="label">Anfragen</span><span class="val">${(data.dns_queries||0).toLocaleString()}</span></div>
                    <div class="iw-metric"><span class="label">Geblockt</span><span class="val text-danger">${(data.blocked_filtering||0).toLocaleString()} (${data.blocked_percentage||0}%)</span></div>
                </div></div>`;''',
    },
    {
        'folder': 'sonarr', 'subdir': 'queue', 'wtype': 'arr_queue',
        'name': '*arr Queue', 'types': ['sonarr', 'radarr', 'lidarr', 'readarr'], 'icon': 'list-ordered', 'sx': 8, 'sy': 5, 'ttl': 45,
        'fetch': 'iwf.fetch_arr_queue_list(integration, config, wcfg.get("max_items", 10))',
        'schema': "'max_items': {'type': 'select', 'label': 'Max items', 'options': ['5','10','15'], 'default': '10'},",
        'js': '''            const items = data.items || [];
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics"><div class="iw-metric"><span class="label">${data.app_name||'Queue'}</span><span class="val">${data.queue_count||0} / ${data.queue_total||0}</span></div></div>
                <div class="iw-list">${items.length ? items.map(i => `<div class="iw-row"><div class="iw-row-title">${i.title}</div><div class="iw-row-meta">${i.status} · ${i.progress}%</div></div>`).join('') : '<div class="iw-empty">Queue empty</div>'}</div>
            </div>`;''',
    },
    {
        'folder': 'sabnzbd', 'subdir': 'queue', 'wtype': 'sabnzbd_queue',
        'name': 'SABnzbd Queue', 'types': ['sabnzbd'], 'icon': 'download', 'sx': 8, 'sy': 5, 'ttl': 30,
        'fetch': 'iwf.fetch_sabnzbd_queue(config, wcfg.get("max_items", 8))',
        'schema': "'max_items': {'type': 'select', 'label': 'Max items', 'options': ['5','8','12'], 'default': '8'},",
        'js': '''            const items = data.items || [];
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics"><div class="iw-metric"><span class="label">Queue</span><span class="val">${data.queue_size||0}</span></div>
                <div class="iw-metric"><span class="label">Speed</span><span class="val">${data.speed||'—'}</span></div></div>
                <div class="iw-list">${items.length ? items.map(i => `<div class="iw-row"><div class="iw-row-title">${i.title}</div><div class="iw-row-meta">${i.percentage}% · ${i.status}</div></div>`).join('') : '<div class="iw-empty">Queue empty</div>'}</div>
            </div>`;''',
    },
    {
        'folder': 'qbittorrent', 'subdir': 'status', 'wtype': 'torrent_status',
        'name': 'Torrent Status', 'types': ['qbittorrent', 'transmission'], 'icon': 'download-cloud', 'sx': 8, 'sy': 5, 'ttl': 20,
        'fetch': 'iwf.fetch_torrent_status(integration.type, config)',
        'js': '''            const fmt = (n) => { n=+n||0; if(n>=1048576)return(n/1048576).toFixed(1)+' MB/s'; if(n>=1024)return(n/1024).toFixed(1)+' KB/s'; return n+' B/s'; };
            const t = data.torrents || [];
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics"><div class="iw-metric"><span class="label">${data.client}</span><span class="val">↓ ${fmt(data.dl_speed)}</span></div>
                <div class="iw-metric"><span class="label">Upload</span><span class="val">↑ ${fmt(data.up_speed)}</span></div></div>
                <div class="iw-list">${t.length ? t.map(x => `<div class="iw-row"><div class="iw-row-title">${x.name}</div><div class="iw-row-meta">${x.progress}%</div></div>`).join('') : '<div class="iw-empty">No active downloads</div>'}</div>
            </div>`;''',
    },
    {
        'folder': 'jellyfin', 'subdir': 'streams', 'wtype': 'media_streams',
        'name': 'Media Streams', 'types': ['jellyfin', 'emby'], 'icon': 'play-circle', 'sx': 8, 'sy': 5, 'ttl': 20,
        'fetch': 'iwf.fetch_media_sessions(integration.type, config)',
        'js': '''            const s = data.sessions || [];
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics"><div class="iw-metric"><span class="label">Streams</span><span class="val">${data.active_sessions||0}</span></div>
                <div class="iw-metric"><span class="label">Filme</span><span class="val">${data.total_movies||0}</span></div>
                <div class="iw-metric"><span class="label">Serien</span><span class="val">${data.total_series||0}</span></div></div>
                <div class="iw-list">${s.length ? s.map(x => `<div class="iw-row"><div class="iw-row-title">${x.title}</div><div class="iw-row-meta">${x.user} · ${x.progress}%</div></div>`).join('') : '<div class="iw-empty">No active streams</div>'}</div>
            </div>`;''',
    },
    {
        'folder': 'tautulli', 'subdir': 'streams', 'wtype': 'tautulli_streams',
        'name': 'Tautulli Streams', 'types': ['tautulli'], 'icon': 'bar-chart-2', 'sx': 8, 'sy': 5, 'ttl': 20,
        'fetch': 'iwf.fetch_tautulli_streams(config)',
        'js': '''            const s = data.streams || [];
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics"><div class="iw-metric"><span class="label">Streams</span><span class="val">${data.stream_count||0}</span></div>
                <div class="iw-metric"><span class="label">Transcodes</span><span class="val">${data.transcodes||0}</span></div></div>
                <div class="iw-list">${s.length ? s.map(x => `<div class="iw-row"><div class="iw-row-title">${x.title}</div><div class="iw-row-meta">${x.user}${x.transcode?' · transcode':''}</div></div>`).join('') : '<div class="iw-empty">No streams</div>'}</div>
            </div>`;''',
    },
    {
        'folder': 'plex', 'subdir': 'status', 'wtype': 'plex_status',
        'name': 'Plex Status', 'types': ['plex'], 'icon': 'play', 'sx': 8, 'sy': 5, 'ttl': 20,
        'fetch': 'iwf.fetch_plex_status(config)',
        'js': '''            const s = data.streams || [];
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics"><div class="iw-metric"><span class="label">Streams</span><span class="val">${data.active_streams||0}</span></div>
                <div class="iw-metric"><span class="label">Libraries</span><span class="val">${data.library_count||0}</span></div></div>
                <div class="iw-list">${s.length ? s.map(x => `<div class="iw-row"><div class="iw-row-title">${x.title}</div><div class="iw-row-meta">${x.user}</div></div>`).join('') : '<div class="iw-empty">No active streams</div>'}</div>
            </div>`;''',
    },
    {
        'folder': 'overseerr', 'subdir': 'requests', 'wtype': 'overseerr_requests',
        'name': 'Overseerr Requests', 'types': ['overseerr'], 'icon': 'clapperboard', 'sx': 8, 'sy': 5, 'ttl': 60,
        'fetch': 'iwf.fetch_overseerr_requests(config, wcfg.get("max_items", 8))',
        'schema': "'max_items': {'type': 'select', 'label': 'Max requests', 'options': ['5','8','12'], 'default': '8'},",
        'js': '''            const r = data.requests || [];
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics"><div class="iw-metric"><span class="label">Pending</span><span class="val">${data.pending||0}</span></div>
                <div class="iw-metric"><span class="label">Approved</span><span class="val">${data.approved||0}</span></div></div>
                <div class="iw-list">${r.length ? r.map(x => `<div class="iw-row"><div class="iw-row-title">${x.title}</div><div class="iw-row-meta">${x.status} · ${x.type}</div></div>`).join('') : '<div class="iw-empty">No recent requests</div>'}</div>
            </div>`;''',
    },
    {
        'folder': 'rss', 'subdir': 'feed', 'wtype': 'rss_feed',
        'name': 'RSS Feed', 'types': ['rss'], 'icon': 'rss', 'sx': 8, 'sy': 6, 'ttl': 300,
        'fetch': 'iwf.fetch_rss_feed(config, wcfg.get("max_items", 8))',
        'schema': "'max_items': {'type': 'select', 'label': 'Max items', 'options': ['5','8','12'], 'default': '8'},",
        'js': '''            const items = data.items || [];
            container.innerHTML = `<div class="iw-card iw-list">${items.length ? items.map(i => `<a class="iw-row" href="${i.link||'#'}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit"><div class="iw-row-title">${i.title}</div><div class="iw-row-meta">${i.feed||''} · ${i.published||''}</div></a>`).join('') : '<div class="iw-empty">No feed items</div>'}</div>`;''',
    },
    {
        'folder': 'portainer', 'subdir': 'containers', 'wtype': 'portainer_containers',
        'name': 'Portainer Containers', 'types': ['portainer'], 'icon': 'container', 'sx': 8, 'sy': 6, 'ttl': 30,
        'fetch': 'iwf.fetch_portainer_containers(config, wcfg.get("max_items", 12))',
        'schema': "'max_items': {'type': 'select', 'label': 'Max containers', 'options': ['8','12','20'], 'default': '12'},",
        'js': '''            const c = data.containers || [];
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics"><div class="iw-metric"><span class="label">Running</span><span class="val text-success">${data.running_count||0}</span></div>
                <div class="iw-metric"><span class="label">Shown</span><span class="val">${data.container_count||0}</span></div></div>
                <div class="iw-list">${c.length ? c.map(x => `<div class="iw-row ${x.state}"><div class="iw-row-title">${x.name}</div><div class="iw-row-meta">${x.state} · ${x.endpoint}</div></div>`).join('') : '<div class="iw-empty">No containers</div>'}</div>
            </div>`;''',
    },
    {
        'folder': 'prowlarr', 'subdir': 'indexers', 'wtype': 'prowlarr_indexers',
        'name': 'Prowlarr Indexers', 'types': ['prowlarr'], 'icon': 'radar', 'sx': 6, 'sy': 5, 'ttl': 60,
        'fetch': 'iwf.fetch_prowlarr_indexers(config)',
        'js': '''            const idx = data.indexers || [];
            container.innerHTML = `<div class="iw-card">
                <div class="iw-metrics"><div class="iw-metric"><span class="label">Aktiv</span><span class="val">${data.indexers_enabled||0}/${data.indexers_total||0}</span></div></div>
                <div class="iw-list">${idx.map(x => `<div class="iw-row ${x.enabled?'up':'down'}"><div class="iw-row-title">${x.name}</div><div class="iw-row-meta">${x.enabled?'enabled':'disabled'} · ${x.protocol}</div></div>`).join('')}</div>
            </div>`;''',
    },
    {
        'folder': 'bazarr', 'subdir': 'missing', 'wtype': 'bazarr_missing',
        'name': 'Bazarr Subtitles', 'types': ['bazarr'], 'icon': 'subtitles', 'sx': 6, 'sy': 4, 'ttl': 120,
        'fetch': 'iwf.fetch_bazarr_missing(config)',
        'js': '''            container.innerHTML = `<div class="iw-card"><div class="iw-metrics">
                <div class="iw-metric"><span class="label">Filme fehlend</span><span class="val text-warning">${data.missing_movies||0}</span></div>
                <div class="iw-metric"><span class="label">Episoden fehlend</span><span class="val text-warning">${data.missing_episodes||0}</span></div>
                <div class="iw-metric"><span class="label">Bibliothek</span><span class="val">${data.movies||0} / ${data.episodes||0}</span></div>
            </div></div>`;''',
    },
    {
        'folder': 'immich', 'subdir': 'stats', 'wtype': 'immich_stats',
        'name': 'Immich Library', 'types': ['immich'], 'icon': 'image', 'sx': 6, 'sy': 4, 'ttl': 300,
        'fetch': 'iwf.fetch_immich_stats(config)',
        'js': '''            container.innerHTML = `<div class="iw-card"><div class="iw-metrics">
                <div class="iw-metric"><span class="label">Fotos</span><span class="val">${(data.photos||0).toLocaleString()}</span></div>
                <div class="iw-metric"><span class="label">Videos</span><span class="val">${(data.videos||0).toLocaleString()}</span></div>
                <div class="iw-metric"><span class="label">Speicher</span><span class="val">${data.usage_gb||0} GB</span></div>
            </div></div>`;''',
    },
]

for spec in SPECS:
    base = ROOT / spec['folder'] / 'widgets' / spec['subdir']
    base.mkdir(parents=True, exist_ok=True)
    py_name = spec['subdir'] + '.py'
    schema = spec.get('schema', '')
    if schema:
        schema = '\n        ' + schema
    (base / py_name).write_text(
        py_widget(spec['wtype'], spec['name'], spec['types'], spec['icon'], spec['sx'], spec['sy'], spec['ttl'], spec['fetch'], schema),
        encoding='utf-8',
    )
    (base / (spec['subdir'] + '.js')).write_text(js_widget(spec['wtype'], spec['js']), encoding='utf-8')
    (base / (spec['subdir'] + '.css')).write_text(CSS_COMMON, encoding='utf-8')
    types_s = ', '.join(spec['types'])
    (base / 'widget.cfg').write_text(
        f"[widget]\n"
        f"type = {spec['wtype']}\n"
        f"name = {spec['name']}\n"
        f"integration_types = {types_s}\n"
        f"icon = {spec['icon']}\n"
        f"default_size_x = {spec['sx']}\n"
        f"default_size_y = {spec['sy']}\n",
        encoding='utf-8',
    )
    print('OK', spec['wtype'])

print('Done:', len(SPECS), 'widgets')
