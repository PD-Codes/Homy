/**
 * Build the new-tab UI from Homy sync JSON.
 * Extension-specific layout — does not replicate Homy grid (col/row/size ignored).
 */

import { t } from './i18n.js';

/** @typedef {{ id: string, name?: string }} HomyTab */
/** @typedef {{ id: string, title?: string, type: string, module?: string, tab_id?: string, config?: object }} HomyWidget */
/** @typedef {{ title: string, url: string, category?: string, icon_type?: string, icon_value?: string }} HomyFavorite */
/** @typedef {{ tabs?: HomyTab[], widgets?: HomyWidget[], favorites?: HomyFavorite[], exported_at?: string }} SyncPayload */

const SKIP_TYPES = new Set(['spacer']);

/** Options passed into the most recent render (used for favicon base URL). */
let _opts = {};

/** Page-lifetime state that must survive repeated renders. */
let _typeAheadBound = false;
let _didAutoFocus = false;
/** Clock intervals from the previous render, cleared before each repaint. */
let _clockTimers = [];

/**
 * @param {SyncPayload} payload
 */
export function buildViewModel(payload) {
    const tabs = payload.tabs?.length
        ? [...payload.tabs]
        : [{ id: 'default', name: 'Main' }];
    const favorites = [...(payload.favorites || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const widgetsByTab = new Map(tabs.map((tab) => [tab.id, []]));

    for (const w of payload.widgets || []) {
        if (SKIP_TYPES.has(w.type)) continue;
        const tid = w.tab_id || tabs[0]?.id || 'default';
        if (!widgetsByTab.has(tid)) widgetsByTab.set(tid, []);
        widgetsByTab.get(tid).push(w);
    }

    for (const list of widgetsByTab.values()) {
        list.sort((a, b) => (a.row ?? 0) - (b.row ?? 0) || (a.col ?? 0) - (b.col ?? 0));
    }

    return { tabs, widgetsByTab, favorites };
}

/**
 * @param {HTMLElement} root
 * @param {SyncPayload} payload
 * @param {{ locale?: string, mode?: string, baseUrl?: string, offline?: boolean,
 *          savedAt?: string|null, live?: object|null, showSearch?: boolean }} opts
 */
export function renderNewTabPage(root, payload, opts = {}) {
    const locale = opts.locale || 'de-DE';
    const mode = opts.mode || 'cached';
    _opts = opts;
    const vm = buildViewModel(payload);

    // Drop timers from the previous render before the DOM they write into is thrown
    // away, otherwise every repaint adds another 1 Hz writer on a detached node.
    _clockTimers.forEach(clearInterval);
    _clockTimers = [];

    root.innerHTML = '';
    root.className = 'nt-root';

    const header = document.createElement('header');
    header.className = 'nt-header';
    header.innerHTML = `
        <div class="nt-brand">
            <span class="nt-logo">H</span>
            <span class="nt-title">Homy</span>
        </div>
        <div class="nt-header-actions"></div>
    `;
    const actions = header.querySelector('.nt-header-actions');
    if (opts.offline) {
        const badge = document.createElement('span');
        badge.className = 'nt-badge nt-badge-offline';
        badge.textContent = t('newtab_offline_badge', locale);
        actions.appendChild(badge);
    }
    if (opts.savedAt || payload.exported_at) {
        const ts = opts.savedAt || payload.exported_at;
        const hint = document.createElement('span');
        hint.className = 'nt-muted nt-saved';
        hint.textContent = `${t('newtab_offline_hint', locale)} ${formatTs(ts, locale)}`;
        actions.appendChild(hint);
    }
    if (opts.baseUrl) {
        const open = document.createElement('a');
        open.className = 'nt-btn nt-btn-ghost';
        open.href = `${opts.baseUrl}/#dashboard`;
        open.textContent = t('open_homy', locale);
        actions.appendChild(open);
    }
    root.appendChild(header);

    if (opts.showSearch !== false) {
        root.appendChild(renderSearchBar(locale));
    }

    if (mode === 'favorites') {
        root.appendChild(renderFavoritesSection(vm.favorites, locale, t('newtab_all_favorites', locale)));
        bindSettingsButton(root, locale);
        bindSearchFiltering(root, locale);
        return;
    }

    const main = document.createElement('main');
    main.className = 'nt-main';

    if (vm.tabs.length > 1) {
        const tabBar = document.createElement('nav');
        tabBar.className = 'nt-tabs';
        tabBar.setAttribute('role', 'tablist');
        vm.tabs.forEach((tab, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `nt-tab${idx === 0 ? ' is-active' : ''}`;
            btn.dataset.tabId = tab.id;
            btn.textContent = tab.name || tab.id;
            btn.setAttribute('role', 'tab');
            tabBar.appendChild(btn);
        });
        main.appendChild(tabBar);

        vm.tabs.forEach((tab, idx) => {
            const panel = document.createElement('section');
            panel.className = `nt-panel${idx === 0 ? ' is-active' : ''}`;
            panel.dataset.tabId = tab.id;
            panel.setAttribute('role', 'tabpanel');
            fillTabPanel(panel, tab, vm.widgetsByTab.get(tab.id) || [], vm.favorites, locale);
            main.appendChild(panel);
        });

        tabBar.addEventListener('click', (e) => {
            const btn = e.target.closest('.nt-tab');
            if (!btn) return;
            const id = btn.dataset.tabId;
            tabBar.querySelectorAll('.nt-tab').forEach((b) => b.classList.toggle('is-active', b === btn));
            main.querySelectorAll('.nt-panel').forEach((p) => {
                p.classList.toggle('is-active', p.dataset.tabId === id);
            });
        });
    } else {
        const tab = vm.tabs[0];
        const panel = document.createElement('section');
        panel.className = 'nt-panel is-active';
        fillTabPanel(panel, tab, vm.widgetsByTab.get(tab.id) || [], vm.favorites, locale);
        main.appendChild(panel);
    }

    root.appendChild(main);
    bindSettingsButton(root, locale);
    bindSearchFiltering(root, locale);
}

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Search bar wired to the browser's own default search engine.
 * Typing filters the links already on the page; Enter hands the query to whatever
 * search provider the browser is configured with.
 */
function renderSearchBar(locale) {
    const wrap = document.createElement('div');
    wrap.className = 'nt-search';

    const form = document.createElement('form');
    form.className = 'nt-search-form';
    form.setAttribute('role', 'search');

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'nt-search-input';
    input.id = 'nt-search-input';
    input.placeholder = t('newtab_search_placeholder', locale);
    input.setAttribute('aria-label', t('newtab_search_placeholder', locale));
    input.autocomplete = 'off';
    input.spellcheck = false;

    const hint = document.createElement('span');
    hint.className = 'nt-search-hint nt-muted';
    hint.textContent = t('newtab_search_hint', locale);

    form.appendChild(input);
    form.appendChild(hint);
    wrap.appendChild(form);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = input.value.trim();
        if (!query) return;

        // If exactly one link is still visible, treat Enter as "open that link".
        const visible = [...document.querySelectorAll('.nt-link:not(.is-filtered-out)')];
        if (visible.length === 1) {
            window.location.href = visible[0].href;
            return;
        }
        runBrowserSearch(query);
    });

    return wrap;
}

