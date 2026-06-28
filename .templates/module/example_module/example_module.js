// The type string here must match 'type' in WIDGETS (example_module.py).
window.WidgetRegistry.register('example_hello', {

    // Convenience wrapper so you don't have to null-check i18n every time.
    // Falls back to the hardcoded English string if the translation isn't loaded yet.
    _t(key, fallback) {
        if (!window.i18n) return fallback;
        const v = window.i18n.translate(key);
        return v === key ? fallback : v;
    },

    // Escapes a value for safe innerHTML insertion. Always use this for
    // user-provided strings — never interpolate config values directly into HTML.
    _esc(value) {
        const el = document.createElement('div');
        el.textContent = value == null ? '' : String(value);
        return el.innerHTML;
    },

    // render() is called whenever the widget needs to draw itself.
    // container — the widget's content <div>, yours to fill
    // widgetData — the full widget object from the API (id, title, config, ...)
    // config — shortcut to widgetData.config, already resolved (vault secrets included)
    async render(container, widgetData, config) {
        const cfg = config || {};

        // Read the user's config value, fall back to a translated default.
        const greeting = this._esc(cfg.greeting || this._t('example_hello_default', 'Hello, Dashboard!'));
        const style = cfg.style || 'Default';

        container.innerHTML = `
            <div class="example-hello example-hello--${style.toLowerCase()}">
                <div class="example-hello-text">${greeting}</div>
                <div class="example-hello-hint muted-text">
                    ${this._t('example_hello_hint', 'Example module — edit the widget to customize')}
                </div>
            </div>
        `;

        // If your widget has interactive elements, add event listeners here.
        // Don't worry about cleanup — the container is replaced on every render.
    },

    // onRemove(widgetId) is called when the widget is deleted or the page unloads.
    // Use it to clear setInterval/setTimeout timers you started in render().
    // onRemove(widgetId) {
    //     clearInterval(this._timers[widgetId]);
    // },

    // onResize(bodyEl, widgetEl) fires after a drag-resize ends.
    // Useful if you need to re-draw a chart or recalculate layout.
    // onResize(bodyEl, widgetEl) { ... }
});
