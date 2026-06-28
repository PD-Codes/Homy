// Custom 2D Grid Layout Engine with gravity and absolute positioning transitions
// Performance-optimized: uses requestAnimationFrame, cached metrics, and skips
// expensive onResize calls during drag/resize operations.

class DashboardGrid {
    constructor(gridContainerId) {
        this.container = document.getElementById(gridContainerId);
        this.widgets = []; // Array of { id, el, col, row, size_x, size_y }
        this.placeholder = null;
        this.isEditing = false;
        
        this.draggedWidget = null;
        this.resizingWidget = null;
        
        this.dragStartMouseX = 0;
        this.dragStartMouseY = 0;
        this.dragStartLeft = 0;
        this.dragStartTop = 0;
        this.dragStartCol = 0;
        this.dragStartRow = 0;
        this.dragStartWidth = 0;
        this.dragStartHeight = 0;
        
        this.gridGap = 8;
        this.gridColWidth = 0;
        this.gridRowHeight = 38; // 30px cell + 8px gap
        
        // Performance: RAF-based pointer move batching
        this._rafHandle = null;
        this._pendingX = 0;
        this._pendingY = 0;
        
        // Performance: cached col width set at drag/resize start
        this._cachedColWidth = 0;
        
        // Performance: debounce window resize
        this._resizeDebounce = null;
        
        this.initEvents();
        this._initResizeObserver();
    }

    _initResizeObserver() {
        if (!this.container || typeof ResizeObserver === 'undefined') return;
        this._containerObserver = new ResizeObserver(() => {
            if (this._resizeDebounce) clearTimeout(this._resizeDebounce);
            this._resizeDebounce = setTimeout(() => {
                this.updateGridMetrics();
                this.arrangeWidgetsDOM();
            }, 80);
        });
        this._containerObserver.observe(this.container);
    }

    /** Force relayout after sidebar or shell size changes. */
    reflow() {
        if (this._resizeDebounce) clearTimeout(this._resizeDebounce);
        this.updateGridMetrics();
        this.arrangeWidgetsDOM();
    }

    setWidgets(widgetsData) {
        const oldWidgets = this.widgets || [];
        this.widgets = widgetsData.map(w => {
            const existing = oldWidgets.find(gw => gw.id === w.id);
            return {
                id: w.id,
                col: (this.isEditing && existing) ? existing.col : w.col,
                row: (this.isEditing && existing) ? existing.row : w.row,
                size_x: (this.isEditing && existing) ? existing.size_x : w.size_x,
                size_y: (this.isEditing && existing) ? existing.size_y : w.size_y,
                type: w.type,
                el: null // Set later during render
            };
        });
        
        this.resolveGridCollisions();
    }

    enableEditing(enabled) {
        this.isEditing = enabled;
        if (enabled) {
            this.container.classList.add('editing');
        } else {
            this.container.classList.remove('editing');
            if (this.placeholder) {
                this.placeholder.remove();
                this.placeholder = null;
            }
        }
        this.updateGridMetrics();
        this.arrangeWidgetsDOM();
    }

    initEvents() {
        // Drag / Resize start
        this.container.addEventListener('mousedown', (e) => this.onPointerDown(e));
        this.container.addEventListener('touchstart', (e) => this.onPointerDown(e), { passive: false });

        // Move — store coordinates and schedule RAF (never block the main thread)
        window.addEventListener('mousemove', (e) => this.onPointerMove(e));
        window.addEventListener('touchmove', (e) => this.onPointerMove(e), { passive: false });

        // End
        window.addEventListener('mouseup', () => this.onPointerUp());
        window.addEventListener('touchend', () => this.onPointerUp());
        
        // Debounced window resize (150 ms) to avoid thrashing
        window.addEventListener('resize', () => {
            if (this._resizeDebounce) clearTimeout(this._resizeDebounce);
            this._resizeDebounce = setTimeout(() => {
                this.updateGridMetrics();
                this.arrangeWidgetsDOM();
            }, 150);
        });
    }

    updateGridMetrics() {
        if (!this.container) return;
        const rect = this.container.getBoundingClientRect();
        this.gridColWidth = (rect.width + this.gridGap) / 24; // 24 columns
    }

    getPointerPos(e) {
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { clientX, clientY };
    }