/** Hand a query to the browser's configured default search engine. */
function runBrowserSearch(query) {
    // chrome.search.query is the only API that respects the user's chosen provider.
    // Firefox exposes the same behaviour as browser.search.search.
    try {
        if (typeof chrome !== 'undefined' && chrome.search?.query) {
            chrome.search.query({ text: query, disposition: 'CURRENT_TAB' }, () => {
                if (chrome.runtime?.lastError) fallbackSearch(query);
            });
            return;
        }
        if (typeof browser !== 'undefined' && browser.search?.search) {
            browser.search.search({ query });
            return;
        }
    } catch (err) {
        console.warn('[Homy] default search provider unavailable', err);
    }
    fallbackSearch(query);
}

/**
 * Last resort when the search API is unavailable (e.g. the optional "search"
 * permission was not granted): drive the omnibox-equivalent via a plain navigation.
 */
function fallbackSearch(query) {
    window.location.href = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
}

/** Live-filter the rendered links as the user types. */
function bindSearchFiltering(root, locale) {
    const input = root.querySelector('.nt-search-input');
    if (!input) return;

    const apply = () => {
        const q = input.value.trim().toLowerCase();
        const links = [...root.querySelectorAll('.nt-link')];
        links.forEach((a) => {
            const hay = `${a.textContent || ''} ${a.getAttribute('href') || ''}`.toLowerCase();
            a.classList.toggle('is-filtered-out', !!q && !hay.includes(q));
        });

        // Hide blocks and tab panels that no longer contain a visible link.
        root.querySelectorAll('.nt-block').forEach((block) => {
            const hasGrid = block.querySelector('.nt-link-grid');
            if (!hasGrid) return; // clocks and live widgets stay visible
            const anyVisible = block.querySelector('.nt-link:not(.is-filtered-out)');
            block.classList.toggle('is-filtered-out', !!q && !anyVisible);
        });

        root.classList.toggle('is-searching', !!q);
    };

    input.addEventListener('input', apply);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            input.value = '';
            apply();
        }
    });

    // Registered once for the lifetime of the page. The page is repainted several
    // times (cached -> live -> refreshed), so binding this per render would stack up
    // listeners that each pin a discarded DOM tree in memory.
    if (!_typeAheadBound) {
        _typeAheadBound = true;
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const current = document.querySelector('.nt-search-input');
            if (!current || document.activeElement === current) return;
            const tag = (document.activeElement?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea') return;
            if (e.key.length !== 1) return;
            current.focus();
        });
    }

    // Only steal focus on the very first paint — a later live-data repaint must not
    // yank the caret out of wherever the user has moved it.
    if (!_didAutoFocus) {
        _didAutoFocus = true;
        input.focus();
    }
}

