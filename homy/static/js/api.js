// Core API Client Wrapper

const API = {
    async request(url, options = {}) {
        const defaultHeaders = {
            'Content-Type': 'application/json',
        };

        const method = (options.method || 'GET').toUpperCase();
        const skipCache = options.skipCache === true || (window._forceWidgetRefreshDepth || 0) > 0;
        const cacheTtl = options.cacheTtl ?? (method === 'GET' ? window.getApiCacheTtl(url) : 0);

        let requestUrl = url;
        if (method === 'GET' && skipCache && !requestUrl.includes('nocache=1')) {
            const sep = requestUrl.includes('?') ? '&' : '?';
            requestUrl = `${requestUrl}${sep}nocache=1`;
        }

        options.headers = { ...defaultHeaders, ...options.headers };

        if (options.body && typeof options.body === 'object') {
            options.body = JSON.stringify(options.body);
        }

        if (method === 'GET' && cacheTtl > 0 && !skipCache && window.ApiCache) {
            const cached = ApiCache.get(requestUrl, method);
            if (cached !== null) {
                return cached;
            }
        }

        try {
            const response = await fetch(requestUrl, options);
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                // Keep the HTTP status when the body was not JSON (e.g. a proxy 502
                // HTML page), otherwise the real failure is invisible.
                const fallback = response.statusText
                    ? `HTTP ${response.status} — ${response.statusText}`
                    : window.i18n.translate('generic_error');
                const error = new Error(data.message || fallback);
                error.status = response.status;
                error.data = data;
                throw error;
            }

            if (method === 'GET' && cacheTtl > 0 && !skipCache && window.ApiCache) {
                ApiCache.set(requestUrl, data, cacheTtl, method);
            }

            return data;
        } catch (err) {
            console.error(`API Error on ${url}:`, err);
            throw err;
        }
    },

    // Auth
    async setup(username, password) {
        return this.request('/api/setup/init', {
            method: 'POST',
            body: { username, password }
        });
    },

    async checkAuth() {
        return this.request('/api/auth/status');
    },

    async login(username, password) {
        return this.request('/api/auth/login', {
            method: 'POST',
            body: { username, password }
        });
    },

    async verifyMfa(code) {
        return this.request('/api/auth/mfa/verify', {
            method: 'POST',
            body: { code },
        });
    },

    async logout() {
        return this.request('/api/auth/logout', { method: 'POST' });
    },

    async register(username, password) {
        return this.request('/api/auth/register', {
            method: 'POST',
            body: { username, password }
        });
    },

    async passwordResetRequest(identifier) {
        return this.request('/api/auth/password-reset/request', {
            method: 'POST',
            body: { username: identifier },
        });
    },

    async passwordResetConfirm(identifier, code, password) {
        return this.request('/api/auth/password-reset/confirm', {
            method: 'POST',
            body: { username: identifier, code, password },
        });
    },

    async getUserProfile() {
        return this.request('/api/user/profile');
    },

    async updateUserProfile(body) {
        return this.request('/api/user/profile', { method: 'PUT', body });
    },

    async changeUserPassword(body) {
        return this.request('/api/user/password', { method: 'PUT', body });
    },

    async getMfaSetup() {
        return this.request('/api/auth/mfa/setup');
    },

    async confirmMfaSetup(code) {
        return this.request('/api/auth/mfa/setup', { method: 'POST', body: { code } });
    },

    async disableMfa() {
        return this.request('/api/auth/mfa/disable', { method: 'POST' });
    },

    // Widgets (Layout)
    async getWidgets(layout = 'auto') {
        return this.request(`/api/widgets?layout=${layout}`);
    },

    async createWidget(widgetData) {
        return this.request('/api/widgets', {
            method: 'POST',
            body: widgetData
        });
    },

    async updateWidget(id, widgetData) {
        return this.request(`/api/widgets/${id}`, {
            method: 'PUT',
            body: widgetData
        });
    },

    async deleteWidget(id) {
        return this.request(`/api/widgets/${id}`, { method: 'DELETE' });
    },

    async duplicateWidget(id) {
        return this.request(`/api/widgets/${id}/duplicate`, { method: 'POST' });
    },

    async saveBulkLayout(positions) {
        return this.request('/api/widgets/bulk-layout', {
            method: 'PUT',
            body: { positions }
        });
    },

    // Tabs management
    async getTabs(layout = 'auto') {
        return this.request(`/api/tabs?layout=${layout}`);
    },

    async saveTabs(tabs, isPublic = false, layout = 'auto') {
        return this.request('/api/tabs', {
            method: 'POST',
            body: { tabs, is_public: isPublic, layout }
        });
    },

    async duplicateTab(payload) {
        return this.request('/api/tabs/duplicate', {
            method: 'POST',
            body: payload,
        });
    },

    // Layout Backup & Restore
    async exportLayout(layout = 'auto') {
        return this.request(`/api/layout/export?layout=${layout}`);
    },

    async importLayout(data, layout = 'auto') {
        return this.request(`/api/layout/import?layout=${layout}`, {
            method: 'POST',
            body: data
        });
    },

    // Modules Schema
    async getModules() {
        return this.request('/api/modules');
    },

    // Favorites
    async updateAsset(id, data) {
        return this.request(`/api/assets/${id}`, {
            method: 'PUT',
            body: data,
        });
    },

    async getFavorites(layout = 'auto') {
        return this.request(`/api/favorites?layout=${layout}`);
    },

    async createFavorite(favData) {
        const result = await this.request('/api/favorites', {
            method: 'POST',
            body: favData
        });
        if (window.ApiCache) ApiCache.invalidateFavorites();
        return result;
    },

    async updateFavorite(id, favData) {
        const result = await this.request(`/api/favorites/${id}`, {
            method: 'PUT',
            body: favData
        });
        if (window.ApiCache) ApiCache.invalidateFavorites();
        return result;
    },

    async deleteFavorite(id) {
        const result = await this.request(`/api/favorites/${id}`, { method: 'DELETE' });
        if (window.ApiCache) ApiCache.invalidateFavorites();
        return result;
    },

    async getFavoriteCategoryOrder() {
        return this.request('/api/favorites/category-order');
    },

    async saveFavoriteCategoryOrder(order) {
        return this.request('/api/favorites/category-order', {
            method: 'PUT',
            body: { order },
        });
    },

    // Global Settings (Admin)
    async getSettings() {
        return this.request('/api/settings');
    },

    async saveSettings(settingsData) {
        return this.request('/api/settings', {
            method: 'POST',
            body: settingsData
        });
    },

    // Admin Panel APIs
    async adminGetModules() {
        return this.request('/api/admin/modules');
    },

    async adminToggleModule(moduleId, enabled) {
        return this.request('/api/admin/modules/toggle', {
            method: 'POST',
            body: { module_id: moduleId, enabled }
        });
    },

    async adminGetIntegrations() {
        return this.request('/api/admin/integrations');
    },

    async adminToggleIntegration(integrationId, enabled) {
        return this.request('/api/admin/integrations/toggle', {
            method: 'POST',
            body: { integration_id: integrationId, enabled },
        });
    },

    async adminGetHealthThresholds() {
        return this.request('/api/admin/health/thresholds');
    },

    async adminSaveHealthThresholds(thresholds) {
        return this.request('/api/admin/health/thresholds', {
            method: 'POST',
            body: { thresholds },
        });
    },

    async adminGetUsers() {
        return this.request('/api/admin/users');
    },

    async adminCreateUser(userData) {
        return this.request('/api/admin/users', {
            method: 'POST',
            body: userData
        });
    },

    async adminUpdateUser(id, userData) {
        return this.request(`/api/admin/users/${id}`, {
            method: 'PUT',
            body: userData
        });
    },

    async adminDeleteUser(id) {
        return this.request(`/api/admin/users/${id}`, {
            method: 'DELETE'
        });
    },

    async adminGetAuditLogs(params = {}) {
        const qs = new URLSearchParams(params).toString();
        const url = qs ? `/api/admin/audit-logs?${qs}` : '/api/admin/audit-logs';
        return this.request(url);
    },

    async adminGetStats() {
        return this.request('/api/admin/stats');
    },

    async adminClearCache() {
        return this.request('/api/admin/cache/clear', { method: 'POST' });
    },

    async adminGetConfig() {
        return this.request('/api/admin/config');
    },

    async adminSaveConfig(body) {
        return this.request('/api/admin/config', { method: 'POST', body });
    },

    async adminGetSystem() {
        return this.request('/api/admin/system');
    },

    async adminGetHealth() {
        return this.request('/api/admin/health');
    },

    async adminExportSettings() {
        return this.request('/api/admin/backup/settings');
    },

    async adminExportAudit() {
        return this.request('/api/admin/backup/audit');
    },

    async adminTestSmtp(body) {
        return this.request('/api/admin/test/smtp', { method: 'POST', body });
    },

    async adminTestWeather(body) {
        return this.request('/api/admin/test/weather', { method: 'POST', body });
    },

    async getUserNotifications() {
        return this.request('/api/user/notifications');
    },

    async saveUserNotifications(body) {
        return this.request('/api/user/notifications', { method: 'POST', body });
    },

    async testUserNotification(channel, config) {
        return this.request('/api/user/notifications/test', {
            method: 'POST',
            body: { channel, config },
        });
    },

    async adminGetGroups() {
        return this.request('/api/admin/groups');
    },

    async adminCreateGroup(body) {
        return this.request('/api/admin/groups', { method: 'POST', body });
    },

    async adminDeleteGroup(id) {
        return this.request(`/api/admin/groups/${id}`, { method: 'DELETE' });
    },

    async adminGetJobs() {
        return this.request('/api/admin/jobs');
    },

    async adminEnqueueJob(job_type, payload = {}) {
        return this.request('/api/admin/jobs', {
            method: 'POST',
            body: { job_type, payload },
        });
    },

    async adminRestoreBackup(file) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/admin/backup/restore', {
            method: 'POST',
            body: fd,
            credentials: 'same-origin',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || res.statusText);
        return data;
    },
};

window.API = API;