    onPointerDown(e) {
        if (!this.isEditing) return;

        const { clientX, clientY } = this.getPointerPos(e);
        const target = e.target;
        
        // Resize handle click
        const resizeHandle = target.closest('.widget-resize-handle');
        if (resizeHandle) {
            e.preventDefault();
            const widgetEl = resizeHandle.closest('.widget');
            const widgetId = widgetEl.getAttribute('data-id');
            const widget = this.widgets.find(w => w.id === widgetId);
            
            if (widget) {
                // Cache metrics ONCE at drag start — no re-reads during move
                this.updateGridMetrics();
                this._cachedColWidth = this.gridColWidth;
                
                this.resizingWidget = widget;
                widget.el.classList.add('resizing');
                this.dragStartMouseX = clientX;
                this.dragStartMouseY = clientY;
                this.dragStartWidth = widget.size_x;
                this.dragStartHeight = widget.size_y;
                
                this.createPlaceholder(widget);
            }
            return;
        }

        // Drag handle / widget body click
        const dragHandle = target.closest('.widget-drag-handle');
        if (dragHandle || (target.closest('.widget') && !target.closest('.widget-actions'))) {
            if (target.closest('.widget-actions')) return;
            
            const widgetEl = target.closest('.widget');
            const widgetId = widgetEl.getAttribute('data-id');
            const widget = this.widgets.find(w => w.id === widgetId);
            
            if (widget) {
                if (e.type === 'touchstart') e.preventDefault();
                
                // Cache metrics ONCE at drag start
                this.updateGridMetrics();
                this._cachedColWidth = this.gridColWidth;
                
                this.draggedWidget = widget;
                widget.el.classList.add('dragging');
                
                this.dragStartMouseX = clientX;
                this.dragStartMouseY = clientY;
                this.dragStartCol = widget.col;
                this.dragStartRow = widget.row;
                
                const rect = widget.el.getBoundingClientRect();
                const containerRect = this.container.getBoundingClientRect();
                this.dragStartLeft = rect.left - containerRect.left;
                this.dragStartTop = rect.top - containerRect.top;
                
                this.createPlaceholder(widget);
            }
        }
    }

    onPointerMove(e) {
        if (!this.isEditing) return;
        if (!this.draggedWidget && !this.resizingWidget) return;

        // Touch: prevent scroll — must happen synchronously
        if (e.type === 'touchmove') e.preventDefault();

        // Store latest coordinates and schedule one RAF frame
        const { clientX, clientY } = this.getPointerPos(e);
        this._pendingX = clientX;
        this._pendingY = clientY;

        if (!this._rafHandle) {
            this._rafHandle = requestAnimationFrame(() => {
                this._rafHandle = null;
                this._processMove(this._pendingX, this._pendingY);
            });
        }
    }

