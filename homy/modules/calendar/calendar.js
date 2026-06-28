// Calendar Module Frontend Renderer

window.WidgetRegistry.register('calendar', {
    async render(container, widgetData, config) {
        container.innerHTML = '<div class="widget-loading"><div class="spinner"></div></div>';
        
        try {
            const res = await API.request(`/api/calendar/events?widget_id=${widgetData.id}`);
            container.innerHTML = '';
            
            if (!res.configured) {
                container.innerHTML = `
                    <div class="text-center muted-text" style="padding: 20px;">
                        <i data-lucide="calendar-off" style="width: 32px; height: 32px; margin-bottom: 8px;"></i>
                        <p>${res.message}</p>
                    </div>
                `;
                lucide.createIcons();
                return;
            }
            
            if (res.events.length === 0) {
                container.innerHTML = '<div class="muted-text text-center" style="padding: 20px;">Keine anstehenden Termine.</div>';
                return;
            }
            
            const list = document.createElement('div');
            list.className = 'calendar-events-list';
            
            res.events.forEach(e => {
                const item = document.createElement('div');
                item.className = 'calendar-event-item';
                
                // Parse date
                const startDate = new Date(e.start);
                const endDate = new Date(e.end);
                const isAllDay = e.all_day;
                
                const { dayLabel, dateLabel } = this.formatEventDate(startDate);
                
                let timeLabel = '';
                if (isAllDay) {
                    timeLabel = window.i18n.currentLocale === 'de-DE' ? 'Ganztägig' : 'All Day';
                } else {
                    const startHours = String(startDate.getHours()).padStart(2, '0');
                    const startMins = String(startDate.getMinutes()).padStart(2, '0');
                    const endHours = String(endDate.getHours()).padStart(2, '0');
                    const endMins = String(endDate.getMinutes()).padStart(2, '0');
                    timeLabel = `${startHours}:${startMins} - ${endHours}:${endMins}`;
                }
                
                item.innerHTML = `
                    <div class="event-date-badge">
                        <div class="date-badge-day">${dayLabel}</div>
                        <div class="date-badge-num">${dateLabel}</div>
                    </div>
                    <div class="event-details">
                        <div class="event-summary">${e.summary}</div>
                        <div class="event-meta">
                            <span class="event-time"><i data-lucide="clock"></i> ${timeLabel}</span>
                            ${e.location ? `<span class="event-location"><i data-lucide="map-pin"></i> ${e.location}</span>` : ''}
                        </div>
                    </div>
                `;
                list.appendChild(item);
            });
            
            container.appendChild(list);
            lucide.createIcons();
            
        } catch (err) {
            container.innerHTML = `<div class="widget-error"><i data-lucide="alert-circle"></i><span>${err.message}</span></div>`;
            lucide.createIcons();
        }
    },
    
    formatEventDate(date) {
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);
        
        const isToday = date.toDateString() === today.toDateString();
        const isTomorrow = date.toDateString() === tomorrow.toDateString();
        
        const locale = window.i18n.currentLocale;
        
        let dayLabel = '';
        if (isToday) {
            dayLabel = locale === 'de-DE' ? 'Heute' : 'Today';
        } else if (isTomorrow) {
            dayLabel = locale === 'de-DE' ? 'Morgn' : 'Tomor'; // 5 letter cap for style badge
        } else {
            const weekdaysDe = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
            const weekdaysEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            dayLabel = locale === 'de-DE' ? weekdaysDe[date.getDay()] : weekdaysEn[date.getDay()];
        }
        
        // Date num label e.g. "28. Mai" or "May 28"
        let dateLabel = '';
        if (locale === 'de-DE') {
            const monthsDe = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
            dateLabel = `${date.getDate()}. ${monthsDe[date.getMonth()]}`;
        } else {
            const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            dateLabel = `${monthsEn[date.getMonth()]} ${date.getDate()}`;
        }
        
        return { dayLabel, dateLabel };
    }
});
