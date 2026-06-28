window.WidgetRegistry.register('note', {
    render(container, widgetData, config) {
        const content = (config.content || '').trim();
        const title = (config.note_title || '').trim();
        const style = config.style || 'plain';
        const fontSize = config.font_size || 'normal';

        const sizeMap = { klein: '0.78rem', normal: '0.85rem', groß: '0.95rem' };
        const fs = sizeMap[fontSize] || '0.85rem';

        const icons = { plain: 'sticky-note', info: 'info', success: 'check-circle', warning: 'alert-triangle', danger: 'alert-circle' };
        const icon = icons[style] || 'sticky-note';

        const rendered = this._renderText(content);

        const emptyText = window.i18n ? window.i18n.translate('note_empty') : 'Kein Inhalt konfiguriert.';
        container.innerHTML = `
            <div class="note-widget note-${style}">
                ${title ? `<div class="note-title"><i data-lucide="${icon}" style="width:13px;height:13px;"></i><span>${title}</span></div>` : ''}
                <div class="note-body" style="font-size:${fs}">${rendered || `<span class="muted-text">${emptyText}</span>`}</div>
            </div>
        `;
        window.refreshLucideIcons(container);
    },

    _renderText(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code class="note-code">$1</code>')
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^(.+)$/, '<p>$1</p>');
    },
});