    _processMove(clientX, clientY) {
        const colWidth = this._cachedColWidth;
        const rowHeight = this.gridRowHeight;

        if (this.draggedWidget) {
            const deltaX = clientX - this.dragStartMouseX;
            const deltaY = clientY - this.dragStartMouseY;
            
            const currentLeft = this.dragStartLeft + deltaX;
            const currentTop = this.dragStartTop + deltaY;
            
            // Move the dragged widget visually
            this.draggedWidget.el.style.transform = `translate(${currentLeft}px, ${currentTop}px)`;
            
            // Snap to grid
            let targetCol = Math.round(currentLeft / colWidth);
            let targetRow = Math.round(currentTop / rowHeight);
            targetCol = Math.max(0, Math.min(24 - this.draggedWidget.size_x, targetCol));
            targetRow = Math.max(0, targetRow);
            
            // Only reflow layout when the grid cell actually changes
            if (this.draggedWidget.col !== targetCol || this.draggedWidget.row !== targetRow) {
                this.draggedWidget.col = targetCol;
                this.draggedWidget.row = targetRow;
                
                this.updatePlaceholder(targetCol, targetRow, this.draggedWidget.size_x, this.draggedWidget.size_y);
                this.resolveGridCollisions(this.draggedWidget.id);
                this._arrangeOthers(); // Reposition non-dragged widgets only
            }
        }

        if (this.resizingWidget) {
            const deltaX = clientX - this.dragStartMouseX;
            const deltaY = clientY - this.dragStartMouseY;
            
            const startWidthPx = this.dragStartWidth * colWidth - this.gridGap;
            const startHeightPx = this.dragStartHeight * rowHeight - this.gridGap;
            
            const currentWidthPx = Math.max(50, startWidthPx + deltaX);
            const currentHeightPx = Math.max(30, startHeightPx + deltaY);
            
            this.resizingWidget.el.style.width = `${currentWidthPx}px`;
            this.resizingWidget.el.style.height = `${currentHeightPx}px`;
            
            let targetWidth = Math.round((currentWidthPx + this.gridGap) / colWidth);
            let targetHeight = Math.round((currentHeightPx + this.gridGap) / rowHeight);
            targetWidth = Math.max(2, Math.min(24 - this.resizingWidget.col, targetWidth));
            targetHeight = Math.max(2, targetHeight);
            
            if (this.resizingWidget.size_x !== targetWidth || this.resizingWidget.size_y !== targetHeight) {
                this.resizingWidget.size_x = targetWidth;
                this.resizingWidget.size_y = targetHeight;

                this.updatePlaceholder(this.resizingWidget.col, this.resizingWidget.row, targetWidth, targetHeight);
                this.resolveGridCollisions(this.resizingWidget.id);
                this._arrangeOthers();

                // Show size label on the widget
                let sizeLabel = this.resizingWidget.el.querySelector('.widget-size-label');
                if (!sizeLabel) {
                    sizeLabel = document.createElement('div');
                    sizeLabel.className = 'widget-size-label';
                    this.resizingWidget.el.appendChild(sizeLabel);
                }
                sizeLabel.textContent = `${targetWidth} × ${targetHeight}`;
            }
        }
    }

    // Lightweight version of arrangeWidgetsDOM used during drag/resize.
    // Only repositions non-active widgets — skips metrics re-read and onResize callbacks.
    _arrangeOthers() {
        const colWidth = this._cachedColWidth;
        const gap = this.gridGap;
        const rowHeight = this.gridRowHeight;
        
        let maxRow = 0;
        const activeId = this.draggedWidget ? this.draggedWidget.id 
                       : this.resizingWidget ? this.resizingWidget.id
                       : null;
        
        this.widgets.forEach(w => {
            if (!w.el || w.id === activeId) return;
            
            const left = w.col * colWidth;
            const top = w.row * rowHeight;
            const width = w.size_x * colWidth - gap;
            const height = w.size_y * rowHeight - gap;
            
            w.el.style.transform = `translate(${left}px, ${top}px)`;
            w.el.style.width = `${width}px`;
            w.el.style.height = `${height}px`;
            
            if (w.row + w.size_y > maxRow) maxRow = w.row + w.size_y;
        });
        
        if (this.draggedWidget) {
            maxRow = Math.max(maxRow, this.draggedWidget.row + this.draggedWidget.size_y);
        } else if (this.resizingWidget) {
            maxRow = Math.max(maxRow, this.resizingWidget.row + this.resizingWidget.size_y);
        }
        
        let containerHeight = maxRow * rowHeight + 16;
        if (this.isEditing) {
            containerHeight += 200;
        }
        containerHeight = Math.max(300, containerHeight);
        this.container.style.height = `${containerHeight}px`;
    }

    onPointerUp() {
        // Cancel any pending RAF
        if (this._rafHandle) {
            cancelAnimationFrame(this._rafHandle);
            this._rafHandle = null;
        }
        
        if (this.draggedWidget) {
            this.draggedWidget.el.classList.remove('dragging');
            this.draggedWidget.el.style.zIndex = '';
            
            if (this.placeholder) {
                this.draggedWidget.col = parseInt(this.placeholder.getAttribute('data-col'));
                this.draggedWidget.row = parseInt(this.placeholder.getAttribute('data-row'));
            }
            
            this.draggedWidget = null;
        }
        
        if (this.resizingWidget) {
            this.resizingWidget.el.classList.remove('resizing');
            this.resizingWidget.el.style.zIndex = '';
            this.resizingWidget = null;
        }

        if (this.placeholder) {
            this.placeholder.remove();
            this.placeholder = null;
        }
        
        // Full layout pass (with metrics refresh and onResize callbacks) only on drag end
        this.resolveGridCollisions();
        this.arrangeWidgetsDOM();

        // Remove any lingering size labels
        this.widgets.forEach(w => {
            if (w.el) {
                const label = w.el.querySelector('.widget-size-label');
                if (label) label.remove();
            }
        });
    }