function bindSettingsButton(root, locale) {
    const existing = root.querySelector('.nt-settings-fab');
    if (existing) return;
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'nt-settings-fab';
    fab.title = t('newtab_open_settings', locale);
    fab.textContent = '⚙';
    fab.addEventListener('click', () => chrome.runtime.openOptionsPage());
    root.appendChild(fab);
}

function fillTabPanel(panel, tab, widgets, allFavorites, locale) {
    if (!widgets.length) {
        panel.appendChild(emptyBlock(t('newtab_tab_empty', locale)));
        return;
    }
    const stack = document.createElement('div');
    stack.className = 'nt-stack';
    for (const w of widgets) {
        const block = renderWidgetBlock(w, allFavorites, locale);
        if (block) stack.appendChild(block);
    }
    panel.appendChild(stack);
}

function renderWidgetBlock(widget, allFavorites, locale) {
    const type = widget.type || 'unknown';
    const title = widget.title || typeLabel(type, locale);
    const section = document.createElement('article');
    section.className = 'nt-block';

    const head = document.createElement('header');
    head.className = 'nt-block-head';
    head.innerHTML = `<h2>${escapeHtml(title)}</h2><span class="nt-type">${escapeHtml(typeLabel(type, locale))}</span>`;
    section.appendChild(head);

    const body = document.createElement('div');
    body.className = 'nt-block-body';

    // Live value from /api/extension/widget-data, when the option is enabled and the
    // server answered in time. Falls through to the stored-links rendering otherwise.
    const live = _opts.live?.widgets?.[widget.id];

    if (type === 'favorites') {
        const favs = filterFavorites(allFavorites, widget.config);
        if (!favs.length) {
            body.appendChild(emptyBlock(t('newtab_no_favorites', locale)));
        } else {
            body.appendChild(renderLinkGrid(favs));
        }
    } else if (type === 'service_status') {
        const services = parseServiceLines(widget.config);
        if (!services.length) {
            body.appendChild(emptyBlock(t('newtab_no_links', locale)));
        } else {
            body.appendChild(renderLinkGrid(services.map((s) => ({ title: s.name, url: s.url }))));
        }
    } else if (type === 'clock') {
        body.appendChild(renderClock(widget.config, locale));
    } else if (live && live.ok) {
        // Checked after the type-specific renderers so enabling live data never
        // downgrades a widget that already has a dedicated rendering.
        body.appendChild(renderLiveValue(live, widget, locale));
        const links = extractConfigLinks(widget.config);
        if (links.length) {
            body.appendChild(renderLinkGrid(links.map((l) => ({ title: l.label, url: l.url }))));
        }
    } else {
        const links = extractConfigLinks(widget.config);
        if (links.length) {
            body.appendChild(renderLinkGrid(links.map((l) => ({ title: l.label, url: l.url }))));
        } else {
            const note = document.createElement('p');
            note.className = 'nt-muted';
            // Distinguish "live data is switched off" from "we tried and it failed",
            // so the message actually tells the user what to do about it.
            if (live && !live.ok) {
                note.textContent = `${t('newtab_live_failed', locale)} ${live.message || ''}`.trim();
            } else if (_opts.liveEnabled) {
                note.textContent = t('newtab_live_none', locale);
            } else {
                note.textContent = t('newtab_widget_offline_note', locale);
            }
            body.appendChild(note);
        }
    }

    section.appendChild(body);
    return section;
}

