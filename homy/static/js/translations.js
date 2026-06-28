// Multi-Language Localization Engine
// Core UI strings live in homy/lang/deDE.js and homy/lang/enUS.js

const translations = {
    'en-US': {},
    'de-DE': {},
};

const CORE_LANG_FILES = {
    'de-DE': '/lang/deDE.js',
    'en-US': '/lang/enUS.js',
};

class TranslationEngine {
    constructor() {
        this.currentLocale = localStorage.getItem('locale') || 'de-DE';
        this.fallbackLocale = 'en-US';
        this._coreLangLoaded = { 'de-DE': false, 'en-US': false };
        this._coreLangPromise = null;
    }

    _injectScript(src) {
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => {
                console.warn(`Failed to load translation: ${src}`);
                resolve();
            };
            document.head.appendChild(script);
        });
    }

    async loadCoreAppTranslations() {
        if (this._coreLangPromise) return this._coreLangPromise;
        this._coreLangPromise = (async () => {
            const tasks = [];
            for (const [locale, src] of Object.entries(CORE_LANG_FILES)) {
                if (!this._coreLangLoaded[locale]) {
                    tasks.push(
                        this._injectScript(src).then(() => {
                            this._coreLangLoaded[locale] = true;
                        }),
                    );
                }
            }
            await Promise.all(tasks);
            if (!translations[this.currentLocale] || !Object.keys(translations[this.currentLocale]).length) {
                this.currentLocale = 'de-DE';
            }
        })();
        return this._coreLangPromise;
    }

    setLocale(locale) {
        if (!translations[locale] || !Object.keys(translations[locale]).length) {
            return;
        }
        this.currentLocale = locale;
        localStorage.setItem('locale', locale);

        this.loadAllModuleTranslations().then(async () => {
            await this.loadAllIntegrationTranslations();
            this.translateDOM();
            window.dispatchEvent(new CustomEvent('localeChanged', { detail: locale }));
        });
    }

    registerModuleTranslations(moduleName, locale, dict) {
        if (!translations[locale]) {
            translations[locale] = {};
        }
        Object.assign(translations[locale], dict);
    }

    async loadAllModuleTranslations() {
        if (!window.AppState || !window.AppState.modules) return;

        const locale = this.currentLocale;
        const fallback = this.fallbackLocale;

        const promises = window.AppState.modules.map(async (m) => {
            if (m.lang_files) {
                let fileToLoad = null;

                const cleanLocale = locale.replace('-', '');
                const cleanFallback = fallback.replace('-', '');

                if (m.lang_files[locale]) {
                    fileToLoad = m.lang_files[locale];
                } else if (m.lang_files[cleanLocale]) {
                    fileToLoad = m.lang_files[cleanLocale];
                } else if (m.lang_files[fallback]) {
                    fileToLoad = m.lang_files[fallback];
                } else if (m.lang_files[cleanFallback]) {
                    fileToLoad = m.lang_files[cleanFallback];
                }

                if (fileToLoad) {
                    return this._injectScript(fileToLoad);
                }
            }
            return Promise.resolve();
        });

        await Promise.all(promises);
    }

    async loadAllIntegrationTranslations(plugins) {
        const items = plugins || window.AppState?.integrationPlugins || [];
        if (!items.length) return;

        const locale = this.currentLocale;
        const fallback = this.fallbackLocale;
        const cleanLocale = locale.replace('-', '');
        const cleanFallback = fallback.replace('-', '');

        const promises = items.map(async (item) => {
            const langFiles = item.lang_files || {};
            let fileToLoad = langFiles[locale] || langFiles[cleanLocale]
                || langFiles[fallback] || langFiles[cleanFallback];
            if (!fileToLoad && item.default_language) {
                const def = String(item.default_language).replace('-', '');
                fileToLoad = langFiles[def];
            }
            if (!fileToLoad) return;
            return this._injectScript(`${fileToLoad}?v=${Date.now()}`);
        });
        await Promise.all(promises);
    }

    integrationLabel(typeId, fieldKey, fallback) {
        const key = `integration_${typeId}_${fieldKey}_label`;
        const translated = this.translate(key);
        return translated !== key ? translated : (fallback || fieldKey);
    }

    integrationFieldHelp(typeId, fieldKey, fallback) {
        if (!fallback) return '';
        const key = `integration_${typeId}_${fieldKey}_help`;
        const translated = this.translate(key);
        return translated !== key ? translated : fallback;
    }

    integrationFieldHelpLink(typeId, fieldKey, linkId, fallback) {
        const key = `integration_${typeId}_${fieldKey}_link_${linkId}`;
        const translated = this.translate(key);
        return translated !== key ? translated : fallback;
    }

    translate(key, params) {
        const bucket = translations[this.currentLocale] || {};
        const fallbackBucket = translations[this.fallbackLocale] || {};
        let text = bucket[key] || fallbackBucket[key] || key;
        if (params && typeof params === 'object') {
            Object.entries(params).forEach(([k, v]) => {
                text = text.split(`{${k}}`).join(String(v ?? ''));
            });
        }
        return text;
    }

    translateDOM(root) {
        const scope = root && root.querySelectorAll ? root : document;
        scope.querySelectorAll('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            const translation = this.translate(key);

            if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'password' || el.type === 'url' || el.type === 'search')) {
                el.placeholder = translation;
            } else if (el.tagName === 'OPTION') {
                el.textContent = translation;
            } else {
                const icon = el.querySelector('i[data-lucide]');
                if (icon) {
                    el.innerHTML = '';
                    el.appendChild(icon);
                    el.appendChild(document.createTextNode(' ' + translation));
                } else {
                    el.textContent = translation;
                }
            }
        });
        scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
            el.title = this.translate(el.getAttribute('data-i18n-title'));
        });
        scope.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
            el.setAttribute('aria-label', this.translate(el.getAttribute('data-i18n-aria-label')));
        });
        scope.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
            el.placeholder = this.translate(el.getAttribute('data-i18n-placeholder'));
        });
    }
}

window.i18n = new TranslationEngine();

document.addEventListener('DOMContentLoaded', () => {
    window.i18n.loadCoreAppTranslations().then(() => {
        window.i18n.translateDOM();
    });
});
