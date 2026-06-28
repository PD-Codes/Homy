// Spacer Widget Frontend Registration

window.WidgetRegistry.register('spacer', {
    render(el, data, config) {
        el.innerHTML = '<div class="spacer-widget-content"></div>';
    }
});
