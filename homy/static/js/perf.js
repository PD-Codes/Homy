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
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
        script.onload = () => resolve(window.Chart);
        script.onerror = () => reject(new Error('Chart.js konnte nicht geladen werden'));
        document.head.appendChild(script);
    });
    return _chartJsPromise;
};

function _loadStylesheet(href) {
    if (!href || document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

function _loadScript(src) {
    return new Promise((resolve, reject) => {
        if (!src || document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
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