/** Render a live value returned by /api/extension/widget-data. */
function renderLiveValue(live, widget, locale) {
    const wrap = document.createElement('div');
    wrap.className = 'nt-live';

    const value = live.value;

    if (value === null || value === undefined || value === '') {
        wrap.appendChild(emptyBlock(t('newtab_live_none', locale)));
        return wrap;
    }

    if (Array.isArray(value)) {
        const list = document.createElement('ul');
        list.className = 'nt-live-list';
        value.slice(0, 8).forEach((item) => {
            const li = document.createElement('li');
            li.textContent = typeof item === 'object' && item !== null
                ? JSON.stringify(item).slice(0, 160)
                : String(item);
            list.appendChild(li);
        });
        wrap.appendChild(list);
        if (value.length > 8) {
            const more = document.createElement('p');
            more.className = 'nt-muted';
            more.textContent = `+${value.length - 8}`;
            wrap.appendChild(more);
        }
        return wrap;
    }

    if (typeof value === 'object') {
        const grid = document.createElement('dl');
        grid.className = 'nt-live-kv';
        Object.entries(value).slice(0, 8).forEach(([k, v]) => {
            const dt = document.createElement('dt');
            dt.textContent = k;
            const dd = document.createElement('dd');
            dd.textContent = typeof v === 'object' && v !== null
                ? JSON.stringify(v).slice(0, 120)
                : String(v);
            grid.appendChild(dt);
            grid.appendChild(dd);
        });
        wrap.appendChild(grid);
        return wrap;
    }

    const stat = document.createElement('div');
    stat.className = 'nt-live-stat';
    const num = document.createElement('span');
    num.className = 'nt-live-value';
    num.textContent = String(value);
    stat.appendChild(num);
    if (live.unit) {
        const unit = document.createElement('span');
        unit.className = 'nt-live-unit';
        unit.textContent = live.unit;
        stat.appendChild(unit);
    }
    wrap.appendChild(stat);
    return wrap;
}

function renderFavoritesSection(favorites, locale, heading) {
    const wrap = document.createElement('main');
    wrap.className = 'nt-main';
    const block = document.createElement('article');
    block.className = 'nt-block';
    block.innerHTML = `<header class="nt-block-head"><h2>${escapeHtml(heading)}</h2></header>`;
    const body = document.createElement('div');
    body.className = 'nt-block-body';
    if (!favorites.length) {
        body.appendChild(emptyBlock(t('newtab_no_favorites', locale)));
    } else {
        const byCat = groupByCategory(favorites);
        for (const [cat, items] of byCat) {
            if (byCat.length > 1) {
                const h = document.createElement('h3');
                h.className = 'nt-cat-title';
                h.textContent = cat;
                body.appendChild(h);
            }
            body.appendChild(renderLinkGrid(items));
        }
    }
    block.appendChild(body);
    wrap.appendChild(block);
    return wrap;
}

