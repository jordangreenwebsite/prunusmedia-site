function WPML_Integration() {

    var languages = {};
    var self = this;

    /**
     * Start the Integration.
     */
    this.start = function start() {
        languages = this.getLanguagesInSwitcher();

        this.registerSwitcher();
        this.switchToClientLanguage();
    }

    /**
     * Redirect to an URL.
     *
     * @param href Full URL.
     */
	    this.redirectTo = function redirectTo(href) {
	        var safeHref = this.getSafeLanguageUrl(href);
	        if (!safeHref) {
	            return false;
	        }

	        window.location.replace(safeHref);
	        return true;
	    }

	    /**
	     * Allow same-origin HTTP(S) URLs and explicitly trusted WPML language origins.
	     */
	    this.getSafeLanguageUrl = function getSafeLanguageUrl(href) {
	        try {
	            var url = new URL(String(href || ''), window.location.origin + '/');
	            if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
	                return '';
	            }

	            var trusted = [window.location.origin];
	            if (window.ssp_wpml_geo && Array.isArray(window.ssp_wpml_geo.trusted_origins)) {
	                window.ssp_wpml_geo.trusted_origins.forEach(function(origin) {
	                    try {
	                        var parsed = new URL(origin, window.location.origin + '/');
	                        if (/^https?:$/.test(parsed.protocol) && !parsed.username && !parsed.password) {
	                            trusted.push(parsed.origin);
	                        }
	                    } catch (_) {}
	                });
	            }

	            return trusted.indexOf(url.origin) !== -1 ? url.toString() : '';
	        } catch (_) {
	            return '';
	        }
	    }

    /**
     * Get the stored Language from cookie.
     *
     * @returns {string}
     */
    this.getStoredLanguage = function getStoredLanguage() {
        return this.normalizeLanguage(this.getCookie('simply_static_lang'));
    }

    /**
     * Store a new language in cookie.
     *
     * @param lang Abbreviation of a language (en, de, hr).
     */
    this.storeLanguage = function storeLanguage(lang) {
        lang = this.normalizeLanguage(lang);
        return lang ? this.setCookie('simply_static_lang', lang, 30) : false;
    }

    /** Normalize a conservative BCP47-style language tag for keys/cookies. */
    this.normalizeLanguage = function normalizeLanguage(lang) {
        lang = String(lang || '').trim().replace(/_/g, '-');
        if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(lang)) {
            return '';
        }

        return lang.toLowerCase();
    }

    /**
     * Get the current language of the page.
     *
     * @returns string|null
     */
    this.getCurrentPageLanguage = function getCurrentPageLanguage() {
        var lang = this.getLanguageFromHref(window.location.href);

        if (!lang) {
            var htmlLang = document.getElementsByTagName('html')[0].getAttribute('lang');
            if (htmlLang) {
                lang = htmlLang.substring(0, 2);
            }
        }
        return lang
    }

    /**
     * Switch to Client Language.
     *
     * @returns {boolean}
     */
    this.switchToClientLanguage = function switchToClientLanguage() {
        // No other present languages for the current page, skip it.
        if (Object.keys(languages).length < 1) {
            return false;
        }

        // Current Browser Language.
        let current_language = this.normalizeLanguage(navigator.language).substring(0, 2);

        if (this.getStoredLanguage()) {
            // We have the stored language, let's find if we're on it.
            if (this.getStoredLanguage() !== this.getCurrentPageLanguage()) {
                var href = languages[this.getStoredLanguage()] || '';
                if (!href) {
                    return;
                }
                this.redirectTo(href);
            }
            return;
        }

        // Find the current language from all languages on the page and redirect to it.
        for (const [key, value] of Object.entries(languages)) {
            if (key === current_language) {
                this.redirectToNewLanguage(key, value);
            }
        }
    }

    /**
     * Redirect to the new language and store the language.
     *
     * @param lang
     * @param href
     */
    this.redirectToNewLanguage = function redirectToNewLanguage(lang, href) {
        this.storeLanguage(lang);
        this.redirectTo(href);
    }

    /**
     * Register "Switch" method to be triggered by each language click.
     */
    this.registerSwitcher = function registerSwitcher() {
        var links = document.getElementsByClassName('wpml-ls-link');

        for (var l = 0; l < links.length; l++) {
            var link = links[l];

            link.addEventListener('click', this.maybeSwitchLanguage);
        }
    }

    /**
     * Return the language from the URL if we have that URL related to a language in the switcher.
     *
     * @param href
     * @returns {string}
     */
    this.getLanguageFromHref = function getLanguageFromHref(href) {
        if (Object.keys(languages).length < 1) {
            return this.getCurrentLanguage();
        }

        for (var lang in languages) {
            var langHref = languages[lang];

            if (href === langHref) {
                return lang;
            }
        }

        return '';
    }

    /**
     * Maybe switch to a new language.
     * @param event
     * @returns {boolean}
     */
    this.maybeSwitchLanguage = function maybeSwitchLanguage(event) {
        var link = null;
        if (!event.target.classList.contains('wpml-ls-link')) {
            link = event.target.parentElement;
        } else {
            link = event.target;
        }

	        var href = link.getAttribute('href');
	        if (!self.getSafeLanguageUrl(href)) {
	            try { event.preventDefault(); } catch (_) {}
	            return false;
	        }
	        var lang = self.getLanguageFromHref(href);

        if (!lang) {
            return true;
        }

        if (lang === self.getCurrentLanguage()) {
            return true;
        }

        self.storeLanguage(lang);
    }

    /**
     * Get Languages in the WPML Switcher.
     *
     * @returns {*}
     */
    this.getLanguagesInSwitcher = function getLanguagesInSwitcher() {
        // Collect language links.
        let languages_links = {};
        let languages = document.getElementsByClassName('wpml-ls-native');


        for (const language of languages) {
            let language_tag = language.getAttribute('lang');
            let language_href = language.parentElement.getAttribute('href');

            // Avada.
            if (!language_href) {
                language_href = language.parentElement.parentElement.getAttribute('href');
            }

	            language_href = this.getSafeLanguageUrl(language_href);

	            // We may need to modify the tag.
	            if (language_tag && language_href) {
	                language_tag = this.normalizeLanguage(language_tag);
	                if (!language_tag) {
	                    continue;
	                }
	                if (language_tag.includes("-")) {
	                    let parts = language_tag.split('-');
	                    languages_links[parts[0]] = language_href;
	                } else {
                    languages_links[language_tag] = language_href;
                }
            }
        }

        return languages_links;
    }

    /**
     * Set a Cookie
     *
     * @param cname
     * @param cvalue
     * @param exdays
     */
    this.setCookie = function setCookie(cname, cvalue, exdays) {
        if (!/^[A-Za-z0-9_-]+$/.test(String(cname || ''))) {
            return false;
        }

        cvalue = this.normalizeLanguage(cvalue);
        if (!cvalue) {
            return false;
        }

        const d = new Date();
        d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
        let expires = "expires=" + d.toUTCString();
        let secure = window.location.protocol === 'https:' ? ';Secure' : '';
        document.cookie = cname + "=" + encodeURIComponent(cvalue) + ";" + expires + ";path=/;SameSite=Lax" + secure;
        return true;
    }

    /**
     * Get a Cookie.
     *
     * @param cname
     * @returns {string}
     */
    this.getCookie = function getCookie(cname) {
        let name = cname + "=";
        let ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) == ' ') {
                c = c.substring(1);
            }
            if (c.indexOf(name) == 0) {
                try {
                    return decodeURIComponent(c.substring(name.length, c.length));
                } catch (_) {
                    return '';
                }
            }
        }
        return "";
    }

    /**
     * Get Current Language.
     *
     * @returns {string|string}
     */
    this.getCurrentLanguage = function getCurrentLanguage() {
        return this.getStoredLanguage();
    }

    this.start();

    return this;
}

window.simply_static_wpml = new WPML_Integration();
