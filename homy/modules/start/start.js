// Classic UI fallback: these widgets are rendered by the new Homy interface.
['search_bar', 'quick_weather'].forEach((type) => {
    window.WidgetRegistry.register(type, {
        render(container) {
            container.innerHTML = '<div class="muted-text" style="padding:12px">'
                + 'Nur in der neuen Oberfläche verfügbar / Available in the new interface only.</div>';
        },
    });
});