function groupByCategory(favorites) {
    const map = new Map();
    for (const f of favorites) {
        const cat = f.category || 'General';
        if (!map.has(cat)) map.set(cat, []);
        map.get(cat).push(f);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function filterFavorites(favorites, config) {
    const filter = String(config?.category_filter || '').trim();
    if (!filter) return favorites;
    const lf = filter.toLowerCase();
    return favorites.filter((f) => (f.category || '').toLowerCase() === lf);
}

function parseServiceLines(config) {
    const raw = String(config?.services || '');
    const out = [];
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const pipe = trimmed.indexOf('|');
        if (pipe < 1) continue;
        const name = trimmed.slice(0, pipe).trim();
        const url = trimmed.slice(pipe + 1).trim();
        if (name && /^https?:\/\//i.test(url)) out.push({ name, url });
    }
    return out;
}

function extractConfigLinks(config) {
    const out = [];
    const seen = new Set();
    const walk = (obj, prefix = '') => {
        if (!obj || typeof obj !== 'object') return;
        for (const [key, val] of Object.entries(obj)) {
            if (typeof val === 'string') {
                if (/^https?:\/\//i.test(val) && !seen.has(val)) {
                    seen.add(val);
                    out.push({ label: prefix ? `${prefix}.${key}` : key, url: val });
                }
                if (key === 'services') {
                    parseServiceLines({ services: val }).forEach((s) => {
                        if (!seen.has(s.url)) {
                            seen.add(s.url);
                            out.push({ label: s.name, url: s.url });
                        }
                    });
                }
            } else if (val && typeof val === 'object') {
                walk(val, key);
            }
        }
    };
    walk(config || {});
    return out;
}

function renderLinkGrid(items) {
    const grid = document.createElement('div');
    grid.className = 'nt-link-grid';
    for (const item of items) {
        if (!item.url) continue;
        const a = document.createElement('a');
        a.className = 'nt-link';
        a.href = item.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.title = item.title || item.url;

        const icon = document.createElement('span');
        icon.className = 'nt-link-icon';
        icon.textContent = faviconLetter(item);
        const src = faviconUrl(item);
        if (src) {
            const img = document.createElement('img');
            img.src = src;
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.referrerPolicy = 'no-referrer';
            img.addEventListener('load', () => icon.classList.add('has-img'));
            img.addEventListener('error', () => img.remove());
            icon.appendChild(img);
        }

        const label = document.createElement('span');
        label.className = 'nt-link-label';
        label.textContent = item.title || prettyHost(item.url);

        a.appendChild(icon);
        a.appendChild(label);
        grid.appendChild(a);
    }
    return grid;
}

/** Resolve the best icon source for a link/favorite. Falls back to a letter tile. */
function faviconUrl(item) {
    const val = String(item.icon_value || '').trim();
    const type = item.icon_type;
    if (type === 'image' && val) return val;
    if (type === 'asset' && val && _opts.baseUrl) {
        return `${_opts.baseUrl}/api/assets/${encodeURIComponent(val)}/file`;
    }
    const u = String(item.url || '').trim();
    if (!u) return '';
    // Prefer Homy's cached favicon when the server base URL is known…
    if (_opts.baseUrl) return `${_opts.baseUrl}/api/favicon?url=${encodeURIComponent(u)}`;
    // …otherwise fall back to a public favicon service.
    try {
        const host = new URL(u).hostname;
        return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
    } catch {
        return '';
    }
}

function prettyHost(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return url;
    }
}

function renderClock(config, locale) {
    const wrap = document.createElement('div');
    wrap.className = 'nt-clock';
    const timeEl = document.createElement('div');
    timeEl.className = 'nt-clock-time';
    const dateEl = document.createElement('div');
    dateEl.className = 'nt-clock-date nt-muted';
    wrap.appendChild(timeEl);
    wrap.appendChild(dateEl);
    const tz = String(config?.timezone || '').trim() || undefined;
    const fmt24 = String(config?.format_24h || config?.time_format || '').toLowerCase() !== '12';
    const tick = () => {
        const now = new Date();
        timeEl.textContent = now.toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: !fmt24,
            timeZone: tz,
        });
        dateEl.textContent = now.toLocaleDateString(locale, {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: tz,
        });
    };
    tick();
    wrap.dataset.clock = '1';
    _clockTimers.push(setInterval(tick, 1000));
    return wrap;
}

function emptyBlock(text) {
    const p = document.createElement('p');
    p.className = 'nt-muted nt-empty';
    p.textContent = text;
    return p;
}

function faviconLetter(item) {
    try {
        const host = new URL(item.url).hostname;
        return (host.replace(/^www\./, '')[0] || '?').toUpperCase();
    } catch {
        return (item.title || '?')[0].toUpperCase();
    }
}

function typeLabel(type, locale) {
    const key = `widget_type_${type}`;
    const translated = t(key, locale);
    return translated !== key ? translated : type;
}

function formatTs(iso, locale) {
    try {
        return new Date(iso).toLocaleString(locale);
    } catch {
        return String(iso);
    }
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
}