    createPlaceholder(widget) {
        if (this.placeholder) this.placeholder.remove();
        
        this.placeholder = document.createElement('div');
        this.placeholder.className = 'widget-placeholder';
        this.updatePlaceholder(widget.col, widget.row, widget.size_x, widget.size_y);
        this.container.appendChild(this.placeholder);
    }

    updatePlaceholder(col, row, size_x, size_y) {
        if (!this.placeholder) return;
        this.placeholder.setAttribute('data-col', col);
        this.placeholder.setAttribute('data-row', row);
        
        const colWidth = this._cachedColWidth || this.gridColWidth;
        const gap = this.gridGap;
        const rowHeight = this.gridRowHeight;
        
        const left = col * colWidth;
        const top = row * rowHeight;
        const width = size_x * colWidth - gap;
        const height = size_y * rowHeight - gap;
        
        this.placeholder.style.transform = `translate(${left}px, ${top}px)`;
        this.placeholder.style.width = `${width}px`;
        this.placeholder.style.height = `${height}px`;
    }

    collides(w1, w2) {
        return w1.col < w2.col + w2.size_x &&
               w1.col + w1.size_x > w2.col &&
               w1.row < w2.row + w2.size_y &&
               w1.row + w1.size_y > w2.row;
    }

    resolveGridCollisions(activeId = null) {
        const sortedWidgets = [...this.widgets];
        sortedWidgets.sort((a, b) => a.row - b.row || a.col - b.col);
        
        const placed = [];
        
        for (const w of sortedWidgets) {
            if (w.id === activeId) {
                placed.push(w);
            } else {
                w.row = 0;
                while (placed.some(p => this.collides(w, p))) {
                    w.row++;
                }
                placed.push(w);
            }
        }
    }

    // Full layout pass: refreshes metrics and calls module onResize callbacks.
    // Only called on drag end, resize end, initial load, and window resize.
    arrangeWidgetsDOM() {
        this.updateGridMetrics();
        
        const colWidth = this.gridColWidth;
        const gap = this.gridGap;
        const rowHeight = this.gridRowHeight;
        
        let maxRow = 0;
        
        this.widgets.forEach(w => {
            if (w.el) {
                const left = w.col * colWidth;
                const top = w.row * rowHeight;
                const width = w.size_x * colWidth - gap;
                const height = w.size_y * rowHeight - gap;
                
                if (w.row + w.size_y > maxRow) maxRow = w.row + w.size_y;
                
                w.el.style.position = 'absolute';
                w.el.style.transform = `translate(${left}px, ${top}px)`;
                w.el.style.width = `${width}px`;
                w.el.style.height = `${height}px`;
                
                // Notify module of resize (expensive calls, only on full pass)
                const renderer = window.WidgetRegistry && window.WidgetRegistry.get(w.type);
                if (renderer && typeof renderer.onResize === 'function') {
                    renderer.onResize(w.el.querySelector('.widget-body'), w.el);
                }
            }
        });
        
        let containerHeight = maxRow * rowHeight + 16;
        if (this.isEditing) {
            containerHeight += 200;
        }
        containerHeight = Math.max(300, containerHeight);
        this.container.style.height = `${containerHeight}px`;
    }

    findFirstAvailableSpace(size_x, size_y) {
        let row = 0;
        while (true) {
            for (let col = 0; col <= 24 - size_x; col++) {
                const tempWidget = { col, row, size_x, size_y };
                let collides = false;
                for (const w of this.widgets) {
                    if (this.collides(tempWidget, w)) {
                        collides = true;
                        break;
                    }
                }
                if (!collides) {
                    return { col, row };
                }
            }
            row++;
            if (row > 1000) return { col: 0, row: 0 };
        }
    }

    getPositions() {
        return this.widgets.map(w => ({
            id: w.id,
            col: w.col,
            row: w.row,
            size_x: w.size_x,
            size_y: w.size_y
        }));
    }
}

window.DashboardGrid = DashboardGrid;

window.reflowDashboardGrid = function reflowDashboardGrid() {
    const ctrl = window.getActiveDashboardController?.() || null;
    const gc = ctrl?.gridController || window.gridController;
    if (gc) {
        gc.reflow();
    }
};
