// Performance helpers: scoped icons, lazy Chart.js, module asset loading

window.refreshLucideIcons = function (container) {
    if (!window.lucide) return;
    const root = container || document;
    if (!root.querySelectorAll) return;
    const nodes = root.querySelectorAll('[data-lucide]');
    if (nodes.length) {
        lucide.createIcons({ nodes });
    }
};

let _chartJsPromise = null;
window.loadChartJs = function () {
    if (window.Chart) return Promise.resolve(window.Chart);
    if (_chartJsPromise) return _chartJsPromise;
    _chartJsPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        // Self-hosted: a chart widget must not depend on reaching a public CDN, which
        // fails behind a DNS blocker or on an offline homelab.
        script.src = '/static/vendor/chart-4.4.1.umd.min.js';
        script.onload = () => resolve(window.Chart);
        script.onerror = () => reject(new Error('Chart.js konnte nicht geladen werden'));
        document.head.appendChild(script);
    });
    return _chartJsPromise;
};

function _loadStylesheet(href) {
    // CSS.escape guards against a module asset path containing a quote or bracket,
    // which would otherwise make this selector throw a SyntaxError instead of deduping.
    if (!href) return;
    try {
        if (document.querySelector(`link[href="${CSS.escape(href)}"]`)) return;
    } catch (e) {
        /* fall through and load it — a duplicate stylesheet is harmless */
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

function _loadScript(src) {
    return new Promise((resolve, reject) => {
        if (!src) {
            resolve();
            return;
        }
        try {
            if (document.querySelector(`script[src="${CSS.escape(src)}"]`)) {
                resolve();
                return;
            }
        } catch (e) {
            /* fall through and load it */
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Script failed: ${src}`));
        document.body.appendChild(script);
    });
}

window.loadModuleAssets = async function (modules) {
    if (!modules || !modules.length) return;

    for (const m of modules) {
        _loadStylesheet(m.css_file);
        if (Array.isArray(m.widget_assets)) {
            m.widget_assets.forEach(wa => _loadStylesheet(wa.css_file));
        }
    }

    const jsUrls = [];
    modules.forEach(m => {
        if (m.js_file) jsUrls.push(m.js_file);
        if (Array.isArray(m.widget_assets)) {
            m.widget_assets.forEach(wa => {
                if (wa.js_file) jsUrls.push(wa.js_file);
            });
        }
    });

    const unique = [...new Set(jsUrls)];
    await Promise.all(unique.map(src => _loadScript(src)));
};
