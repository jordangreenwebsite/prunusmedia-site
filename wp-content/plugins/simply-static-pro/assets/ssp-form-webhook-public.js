// Stub for Turnstile onload callback – must exist before the async Turnstile
// script fires; the real implementation is assigned inside the IIFE below.
if (!window.__sspTurnstileReady) {
    window.__sspTurnstileReady = function () { window.__sspTurnstileLoaded = true; };
}

(function () {
    'use strict';
    if (window.__SSP_WEBHOOK_INIT__) { return; }
    window.__SSP_WEBHOOK_INIT__ = true;

    function sspBuildConfigUrl(configPath, fileName, versionSuffix) {
        let basePath = String(configPath || '/wp-content/uploads/simply-static/configs/').trim();

        basePath = basePath.replace(/^(https?)\/\//i, '$1://');

        if (!basePath.endsWith('/')) {
            basePath += '/';
        }

        try {
            return new URL(fileName + versionSuffix, new URL(basePath, window.location.origin + '/')).toString();
        } catch (_) {
            if (/^https?:\/\//i.test(basePath)) {
                return basePath + fileName + versionSuffix;
            }

            return window.location.origin + (basePath.charAt(0) === '/' ? '' : '/') + basePath + fileName + versionSuffix;
        }
    }

    // Detect static environment early (before DOM may be fully loaded)
    const isStaticSite = () => {
        const configMeta = document.querySelector("meta[name='ssp-config-path']");
        if (configMeta) { return true; }
        if (window.location.pathname.indexOf('/static/') !== -1) { return true; }
        const originMeta = document.querySelector("meta[name='ssp-origin-url']");
        if (originMeta) {
            try {
                const originUrl = new URL(originMeta.getAttribute('content'));
                return window.location.hostname !== originUrl.hostname;
            } catch (e) { }
        }
        return false;
    };

    function completeXhr(xhr, status, responseText, statusText) {
        var responseHeaders = 'content-type: application/json\r\n';
        var getResponseHeader = function (name) {
            return String(name || '').toLowerCase() === 'content-type' ? 'application/json' : null;
        };
        var getAllResponseHeaders = function () { return responseHeaders; };
        try {
            Object.defineProperty(xhr, 'getResponseHeader', {
                value: getResponseHeader
            });
            Object.defineProperty(xhr, 'getAllResponseHeaders', {
                value: getAllResponseHeaders
            });
        } catch (e) {
            try {
                xhr.getResponseHeader = getResponseHeader;
                xhr.getAllResponseHeaders = getAllResponseHeaders;
            } catch (ignore) {}
        }
        Object.defineProperty(xhr, 'status', { get: function () { return status; } });
        Object.defineProperty(xhr, 'readyState', { get: function () { return 4; } });
        Object.defineProperty(xhr, 'responseText', { get: function () { return responseText; } });
        Object.defineProperty(xhr, 'response', { get: function () { return responseText; } });
        if (statusText) {
            Object.defineProperty(xhr, 'statusText', { get: function () { return statusText; } });
        }
        if (typeof xhr.onreadystatechange === 'function') { xhr.onreadystatechange(new Event('readystatechange')); }
        if (typeof xhr.onload === 'function') { xhr.onload(new Event('load')); }
        xhr.dispatchEvent(new Event('readystatechange'));
        xhr.dispatchEvent(new Event('load'));
        xhr.dispatchEvent(new Event('loadend'));
    }

    function sspStaticToken(prefix) {
        return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    }

    function sspSubmissionId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }

        var bytes = new Uint8Array(16);
        if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
            window.crypto.getRandomValues(bytes);
        } else {
            for (var i = 0; i < bytes.length; i++) {
                bytes[i] = Math.floor(Math.random() * 256);
            }
        }
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;

        var hex = Array.prototype.map.call(bytes, function (value) {
            return value.toString(16).padStart(2, '0');
        }).join('');
        return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' +
            hex.slice(16, 20) + '-' + hex.slice(20);
    }

    function isSimplyStaticEntriesEndpoint(url) {
        return /\/wp-json\/simplystatic\/v1\/entries\/?$/i.test(String(url || '').split('?')[0]);
    }

    function sameHost(url) {
        try {
            return new URL(url, window.location.href).hostname === window.location.hostname;
        } catch (e) {
            return false;
        }
    }

    function safeRedirectUrl(value, settings) {
        try {
            var url = new URL(String(value || ''), window.location.href);
            if (!/^https?:$/.test(url.protocol) || url.username || url.password) { return null; }

            var trustedOrigins = [window.location.origin];
            var configuredOrigins = settings && Array.isArray(settings.form_redirect_trusted_origins)
                ? settings.form_redirect_trusted_origins
                : [];

            configuredOrigins.forEach(function (origin) {
                try {
                    var trusted = new URL(String(origin));
                    if (/^https?:$/.test(trusted.protocol) && !trusted.username && !trusted.password) {
                        trustedOrigins.push(trusted.origin);
                    }
                } catch (e) { }
            });

            return trustedOrigins.indexOf(url.origin) === -1 ? null : url.toString();
        } catch (e) {
            return null;
        }
    }

    function resolveSubmitUrl(url, settings) {
        if (!settings || !settings.rest_base || !isSimplyStaticEntriesEndpoint(url) || !sameHost(url)) {
            return url;
        }

        var restBase = String(settings.rest_base);
        if (restBase.slice(-1) !== '/') { restBase += '/'; }

        return restBase + 'simplystatic/v1/entries';
    }

    // Fetch API interception: CF7 5.6+ and other modern form plugins use window.fetch
    // to submit to WP REST API endpoints (e.g., /wp-json/contact-form-7/v1/contact-forms/{id}/feedback).
    // On static sites these endpoints don't exist and return 404. We intercept and return
    // a fake success response so the plugin's JS completes normally, while SSP's own submit
    // handler (bound in initForms) sends the actual data to the configured webhook.
    if (!window.__SSP_FETCH_OVERRIDDEN__) {
        window.__SSP_FETCH_OVERRIDDEN__ = true;
        const _origFetch = window.fetch;

        window.fetch = function (resource, init) {
            if (!isStaticSite()) { return _origFetch.apply(this, arguments); }

            const url = (typeof resource === 'string') ? resource : (resource && resource.url ? resource.url : '');
            const method = (init && init.method) ? init.method.toUpperCase() : 'GET';

            // Intercept CF7 feedback submissions: POST to .../contact-form-7/v1/contact-forms/{id}/feedback
            var cf7Match = method === 'POST' && url.match(/contact-form-7\/v1\/contact-forms\/(\d+)\/feedback/);
            if (cf7Match) {
                var formId = cf7Match[1];

                // Find the CF7 form element and trigger SSP webhook submission
                var cf7Form = document.querySelector('#wpcf7-f' + formId + ' form') ||
                    document.querySelector('input[name="_wpcf7"][value="' + formId + '"]')?.closest('form');
                if (cf7Form && window.__SSP_MANAGE_FORM__) {
                    var unitTag = cf7Form.querySelector('input[name="_wpcf7_unit_tag"]');
                    var candidates = [formId];
                    if (unitTag && unitTag.value) { candidates.push(unitTag.value); }
                    window.__SSP_MANAGE_FORM__(candidates, cf7Form, (init && init.body) ? init.body : null);
                }

                // Build the `into` selector CF7 uses to locate its form container
                // for displaying the success/error message. CF7 6.x expects this to
                // be a valid CSS selector pointing to the .wpcf7 wrapper element.
                var cf7Container = cf7Form ? cf7Form.closest('.wpcf7') : null;
                var intoSelector = (cf7Container && cf7Container.id) ? '#' + cf7Container.id : '.wpcf7';
                var fakeBody = JSON.stringify({
                    status: 'mail_sent',
                    message: 'Thank you for your message. It has been sent.',
                    posted_data_hash: '',
                    into: intoSelector,
                    invalid_fields: []
                });
                return Promise.resolve(new Response(fakeBody, {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }

            // Intercept CF7 schema requests (GET before submission) to avoid 404s.
            var cf7Schema = url.match(/contact-form-7\/v1\/contact-forms\/(\d+)\/feedback\/schema/);
            if (cf7Schema) {
                return Promise.resolve(new Response(JSON.stringify({ properties: {} }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }

            // Intercept CF7 refill requests (GET after successful submission) to avoid 404s.
            var cf7Refill = url.match(/contact-form-7\/v1\/contact-forms\/(\d+)\/refill/);
            if (cf7Refill) {
                return Promise.resolve(new Response(JSON.stringify({}), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }

            // Intercept WS Form REST API POST submissions via fetch
            if (method === 'POST' && url.match(/ws-form\/v1\/submit/)) {
                var wsFormId = null;
                if (init && init.body instanceof FormData) {
                    try { wsFormId = init.body.get('wsf_form_id'); } catch (e) {}
                }
                if (!wsFormId) {
                    var wsFetchEl = document.querySelector('.wsf-form[data-id]') || document.querySelector('[id^="ws-form-"][data-id]');
                    if (wsFetchEl) { wsFormId = wsFetchEl.getAttribute('data-id'); }
                }
                if (wsFormId) {
                    var wsEl = document.querySelector('#ws-form-' + wsFormId) || document.querySelector('.wsf-form[data-id="' + wsFormId + '"]') || document.querySelector('.wsf-form');
                    if (wsEl) {
                        var wsForm = (wsEl.tagName === 'FORM') ? wsEl : wsEl.querySelector('form');
                        if (wsForm && window.__SSP_MANAGE_FORM__) {
                            window.__SSP_MANAGE_FORM__([wsFormId, 'ws-form-' + wsFormId, 'wsf-' + wsFormId], wsForm, (init && init.body) ? init.body : null);
                        }
                    }
                }
                return Promise.resolve(new Response(JSON.stringify({ error: false, data: { js: '' } }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }

            // Intercept Kadence Forms REST API submissions
            var kadenceMatch = method === 'POST' && url.match(/kadence-form\/v1\/process|kb-form\/v1\/process/);
            if (kadenceMatch) {
                if (init && init.body instanceof FormData) {
                    var kbIdFetch = null;
                    try { kbIdFetch = init.body.get('_kb_form_id'); } catch (e) {}
                    if (kbIdFetch) {
                        var kbInp = document.querySelector('input[name="_kb_form_id"][value="' + kbIdFetch + '"]');
                        var kbFormFetch = kbInp ? kbInp.closest('form') : document.querySelector('.kb-form');
                        if (kbFormFetch && window.__SSP_MANAGE_FORM__) {
                            window.__SSP_MANAGE_FORM__([kbIdFetch], kbFormFetch);
                        }
                    }
                }
                return Promise.resolve(new Response(JSON.stringify({ success: true }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                }));
            }

            return _origFetch.apply(this, arguments);
        };
    }

    // XHR-level interception: This is the lowest-level AJAX primitive and cannot
    // be bypassed by cached jQuery references, jquery-migrate wrappers, or Backbone.
    // Ninja Forms goes through: front-end.js → Backbone → jquery-migrate → $.ajax → XHR
    // Even if $.ajax override fails due to cached closures, this always catches the request.
    if (!window.__SSP_XHR_OVERRIDDEN__) {
        window.__SSP_XHR_OVERRIDDEN__ = true;
        const _origOpen = XMLHttpRequest.prototype.open;
        const _origSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url) {
            this.__sspUrl = (typeof url === 'string') ? url : String(url || '');
            this.__sspMethod = method;
            return _origOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function (body) {
            if (!isStaticSite()) { return _origSend.apply(this, arguments); }

            const url = this.__sspUrl || '';
            const isAdminAjax = url.toLowerCase().indexOf('admin-ajax.php') !== -1;

            // Intercept WS Form REST API calls via XHR (jQuery AJAX)
            var wsFormXhrMatch = url.match(/ws-form\/v1\//);
            if (wsFormXhrMatch) {
                var wsMethod = (this.__sspMethod || 'GET').toUpperCase();
                var isWsSubmit = wsMethod === 'POST' && url.match(/ws-form\/v1\/submit/);

                if (isWsSubmit) {
                    // Actual form submission — extract form ID and trigger SSP webhook
                    var wsFormIdXhr = null;
                    if (body instanceof FormData) {
                        try { wsFormIdXhr = body.get('wsf_form_id'); } catch (e) {}
                    } else if (typeof body === 'string') {
                        try { wsFormIdXhr = new URLSearchParams(body).get('wsf_form_id'); } catch (e) {}
                    }
                    if (!wsFormIdXhr) {
                        var wsAnyForm = document.querySelector('.wsf-form[data-id]') || document.querySelector('[id^="ws-form-"][data-id]');
                        if (wsAnyForm) { wsFormIdXhr = wsAnyForm.getAttribute('data-id'); }
                    }
                    if (wsFormIdXhr) {
                        var wsElXhr = document.querySelector('#ws-form-' + wsFormIdXhr) || document.querySelector('.wsf-form[data-id="' + wsFormIdXhr + '"]') || document.querySelector('.wsf-form');
                        if (wsElXhr) {
                            var wsFormXhr = (wsElXhr.tagName === 'FORM') ? wsElXhr : wsElXhr.querySelector('form');
                            if (wsFormXhr && window.__SSP_MANAGE_FORM__) {
                                window.__SSP_MANAGE_FORM__([wsFormIdXhr, 'ws-form-' + wsFormIdXhr, 'wsf-' + wsFormIdXhr], wsFormXhr, body);
                            }
                        }
                    }
                    // Return fake success for POST submit
                    var selfWsPost = this;
                    setTimeout(function () {
                        var wsResp = JSON.stringify({ error: false, data: { js: '' } });
                        Object.defineProperty(selfWsPost, 'status', { get: function () { return 200; } });
                        Object.defineProperty(selfWsPost, 'readyState', { get: function () { return 4; } });
                        Object.defineProperty(selfWsPost, 'responseText', { get: function () { return wsResp; } });
                        Object.defineProperty(selfWsPost, 'response', { get: function () { return wsResp; } });
                        if (typeof selfWsPost.onreadystatechange === 'function') { selfWsPost.onreadystatechange(new Event('readystatechange')); }
                        if (typeof selfWsPost.onload === 'function') { selfWsPost.onload(new Event('load')); }
                        selfWsPost.dispatchEvent(new Event('readystatechange'));
                        selfWsPost.dispatchEvent(new Event('load'));
                        selfWsPost.dispatchEvent(new Event('loadend'));
                    }, 0);
                    return;
                }

                // GET requests (set_globals hash lookup, config, etc.): return a 404
                // so WS Form's jQuery AJAX error callback fires and falls back to
                // inline form data (wsf_form_json[id]) for rendering.
                var selfWsGet = this;
                setTimeout(function () {
                    Object.defineProperty(selfWsGet, 'status', { get: function () { return 404; } });
                    Object.defineProperty(selfWsGet, 'readyState', { get: function () { return 4; } });
                    Object.defineProperty(selfWsGet, 'responseText', { get: function () { return ''; } });
                    Object.defineProperty(selfWsGet, 'response', { get: function () { return ''; } });
                    Object.defineProperty(selfWsGet, 'statusText', { get: function () { return 'Not Found'; } });
                    if (typeof selfWsGet.onreadystatechange === 'function') { selfWsGet.onreadystatechange(new Event('readystatechange')); }
                    if (typeof selfWsGet.onload === 'function') { selfWsGet.onload(new Event('load')); }
                    selfWsGet.dispatchEvent(new Event('readystatechange'));
                    selfWsGet.dispatchEvent(new Event('load'));
                    selfWsGet.dispatchEvent(new Event('loadend'));
                }, 0);
                return;
            }

            if (isAdminAjax) {
                // Detect which form plugin is submitting via admin-ajax.php
                let actionName = '';
                let bodyStr = '';
                if (typeof body === 'string') {
                    bodyStr = body;
                    try { actionName = new URLSearchParams(bodyStr).get('action') || ''; } catch (e) {}
                } else if (body instanceof FormData) {
                    try { actionName = body.get('action') || ''; } catch (e) {}
                }

                // Ninja Forms
                if (actionName === 'nf_ajax_submit') {
                    var nfFormId = null;
                    var nfParsed = null;
                    try { var fd = (body instanceof FormData) ? body.get('formData') : new URLSearchParams(bodyStr).get('formData'); if (fd) { nfParsed = JSON.parse(fd); nfFormId = nfParsed.id; } } catch (e) {}
                    if (nfFormId) {
                        var formEl = document.querySelector('#nf-form-' + nfFormId + '-cont form') ||
                            document.querySelector('.nf-form-cont form') ||
                            document.querySelector('.ninja-forms-form-wrap form');
                        if (formEl && window.__SSP_MANAGE_FORM__) {
                            // Build FormData from the NF JSON payload so we don't depend on
                            // DOM form inputs (which NF removes on success before async manageForm resolves).
                            var nfOrigData = new FormData();
                            nfOrigData.set('nf_form_id', String(nfFormId));
                            if (nfParsed && nfParsed.fields) {
                                try {
                                    Object.keys(nfParsed.fields).forEach(function (fid) {
                                        var f = nfParsed.fields[fid];
                                        var val = (f && f.value != null) ? String(f.value) : '';
                                        nfOrigData.set('nf-field-' + fid, val);
                                    });
                                } catch (e) {}
                            }
                            // Extract title from nfForms global (synchronous, before async manageForm)
                            if (typeof nfForms !== 'undefined' && Array.isArray(nfForms)) {
                                var nfIdStr = String(nfFormId);
                                for (var ni = 0; ni < nfForms.length; ni++) {
                                    if (String(nfForms[ni].id) === nfIdStr && nfForms[ni].settings && nfForms[ni].settings.title) {
                                        nfOrigData.set('nf_form_title', nfForms[ni].settings.title);
                                        break;
                                    }
                                }
                            }
                            window.__SSP_MANAGE_FORM__([nfFormId, 'nf-form-' + nfFormId + '-cont'], formEl, nfOrigData);
                        }
                    }
                    // Return a Ninja Forms-specific fake success response so NF JS
                    // shows the success message instead of hanging or showing errors.
                    var selfNf = this;
                    setTimeout(function () {
                        var nfResp = JSON.stringify({
                            data: {
                                actions: {
                                    success_message: 'Thanks! Your message has been sent.'
                                },
                                form_id: nfFormId || 0
                            },
                            errors: []
                        });
                        Object.defineProperty(selfNf, 'status', { get: function () { return 200; } });
                        Object.defineProperty(selfNf, 'readyState', { get: function () { return 4; } });
                        Object.defineProperty(selfNf, 'responseText', { get: function () { return nfResp; } });
                        Object.defineProperty(selfNf, 'response', { get: function () { return nfResp; } });
                        if (typeof selfNf.onreadystatechange === 'function') { selfNf.onreadystatechange(new Event('readystatechange')); }
                        if (typeof selfNf.onload === 'function') { selfNf.onload(new Event('load')); }
                        selfNf.dispatchEvent(new Event('readystatechange'));
                        selfNf.dispatchEvent(new Event('load'));
                        selfNf.dispatchEvent(new Event('loadend'));
                    }, 0);
                    return;
                }

                // WPForms
                if (actionName === 'wpforms_submit') {
                    var wpFormsId = null;
                    try { wpFormsId = (body instanceof FormData) ? body.get('wpforms[id]') : new URLSearchParams(bodyStr).get('wpforms[id]'); } catch (e) {}
                    if (wpFormsId) {
                        var wpFormEl = document.querySelector('#wpforms-form-' + wpFormsId) ||
                            document.querySelector('#wpforms-' + wpFormsId) ||
                            document.querySelector('.wpforms-form');
                        if (wpFormEl && window.__SSP_MANAGE_FORM__) {
                            window.__SSP_MANAGE_FORM__([wpFormsId, 'wpforms-form-' + wpFormsId, 'wpforms-' + wpFormsId], wpFormEl);
                        }
                    }
                    // Return a WPForms-specific fake success response with confirmation
                    // so WPForms JS shows the confirmation message instead of doing nothing.
                    var selfWp = this;
                    setTimeout(function () {
                        var wpResp = JSON.stringify({
                            success: true,
                            data: {
                                confirmation: '<div class="wpforms-confirmation-container"><p>Thanks! Your message has been sent.</p></div>'
                            }
                        });
                        Object.defineProperty(selfWp, 'status', { get: function () { return 200; } });
                        Object.defineProperty(selfWp, 'readyState', { get: function () { return 4; } });
                        Object.defineProperty(selfWp, 'responseText', { get: function () { return wpResp; } });
                        Object.defineProperty(selfWp, 'response', { get: function () { return wpResp; } });
                        if (typeof selfWp.onreadystatechange === 'function') { selfWp.onreadystatechange(new Event('readystatechange')); }
                        if (typeof selfWp.onload === 'function') { selfWp.onload(new Event('load')); }
                        selfWp.dispatchEvent(new Event('readystatechange'));
                        selfWp.dispatchEvent(new Event('load'));
                        selfWp.dispatchEvent(new Event('loadend'));
                    }, 0);
                    return;
                }

                // Forminator
                if (actionName === 'forminator_submit_form_custom-forms') {
                    var fmId = null;
                    try { fmId = (body instanceof FormData) ? body.get('form_id') : new URLSearchParams(bodyStr).get('form_id'); } catch (e) {}
                    if (fmId) {
                        var fmEl = document.querySelector('#forminator-module-' + fmId + ' form') ||
                            document.querySelector('.forminator-custom-form[data-form-id="' + fmId + '"]') ||
                            document.querySelector('.forminator-custom-form');
                        if (fmEl && window.__SSP_MANAGE_FORM__) {
                            window.__SSP_MANAGE_FORM__([fmId, 'forminator-module-' + fmId], fmEl);
                        }
                    }
                    // Return a Forminator-specific fake success response so Forminator JS
                    // shows the thank-you message and hides the form properly.
                    var selfFm = this;
                    setTimeout(function () {
                        var fmResp = JSON.stringify({
                            success: true,
                            data: {
                                success: true,
                                message: 'Thanks! Your message has been sent.',
                                behav: 'behaviour-thankyou',
                                errors: [],
                                fadeout: false,
                                fadeout_time: 0
                            }
                        });
                        Object.defineProperty(selfFm, 'status', { get: function () { return 200; } });
                        Object.defineProperty(selfFm, 'readyState', { get: function () { return 4; } });
                        Object.defineProperty(selfFm, 'responseText', { get: function () { return fmResp; } });
                        Object.defineProperty(selfFm, 'response', { get: function () { return fmResp; } });
                        if (typeof selfFm.onreadystatechange === 'function') { selfFm.onreadystatechange(new Event('readystatechange')); }
                        if (typeof selfFm.onload === 'function') { selfFm.onload(new Event('load')); }
                        selfFm.dispatchEvent(new Event('readystatechange'));
                        selfFm.dispatchEvent(new Event('load'));
                        selfFm.dispatchEvent(new Event('loadend'));
                    }, 0);
                    return;
                }

                // Fluent Forms
                if (actionName === 'fluentform_generate_protection_token') {
                    var ffTokenId = '';
                    try { ffTokenId = (body instanceof FormData) ? body.get('form_id') : new URLSearchParams(bodyStr).get('form_id'); } catch (e) {}
                    var selfFfToken = this;
                    setTimeout(function () {
                        completeXhr(selfFfToken, 200, JSON.stringify({
                            success: true,
                            data: {
                                token: sspStaticToken('ssp_ff_' + (ffTokenId || 'form'))
                            }
                        }));
                    }, 0);
                    return;
                }

                if (actionName === 'fluentform_submit') {
                    var ffId = null;
                    try { ffId = (body instanceof FormData) ? body.get('form_id') : new URLSearchParams(bodyStr).get('form_id'); } catch (e) {}
                    var ffCandidates = [];
                    if (ffId) {
                        ffCandidates = [ffId, 'fluentform_' + ffId];
                        var ffEl = document.querySelector('form.frm-fluent-form[data-form_id="' + ffId + '"]') ||
                            document.querySelector('.frm-fluent-form');
                        var ffSubmission = null;
                        if (ffEl && window.__SSP_MANAGE_FORM__) {
                            ffSubmission = window.__SSP_MANAGE_FORM__(ffCandidates, ffEl);
                        }
                    }

                    // Fluent Forms expects a specific response format. Only include redirectUrl
                    // when SSP has a configured redirect and the webhook submission succeeded.
                    var selfFf = this;
                    var sendFluentFormsResponse = function (submission) {
                        var settings = submission && submission.settings ? submission.settings : null;
                        var result = {
                            message: settings && settings.form_success_message ? settings.form_success_message : 'Thanks! Your message has been sent.',
                            action: 'hide_form'
                        };
                        var redirectUrl = settings && settings.form_redirect_url ? String(settings.form_redirect_url).trim() : '';
                        if (submission && submission.success && isSettingEnabled(settings && settings.form_use_redirect) && redirectUrl) {
                            result.redirectTo = 'customUrl';
                            result.redirectUrl = redirectUrl;
                        }

                        completeXhr(selfFf, 200, JSON.stringify({ success: true, data: { result: result } }));
                        // Hide Fluent Forms error containers that may appear after submission
                        setTimeout(function () {
                            document.querySelectorAll('[class*="fluentform_"][class*="_errors"], .ff-errors-in-stack').forEach(function (el) { el.style.display = 'none'; });
                        }, 100);
                    };

                    if (ffSubmission && typeof ffSubmission.then === 'function') {
                        ffSubmission.then(function (submission) {
                            sendFluentFormsResponse(submission);
                        }).catch(function () {
                            sendFluentFormsResponse(null);
                        });
                    } else {
                        setTimeout(function () {
                            sendFluentFormsResponse(null);
                        }, 0);
                    }
                    return;
                }

                // Kadence Forms
                if (actionName === 'kb_process_ajax_submit' || actionName === 'kb_process_advanced_form_submit') {
                    var kbId = null;
                    try { kbId = (body instanceof FormData) ? body.get('_kb_form_id') : new URLSearchParams(bodyStr).get('_kb_form_id'); } catch (e) {}
                    if (kbId) {
                        var kbEl = document.querySelector('input[name="_kb_form_id"][value="' + kbId + '"]');
                        kbEl = kbEl ? kbEl.closest('form') : document.querySelector('.kb-form');
                        if (kbEl && window.__SSP_MANAGE_FORM__) {
                            window.__SSP_MANAGE_FORM__([kbId], kbEl);
                        }
                    }
                    // Return a Kadence-specific fake success response with HTML confirmation
                    // so Kadence JS appends the message and clears the form.
                    var selfKb = this;
                    setTimeout(function () {
                        var kbResp = JSON.stringify({
                            success: true,
                            html: '<div class="kadence-blocks-form-message kadence-blocks-form-success">Thanks! Your message has been sent.</div>'
                        });
                        Object.defineProperty(selfKb, 'status', { get: function () { return 200; } });
                        Object.defineProperty(selfKb, 'readyState', { get: function () { return 4; } });
                        Object.defineProperty(selfKb, 'responseText', { get: function () { return kbResp; } });
                        Object.defineProperty(selfKb, 'response', { get: function () { return kbResp; } });
                        if (typeof selfKb.onreadystatechange === 'function') { selfKb.onreadystatechange(new Event('readystatechange')); }
                        if (typeof selfKb.onload === 'function') { selfKb.onload(new Event('load')); }
                        selfKb.dispatchEvent(new Event('readystatechange'));
                        selfKb.dispatchEvent(new Event('load'));
                        selfKb.dispatchEvent(new Event('loadend'));
                    }, 0);
                    return;
                }

                // Elementor Forms
                if (actionName === 'elementor_pro_forms_send_form') {
                    var elFormId = null;
                    try { elFormId = (body instanceof FormData) ? body.get('form_id') : new URLSearchParams(bodyStr).get('form_id'); } catch (e) {}
                    if (!elFormId) {
                        try { elFormId = (body instanceof FormData) ? body.get('form_fields[form_id]') : null; } catch (e) {}
                    }
                    if (elFormId) {
                        var elFormEl = document.querySelector('[data-id="' + elFormId + '"] form.elementor-form') ||
                            document.querySelector('form.elementor-form input[name="form_id"][value="' + elFormId + '"]')?.closest('form') ||
                            document.querySelector('form.elementor-form');
                        if (elFormEl && window.__SSP_MANAGE_FORM__) {
                            var elOrigData = (body instanceof FormData) ? body : null;
                            window.__SSP_MANAGE_FORM__([elFormId, 'elementor-form-' + elFormId], elFormEl, elOrigData);
                        }
                    }
                    // Return an Elementor-specific fake success response so Elementor JS
                    // shows a confirmation message and resets the form properly.
                    var selfEl = this;
                    setTimeout(function () {
                        var elResp = JSON.stringify({
                            success: true,
                            data: {
                                message: 'Thanks! Your message has been sent.'
                            }
                        });
                        Object.defineProperty(selfEl, 'status', { get: function () { return 200; } });
                        Object.defineProperty(selfEl, 'readyState', { get: function () { return 4; } });
                        Object.defineProperty(selfEl, 'responseText', { get: function () { return elResp; } });
                        Object.defineProperty(selfEl, 'response', { get: function () { return elResp; } });
                        if (typeof selfEl.onreadystatechange === 'function') { selfEl.onreadystatechange(new Event('readystatechange')); }
                        if (typeof selfEl.onload === 'function') { selfEl.onload(new Event('load')); }
                        selfEl.dispatchEvent(new Event('readystatechange'));
                        selfEl.dispatchEvent(new Event('load'));
                        selfEl.dispatchEvent(new Event('loadend'));
                    }, 0);
                    return;
                }

                // Gravity Forms AJAX (GF 2.9+ uses 'gform_submit_form', legacy uses 'gform_submit')
                if (actionName === 'gform_submit_form' || actionName === 'gform_submit') {
                    var gfId = null;
                    try { gfId = (body instanceof FormData) ? (body.get('gform_submit') || body.get('form_id')) : (new URLSearchParams(bodyStr).get('gform_submit') || new URLSearchParams(bodyStr).get('form_id')); } catch (e) {}
                    if (gfId) {
                        var gfEl = document.querySelector('#gform_' + gfId) || document.querySelector('#gform_wrapper_' + gfId + ' form');
                        if (gfEl && window.__SSP_MANAGE_FORM__) {
                            window.__SSP_MANAGE_FORM__([gfId, 'gform_' + gfId, 'gform_wrapper_' + gfId], gfEl);
                        }
                    }
                    // Return a Gravity Forms-specific fake success response with confirmation_markup
                    // so GF JS shows the confirmation message and hides the form properly.
                    var selfGf = this;
                    setTimeout(function () {
                        var gfResp = JSON.stringify({
                            success: true,
                            data: {
                                is_valid: true,
                                page_number: 0,
                                source_page_number: 0,
                                confirmation_markup: '<div id="gform_confirmation_wrapper_' + (gfId || '0') + '" class="gform_confirmation_wrapper"><div id="gform_confirmation_message_' + (gfId || '0') + '" class="gform_confirmation_message_' + (gfId || '0') + ' gform_confirmation_message">Thanks! Your message has been sent.</div></div>',
                                confirmation_type: 'message'
                            }
                        });
                        Object.defineProperty(selfGf, 'status', { get: function () { return 200; } });
                        Object.defineProperty(selfGf, 'readyState', { get: function () { return 4; } });
                        Object.defineProperty(selfGf, 'responseText', { get: function () { return gfResp; } });
                        Object.defineProperty(selfGf, 'response', { get: function () { return gfResp; } });
                        if (typeof selfGf.onreadystatechange === 'function') { selfGf.onreadystatechange(new Event('readystatechange')); }
                        if (typeof selfGf.onload === 'function') { selfGf.onload(new Event('load')); }
                        selfGf.dispatchEvent(new Event('readystatechange'));
                        selfGf.dispatchEvent(new Event('load'));
                        selfGf.dispatchEvent(new Event('loadend'));
                    }, 0);
                    return;
                }

                // Bricks Forms
                if (actionName === 'bricks_form_submit') {
                    var bxFormId = null;
                    try { bxFormId = (body instanceof FormData) ? (body.get('formId') || body.get('postId')) : (new URLSearchParams(bodyStr).get('formId') || new URLSearchParams(bodyStr).get('postId')); } catch (e) {}
                    if (bxFormId) {
                        var bxEl = document.querySelector('#brxe-' + bxFormId) || document.querySelector('.brxe-form');
                        var bxForm = bxEl ? ((bxEl.tagName === 'FORM') ? bxEl : bxEl.querySelector('form')) : null;
                        if (!bxForm) { bxForm = bxEl; }
                        if (bxForm && window.__SSP_MANAGE_FORM__) {
                            window.__SSP_MANAGE_FORM__([bxFormId, 'brxe-' + bxFormId], bxForm);
                        }
                    }
                    // Return a Bricks-specific fake success response so Bricks JS
                    // shows the success message and resets the form.
                    var selfBx = this;
                    setTimeout(function () {
                        var bxResp = JSON.stringify({
                            success: true,
                            data: {
                                type: 'success',
                                message: 'Thanks! Your message has been sent.'
                            }
                        });
                        Object.defineProperty(selfBx, 'status', { get: function () { return 200; } });
                        Object.defineProperty(selfBx, 'readyState', { get: function () { return 4; } });
                        Object.defineProperty(selfBx, 'responseText', { get: function () { return bxResp; } });
                        Object.defineProperty(selfBx, 'response', { get: function () { return bxResp; } });
                        if (typeof selfBx.onreadystatechange === 'function') { selfBx.onreadystatechange(new Event('readystatechange')); }
                        if (typeof selfBx.onload === 'function') { selfBx.onload(new Event('load')); }
                        selfBx.dispatchEvent(new Event('readystatechange'));
                        selfBx.dispatchEvent(new Event('load'));
                        selfBx.dispatchEvent(new Event('loadend'));
                    }, 0);
                    return;
                }

                // Block the XHR request entirely — fire error/load events so callers don't hang
                var self = this;
                setTimeout(function () {
                    var fakeResponse = '{"success":true,"data":{"message":"","data":[]}}';
                    Object.defineProperty(self, 'status', { get: function () { return 200; } });
                    Object.defineProperty(self, 'readyState', { get: function () { return 4; } });
                    Object.defineProperty(self, 'responseText', { get: function () { return fakeResponse; } });
                    Object.defineProperty(self, 'response', { get: function () { return fakeResponse; } });
                    if (typeof self.onreadystatechange === 'function') { self.onreadystatechange(new Event('readystatechange')); }
                    if (typeof self.onload === 'function') { self.onload(new Event('load')); }
                    self.dispatchEvent(new Event('readystatechange'));
                    self.dispatchEvent(new Event('load'));
                    self.dispatchEvent(new Event('loadend'));
                }, 0);
                return; // Do NOT call _origSend
            }

            return _origSend.apply(this, arguments);
        };
    }

    // Get options from JSON file.
    var form_config_element = document.querySelector("meta[name='ssp-config-path']");
    var config_path = form_config_element ? form_config_element.getAttribute("content") : '/wp-content/uploads/simply-static/configs/';
    var version_element = document.querySelector("meta[name='ssp-config-version']");
    var version_suffix = '';
    if (version_element) {
        let v = version_element.getAttribute('content');
        if (v) { version_suffix = '?ver=' + encodeURIComponent(v); }
    }
    var config_url = sspBuildConfigUrl(config_path, 'forms.json', version_suffix);

    function isSettingEnabled(value) {
        return String(value) === '1';
    }

    function maybeRedirect(settings) {
        if (!settings || !isSettingEnabled(settings.form_use_redirect)) { return false; }

        var redirectUrl = safeRedirectUrl(settings.form_redirect_url, settings);
        if (!redirectUrl) { return false; }

        window.location.replace(redirectUrl);
        return true;
    }

    function handleMessage(settings, error = false, formEl) {
        if (!error && maybeRedirect(settings)) { return; }
        if (isSettingEnabled(settings && settings.form_disable_feedback)) { return; }

        var notice = document.createElement('div');
        notice.className = 'ssp-form-response';
        notice.setAttribute('role', 'alert');
        notice.style.cssText = 'width:100%;max-width:100%;margin:0;';

        var message = document.createElement('div');
        message.className = error ? 'ssp-form-message ssp-error' : 'ssp-form-message ssp-success';
        message.style.cssText = 'width:100%;background:' + (error ? '#e24b4b' : '#58b348') + ';color:#fff;text-align:center;padding:10px;border-radius:3px;';
        var successText = settings && settings.form_success_message ? settings.form_success_message : 'Thanks! Your message has been sent.';
        var errorText = settings && settings.form_error_message ? settings.form_error_message : 'Sorry, something went wrong. Please try again.';
        message.textContent = error ? errorText : successText;
        notice.appendChild(message);

        var target = null;
        if (settings && settings.form_id) {
            try { target = document.getElementById(String(settings.form_id)); } catch (e) { }
        }
        if (!target && formEl) { target = formEl; }
        if (!target) { document.body.appendChild(notice); return; }

        if (!error) {
            try { target.style.display = 'none'; } catch (e) { }
            if (target.parentNode) {
                if (target.nextSibling) { target.parentNode.insertBefore(notice, target.nextSibling); }
                else { target.parentNode.appendChild(notice); }
            } else { document.body.appendChild(notice); }
        } else {
            if (target.parentNode) { target.parentNode.insertBefore(notice, target); }
            else { document.body.appendChild(notice); }
        }
    }

    function buildWebhookHeaders(rawHeaders) {
        var headers = new Headers();
        var raw = String(rawHeaders || '');

        if (raw.length > 32768) {
            throw new Error('Custom webhook headers are too large.');
        }

        // Newlines are unambiguous separators. For backwards compatibility,
        // commas only split when the following text looks like another header.
        var entries = raw
            ? raw.split(/\r?\n|,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+\s*:)/)
            : [];

        if (entries.length > 32) {
            throw new Error('Too many custom webhook headers.');
        }

        entries.forEach(function (entry) {
            entry = entry.trim();
            if (!entry) { return; }

            var separator = entry.indexOf(':');
            if (separator < 1) {
                throw new Error('A custom webhook header is malformed.');
            }

            var name = entry.slice(0, separator).trim();
            var value = entry.slice(separator + 1).trim();
            if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name) || name.length > 128) {
                throw new Error('A custom webhook header name is invalid.');
            }
            if (value.length > 4096 || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(value)) {
                throw new Error('A custom webhook header value is invalid.');
            }

            try {
                headers.set(name, value);
            } catch (error) {
                throw new Error('A custom webhook header was rejected by the browser.');
            }
        });

        if (!headers.has('Accept')) {
            headers.set('Accept', 'application/json');
        }

        return headers;
    }

    function submitForm(url, settings, data, formEl) {
        if (!url) {
            handleMessage(settings, true, formEl);
            return Promise.resolve({ success: false, settings: settings, form: formEl, error: 'missing_webhook_url' });
        }

        url = resolveSubmitUrl(url, settings);

		let requestData = { method: "POST", body: data, redirect: 'manual', mode: 'cors', credentials: 'omit' };
		try {
			requestData.headers = buildWebhookHeaders(settings && settings.form_custom_headers);
		} catch (error) {
			handleMessage(settings, true, formEl);
			return Promise.resolve({ success: false, settings: settings, form: formEl, error: error });
		}

        return fetch(url, requestData).then(response => {
            const isRedirectLike = response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);
            const success = response.ok || isRedirectLike;
            if (success && formEl && settings && settings.form_delivery_transport === 'studio_queue') {
                formEl.__sspQueueSubmissionId = null;
            }
            handleMessage(settings, !success, formEl);
            return { success: success, settings: settings, form: formEl, response: response };
        }).catch(error => {
            handleMessage(settings, true, formEl);
            return { success: false, settings: settings, form: formEl, error: error };
        });
    }

    function escapeSelector(value) {
        if (window.CSS && typeof window.CSS.escape === 'function') { return window.CSS.escape(value); }
        return String(value).replace(/["\\]/g, '\\$&');
    }

    function getControlLabel(control, index) {
        var label = '';
        var id = control.getAttribute('id');
        if (id) {
            var explicit = control.ownerDocument.querySelector('label[for="' + escapeSelector(id) + '"]');
            if (explicit) { label = explicit.textContent || ''; }
        }
        if (!label && control.closest('label')) { label = control.closest('label').textContent || ''; }
        if (!label) {
            var cf7Wrap = control.closest('.wpcf7-form-control-wrap');
            label = control.getAttribute('aria-label') || control.getAttribute('placeholder') || control.getAttribute('data-name') ||
                (cf7Wrap ? cf7Wrap.getAttribute('data-name') : '') || '';
        }
        label = String(label).replace(/\*/g, '').replace(/\s+/g, ' ').trim();
        if (/^[?\s]+$/.test(label)) { label = ''; }
        if (!label) { label = 'Field ' + index; }
        return label;
    }

    function uniqueFieldName(data, label, index) {
        var base = String(label).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (!base) { base = 'field_' + index; }
        var name = base;
        var suffix = 2;
        while (data.has(name)) {
            name = base + '_' + suffix;
            suffix++;
        }
        return name;
    }

    function getSyntheticFieldName(data, control, index) {
        var cf7Wrap = control.closest('.wpcf7-form-control-wrap');
        var cf7Name = cf7Wrap ? cf7Wrap.getAttribute('data-name') : '';
        if (cf7Name && !data.has(cf7Name)) {
            return cf7Name;
        }

        return uniqueFieldName(data, getControlLabel(control, index), index);
    }

    function addUnnamedFormControls(data, form) {
        if (!(data instanceof FormData) || !form) { return data; }

        var controls = form.querySelectorAll('input, textarea, select');
        var unnamedIndex = 1;
        var addedSyntheticFields = false;
        controls.forEach(function (control) {
            if (control.disabled || control.name) { return; }
            var type = (control.getAttribute('type') || control.tagName).toLowerCase();
            if (['submit', 'button', 'reset', 'image', 'file'].indexOf(type) !== -1) { return; }
            if ((type === 'checkbox' || type === 'radio') && !control.checked) { return; }

            var value = '';
            if (control.tagName === 'SELECT' && control.multiple) {
                value = Array.prototype.slice.call(control.selectedOptions).map(function (option) {
                    return option.value;
                }).filter(Boolean).join(', ');
            } else {
                value = control.value || '';
            }
            if (!value) { return; }

            data.set(getSyntheticFieldName(data, control, unnamedIndex), value);
            addedSyntheticFields = true;
            unnamedIndex++;
        });

        if (addedSyntheticFields && data.has('')) { data.delete(''); }

        return data;
    }

    function isCf7Submission(settings, form, data) {
        return !!(
            (settings && settings.form_plugin === 'cf7') ||
            (form && form.closest('.wpcf7')) ||
            (data instanceof FormData && data.has('_wpcf7'))
        );
    }

    var __SSP_FORMS_CONFIG__ = null;
    var __SSP_FORMS_CONFIG_PROMISE__ = null;

    function loadFormsConfig() {
        if (__SSP_FORMS_CONFIG__) { return Promise.resolve(__SSP_FORMS_CONFIG__); }
        if (__SSP_FORMS_CONFIG_PROMISE__) { return __SSP_FORMS_CONFIG_PROMISE__; }

        __SSP_FORMS_CONFIG_PROMISE__ = fetch(config_url)
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(json => {
                __SSP_FORMS_CONFIG__ = json;
                return json;
            }).catch(error => {
                __SSP_FORMS_CONFIG_PROMISE__ = null;
                throw error;
            });

        return __SSP_FORMS_CONFIG_PROMISE__;
    }

    function findFormSettings(json, candidateIds, form) {
        if (!Array.isArray(json)) { return null; }

        const ids = Array.isArray(candidateIds) ? candidateIds.filter(Boolean) : [candidateIds].filter(Boolean);
        const norm = (v) => (v == null ? '' : String(v).trim());
        const stripHash = (v) => norm(v).replace(/^#/, '');
        const cf7Num = (v) => { const s = norm(v), m = s.match(/wpcf7-f(\d+)-p/); return m ? m[1] : (/^\d+$/.test(s) ? s : ''); };
        const gfNum = (v) => { const s = norm(v), m = s.match(/gform(?:_wrapper)?_(\d+)/i); return m ? m[1] : (/^\d+$/.test(s) ? s : ''); };
        const foNum = (v) => { const s = norm(v), m = s.match(/forminator-(?:form|module)-(\d+)/i); return m ? m[1] : (/^\d+$/.test(s) ? s : ''); };
        const nfNum = (v) => { const s = norm(v), m = s.match(/nf-form-(\d+)-cont/); return m ? m[1] : (/^\d+$/.test(s) ? s : ''); };
        const ffNum = (v) => { const s = norm(v), m = s.match(/fluentform[_-](\d+)/i); return m ? m[1] : (/^\d+$/.test(s) ? s : ''); };

        try {
            const namedInputs = Object.create(null);
            const controls = form && form.elements
                ? Array.from(form.elements)
                : (form ? Array.from(form.querySelectorAll('input[name]')) : []);
            controls.forEach(control => {
                if (!control || String(control.tagName).toLowerCase() !== 'input' || !control.name || !control.value) return;
                if (!Object.prototype.hasOwnProperty.call(namedInputs, control.name)) {
                    namedInputs[control.name] = control.value;
                }
            });
            json.forEach(cfg => {
                if (!cfg || !cfg.form_hidden_name) return;
                const hiddenName = norm(cfg.form_hidden_name);
                if (hiddenName && Object.prototype.hasOwnProperty.call(namedInputs, hiddenName)) {
                    ids.push(namedInputs[hiddenName]);
                }
            });
        } catch (e) { }

        const normCandidates = [];
        ids.forEach(cid => {
            const a = norm(cid), b = stripHash(cid), nCf7 = cf7Num(cid), nGf = gfNum(cid), nFo = foNum(cid), nNf = nfNum(cid), nFf = ffNum(cid);
            [a, b, nCf7, nGf, nFo, nNf, nFf].forEach(v => { if (v && normCandidates.indexOf(v) === -1) normCandidates.push(v); });
        });

        return json.find(x => {
            const sidRaw = x && x.form_id, sid = stripHash(sidRaw), sCf7 = cf7Num(sidRaw), sGf = gfNum(sidRaw), sFo = foNum(sidRaw), sNf = nfNum(sidRaw), sFf = ffNum(sidRaw);
            return normCandidates.some(c => {
                const cc = stripHash(c);
                const usePartialMatch = sid && cc && !/^\d+$/.test(sid) && !/^\d+$/.test(cc);
                return sid === cc || (usePartialMatch && (sid.indexOf(cc) !== -1 || cc.indexOf(sid) !== -1)) ||
                    (sCf7 && cf7Num(cc) === sCf7) || (sGf && gfNum(cc) === sGf) || (sFo && foNum(cc) === sFo) ||
                    (sNf && nfNum(cc) === sNf) || (sFf && ffNum(cc) === sFf);
            });
        }) || null;
    }

    function manageForm(candidateIds, form, originalData) {
        // Prevent double submission: both initForms and XHR/fetch interceptors may call manageForm
        // for the same form submission. Return the in-flight promise so callers can reuse the result.
        if (form && form.__sspSubmitting) {
            return form.__sspSubmissionPromise || Promise.resolve({ success: false, skipped: true, settings: null, form: form });
        }
        if (form) {
            form.__sspSubmitting = true;
        }

        const submissionPromise = loadFormsConfig().then(json => {
            let settings = findFormSettings(json, candidateIds, form);

            if (settings) {
                let data = (originalData instanceof FormData) ? originalData : new FormData(form);
                if (isCf7Submission(settings, form, data)) {
                    data = addUnnamedFormControls(data, form);
                }
                if (!data.has('nf_form_id')) {
                    var nfWrap = form.closest('.ninja-forms-form-wrap') || form.closest('.nf-form-cont');
                    if (nfWrap && nfWrap.id) {
                        var m = nfWrap.id.match(/nf-form-(\d+)-cont/);
                        if (m && m[1]) { data.set('nf_form_id', m[1]); }
                    }
                }
                if (data.has('nf_form_id') && !data.has('nf_form_title') && typeof nfForms !== 'undefined' && Array.isArray(nfForms)) {
                    var nfIdStr = String(data.get('nf_form_id'));
                    for (var ni = 0; ni < nfForms.length; ni++) {
                        if (String(nfForms[ni].id) === nfIdStr && nfForms[ni].settings && nfForms[ni].settings.title) {
                            data.set('nf_form_title', nfForms[ni].settings.title);
                            break;
                        }
                    }
                }
                if (!data.has('elementor_form_id') && form.classList.contains('elementor-form')) {
                    var elId = data.get('form_id');
                    if (elId) { data.set('elementor_form_id', elId); }
                }
                var hasTurnstile = !!(form.querySelector('.ssp-cf-turnstile') || (form.closest('.nf-form-cont') && form.closest('.nf-form-cont').querySelector('.ssp-cf-turnstile')));
                var recaptchaInput = form.querySelector('input.g-recaptcha-response[data-sitekey]') || (form.closest('.nf-form-cont') && form.closest('.nf-form-cont').querySelector('input.g-recaptcha-response[data-sitekey]'));
                var hasRecaptcha = !!recaptchaInput;
                var restBase = (settings.rest_base && typeof settings.rest_base === 'string') ? settings.rest_base : '';
                if (restBase && restBase.slice(-1) !== '/') { restBase += '/'; }
                var targetUrl = settings.form_webhook;
                var queueTransport = settings.form_delivery_transport === 'studio_queue';
				if (settings.form_connection_id) {
					data.set('_ssp_connection_id', String(settings.form_connection_id));
				}

                if (queueTransport) {
                    if (!settings.form_queue_site_id || !settings.form_connection_id) {
                        handleMessage(settings, true, form);
                        return { success: false, settings: settings, form: form, error: 'queue_configuration_missing' };
                    }
                    form.__sspQueueSubmissionId = form.__sspQueueSubmissionId || sspSubmissionId();
                    data.set('_ssp_submission_id', form.__sspQueueSubmissionId);
                    data.set('_ssp_site_id', String(settings.form_queue_site_id));
                }

                if (settings.form_id && isSimplyStaticEntriesEndpoint(targetUrl)) {
                    data.set('_ssp_form_id', String(settings.form_id));
                }

				var requiredCaptcha = settings.form_requires_captcha_proxy && String(settings.form_requires_captcha_proxy) !== '0';
				var requiredService = String(settings.form_captcha_service || 'turnstile');
				var captchaUnavailable = requiredCaptcha && (
					(requiredService === 'recaptcha_v3' && (!hasRecaptcha || typeof grecaptcha === 'undefined')) ||
					(requiredService !== 'recaptcha_v3' && !hasTurnstile)
				);
				if (captchaUnavailable) {
					var captchaErrorSettings = Object.assign({}, settings, {
						form_error_message: 'CAPTCHA protection could not initialize for this form. Please reload the page or contact the site owner.'
					});
					handleMessage(captchaErrorSettings, true, form);
					console.error('[SSP] CAPTCHA proxy required but its form widget is unavailable.');
					return { success: false, settings: settings, form: form, error: 'captcha_widget_missing' };
				}

                if (queueTransport) {
                    if (hasTurnstile) {
                        if (!data.has('cf-turnstile-response')) {
                            var queueTsContainer = form.querySelector('.ssp-cf-turnstile') || (form.closest('.nf-form-cont') && form.closest('.nf-form-cont').querySelector('.ssp-cf-turnstile'));
                            var queueTsInput = form.querySelector('input[name="cf-turnstile-response"]') || (form.closest('.nf-form-cont') && form.closest('.nf-form-cont').querySelector('input[name="cf-turnstile-response"]'));
                            if (!queueTsInput && queueTsContainer) { queueTsInput = queueTsContainer.querySelector('input[name="cf-turnstile-response"]'); }
                            if (queueTsInput && queueTsInput.value) { data.set('cf-turnstile-response', queueTsInput.value); }
                        }
                        return submitForm(targetUrl, settings, data, form);
                    }

                    if (hasRecaptcha && typeof grecaptcha !== 'undefined') {
                        return new Promise(function (resolve) {
                            grecaptcha.ready(function () {
                                grecaptcha.execute(recaptchaInput.getAttribute('data-sitekey'), { action: 'submit' }).then(function (token) {
                                    data.set('g-recaptcha-response', token);
                                    resolve(submitForm(targetUrl, settings, data, form));
                                }).catch(function () {
                                    handleMessage(settings, true, form);
                                    resolve({ success: false, settings: settings, form: form, error: 'recaptcha_failed' });
                                });
                            });
                        });
                    }

                    return submitForm(targetUrl, settings, data, form);
                }

                if (hasTurnstile && restBase && targetUrl) {
                    if (!data.has('cf-turnstile-response')) {
                        var tsContainer = form.querySelector('.ssp-cf-turnstile') || (form.closest('.nf-form-cont') && form.closest('.nf-form-cont').querySelector('.ssp-cf-turnstile'));
                        var tsInp = form.querySelector('input[name="cf-turnstile-response"]') || (form.closest('.nf-form-cont') && form.closest('.nf-form-cont').querySelector('input[name="cf-turnstile-response"]'));
                        if (!tsInp && tsContainer) { tsInp = tsContainer.querySelector('input[name="cf-turnstile-response"]'); }
                        if (tsInp && tsInp.value) { data.set('cf-turnstile-response', tsInp.value); }
                    }
                    return submitForm(restBase + 'simplystatic/v1/turnstile/submit?forward_to=' + encodeURIComponent(targetUrl), settings, data, form);
                } else if (hasRecaptcha && restBase && targetUrl && typeof grecaptcha !== 'undefined') {
                    return new Promise(function (resolve) {
                        grecaptcha.ready(function () {
                            grecaptcha.execute(recaptchaInput.getAttribute('data-sitekey'), { action: 'submit' }).then(token => {
                                data.set('g-recaptcha-response', token);
                                resolve(submitForm(restBase + 'simplystatic/v1/recaptcha/submit?forward_to=' + encodeURIComponent(targetUrl), settings, data, form));
                            }).catch(function () {
                                handleMessage(settings, true, form);
                                resolve({ success: false, settings: settings, form: form, error: 'recaptcha_failed' });
                            });
                        });
                    });
                } else {
                    return submitForm(targetUrl, settings, data, form);
                }
            } else {
                handleMessage({ form_success_message: 'Form submitted (fallback).', form_error_message: 'Mapping error.' }, true, form);
                return { success: false, settings: null, form: form, error: 'mapping_error' };
            }

            return { success: false, settings: settings, form: form, error: 'submission_not_started' };
        }).catch(e => {
            console.error('[SSP] Config error', e);
            return { success: false, settings: null, form: form, error: e };
        });

        if (form) {
            form.__sspSubmissionPromise = submissionPromise;
            submissionPromise.then(function () {
                setTimeout(function () {
                    form.__sspSubmitting = false;
                    if (form.__sspSubmissionPromise === submissionPromise) {
                        form.__sspSubmissionPromise = null;
                    }
                }, 3000);
            }, function () {
                form.__sspSubmitting = false;
                if (form.__sspSubmissionPromise === submissionPromise) {
                    form.__sspSubmissionPromise = null;
                }
            });
        }

        return submissionPromise;
    }
    window.__SSP_MANAGE_FORM__ = manageForm;

    function getFormCandidates(form) {
        let candidates = [form.id];
        if (form.closest('.wpcf7')) candidates.push(form.closest('.wpcf7').id, form.querySelector('input[name="_wpcf7_unit_tag"]')?.value, form.querySelector('input[name="_wpcf7"]')?.value);
        if (form.querySelector('input[name="wpforms[id]"]')) candidates.push(form.querySelector('input[name="wpforms[id]"]').value);
        if (form.querySelector('input[name="wsf_form_id"]')) candidates.push(form.querySelector('input[name="wsf_form_id"]').value);
        if (form.querySelector('input[name="gform_submit"]')) candidates.push(form.querySelector('input[name="gform_submit"]').value);
        if (form.querySelector('input[name="_fluentform_id"]')) {
            const fluentFormId = form.querySelector('input[name="_fluentform_id"]').value;
            candidates.push(fluentFormId, 'fluentform_' + fluentFormId);
        }
        if (form.classList.contains('frm-fluent-form') && form.getAttribute('data-form_id')) {
            const fluentFormDataId = form.getAttribute('data-form_id');
            candidates.push(fluentFormDataId, 'fluentform_' + fluentFormDataId);
        }
        if (form.querySelector('input[name="form_id"]')) candidates.push(form.querySelector('input[name="form_id"]').value);
        if (form.querySelector('input[name="_kb_form_id"]')) candidates.push(form.querySelector('input[name="_kb_form_id"]').value);
        if (form.closest('.nf-form-cont')) {
            const nfId = form.closest('.nf-form-cont').id;
            candidates.push(nfId, nfId.match(/nf-form-(\d+)-cont/)?.[1]);
        }
        return candidates;
    }

    // Explicit Turnstile rendering: find all .ssp-cf-turnstile placeholders that
    // have not been rendered yet and call turnstile.render() on each.
    // For dynamically rendered forms (Ninja Forms, WS Form) that rebuild the DOM,
    // inject a fresh placeholder before the submit button if none exists.
    function renderTurnstileWidgets() {
        if (typeof turnstile === 'undefined') return;
        window.__sspTurnstileLoaded = true;

        // For each form on the page, ensure it has a Turnstile placeholder and render it
        var allForms = document.querySelectorAll('form');
        allForms.forEach(function (form) {
            var placeholder = form.querySelector('.ssp-cf-turnstile');

            // If no placeholder exists, check if the form's wrapper had one that was
            // lost during dynamic rendering (Ninja Forms / WS Form)
            if (!placeholder) {
                var wrapper = form.closest('.nf-form-cont') || form.closest('.ninja-forms-form-wrap') || form.closest('.wsf-form') || form.closest('.ws-form');
                if (wrapper) {
                    placeholder = wrapper.querySelector('.ssp-cf-turnstile');
                }
            }

            // For NF/WS Form: if the wrapper had a placeholder that was destroyed by
            // dynamic rendering, inject a new one inside the actual <form>
            if (!placeholder) {
                var nfWrap = form.closest('.nf-form-cont') || form.closest('.ninja-forms-form-wrap');
                var wsWrap = form.closest('.wsf-form') || form.closest('.ws-form');
                if (nfWrap || wsWrap) {
                    // Resolve sitekey from an existing widget on the page or the global config
                    var existingWidget = document.querySelector('.ssp-cf-turnstile[data-sitekey]');
                    var cfg = window.__SSP_TURNSTILE_CFG__ || {};
                    var sitekey = existingWidget ? existingWidget.getAttribute('data-sitekey') : (cfg.sitekey || '');
                    var tsTheme = existingWidget ? (existingWidget.getAttribute('data-theme') || 'auto') : (cfg.theme || 'auto');
                    var tsSize  = existingWidget ? (existingWidget.getAttribute('data-size') || 'normal') : (cfg.size || 'normal');

                    if (sitekey) {
                        placeholder = document.createElement('div');
                        placeholder.className = 'ssp-cf-turnstile';
                        placeholder.setAttribute('data-sitekey', sitekey);
                        placeholder.style.marginTop = '15px';
                        placeholder.setAttribute('data-theme', tsTheme);
                        placeholder.setAttribute('data-size', tsSize);

                        // Place before submit button or append to form
                        var submitBtn = form.querySelector('input[type="submit"], button[type="submit"]');
                        if (submitBtn && submitBtn.parentNode) {
                            submitBtn.parentNode.insertBefore(placeholder, submitBtn);
                        } else {
                            form.appendChild(placeholder);
                        }
                    }
                }
            }

            // Render the widget if it hasn't been rendered yet
            if (placeholder && !placeholder.dataset.sspRendered) {
                placeholder.dataset.sspRendered = '1';
                try {
                    turnstile.render(placeholder, {
                        sitekey: placeholder.getAttribute('data-sitekey'),
                        theme: placeholder.getAttribute('data-theme') || 'auto',
                        size: placeholder.getAttribute('data-size') || 'normal'
                    });
                } catch (e) {
                    if (typeof console !== 'undefined') {
                        console.warn('[SSP] Turnstile render error:', e.message || e);
                    }
                }
            }
        });
    }

    // The loader bootstrap is attached to the Turnstile script handle so it
    // also works when only native comments are enabled. Expose the richer form
    // renderer for that bootstrap when this asset is present.
    window.__sspRenderTurnstileWidgets = renderTurnstileWidgets;

    // Global callback invoked by Turnstile script after API loads (via ?onload= param).
    // This ensures rendering happens even when the script loads after our initForms() ran.
    // Replaces the early stub defined above the IIFE.
    window.__sspTurnstileReady = function () {
        window.__sspTurnstileLoaded = true;
        renderTurnstileWidgets();
    };

    // If Turnstile already loaded before the IIFE ran (async race), render now.
    if (window.__sspTurnstileLoaded && typeof turnstile !== 'undefined') {
        renderTurnstileWidgets();
    }

    function initForms() {
        const allFormRoots = document.querySelectorAll(".wpcf7 form, .wpcf7-form, .gform_wrapper form, .gform_wrapper, .wpforms-container form, .elementor-form, .wsf-form form, .ws-form form, .frm-fluent-form, .brxe-form, .brxe-brf-pro-forms, .wp-block-kadence-form form, .forminator-custom-form, .ninja-forms-form-wrap form, .nf-form-cont form, .ninja-forms-form-wrap, .nf-form-cont");

        allFormRoots.forEach((root) => {
            let form = (root.tagName === 'FORM') ? root : root.querySelector('form');
            if (!form || form.dataset.sspBound === '1') return;
            form.dataset.sspBound = '1';

            // Mark aria-required fields as required for HTML5 validation
            form.querySelectorAll("input, textarea, select").forEach(el => { if (el.getAttribute("aria-required") === "true") el.required = true; });

            // Gravity Forms (non-AJAX mode): GF calls form.submit() programmatically
            // which does NOT fire the 'submit' event. Override form.submit() to route
            // through manageForm instead.
            if (form.closest('.gform_wrapper')) {
                var gfOrigSubmit = form.submit;
                form.submit = function () {
                    manageForm(getFormCandidates(form), form);
                };
            }

            // WPForms (non-AJAX mode): WPForms calls form.submit() programmatically
            // which does NOT fire the 'submit' event. Override form.submit() to route
            // through manageForm instead.
            if (form.classList.contains('wpforms-form') && !form.classList.contains('wpforms-ajax-form')) {
                form.submit = function () {
                    var wpId = form.querySelector('input[name="wpforms[id]"]');
                    var candidates = [form.id];
                    if (wpId && wpId.value) { candidates.push(wpId.value, 'wpforms-form-' + wpId.value); }
                    manageForm(candidates, form);
                };
            }

            // Fallback submit handler: if native plugin JS doesn't trigger an XHR/fetch
            // (e.g. Elementor forms, or forms whose JS was not loaded), this handler catches
            // the native submit event and routes it through manageForm.
            // Skip for forms that have their own AJAX handlers (WPForms, CF7, etc.)
            // — their XHR/fetch interceptors already call manageForm.
            // GF is NOT skipped: its non-AJAX mode needs the submit listener as a safety net.
            // On static sites the native plugin JS (CF7, Fluent Forms, etc.) is usually
            // not loaded, so the fetch/XHR interceptors never fire. In that case we must
            // NOT skip these forms — the submit listener is the only path to the webhook.
            var onStatic = isStaticSite();
            var hasNativeAjax = form.classList.contains('wpforms-ajax-form') ||
                form.closest('.wpcf7') || form.classList.contains('frm-fluent-form') ||
                form.closest('.forminator-custom-form') || form.closest('.nf-form-cont') ||
                form.closest('.ninja-forms-form-wrap') || form.querySelector('input[name="wsf_form_id"]');
            if (hasNativeAjax && !onStatic) return;

            form.addEventListener("submit", function (ev) {
                if (typeof form.checkValidity === 'function' && !form.checkValidity()) return;
                var visibleError = Array.prototype.slice.call(form.querySelectorAll('.ssp-field-error')).some(function (el) { return el.offsetParent !== null || el.style.display !== 'none'; });
                if (visibleError) return;
                ev.preventDefault(); ev.stopImmediatePropagation();
                manageForm(getFormCandidates(form), form);
            }, false);
        });
    }

    // Dynamic form population from URL query parameters.
    // Reads all URL params and pre-selects/fills matching form fields on the
    // static site. Works with any form plugin (Gravity Forms, WPForms, CF7,
    // Fluent Forms, Elementor, etc.) by matching params against field names
    // and values.
    function populateFormsFromURL() {
        if (!isStaticSite()) return;
        var params = new URLSearchParams(window.location.search);
        if (!params.toString()) return;

        var forms = document.querySelectorAll('form');
        if (!forms.length) return;

        params.forEach(function(val, key) {
            var valLower = val.toLowerCase();
            var keyLower = key.toLowerCase();

            forms.forEach(function(form) {
                var matched = false;

                // 1. Radio buttons: prefer name-based match, fall back to value-based
                var radios = form.querySelectorAll('input[type="radio"]');
                // Try matching by name attribute first (e.g. name="als" with value matching param value)
                radios.forEach(function(r) {
                    if (r.name.toLowerCase() === keyLower && r.value.toLowerCase() === valLower) {
                        r.checked = true;
                        r.click();
                        matched = true;
                    }
                });
                // Fall back: match by value alone (GF-style, where names are auto-generated like input_32)
                if (!matched) {
                    radios.forEach(function(r) {
                        if (r.value.toLowerCase() === valLower) {
                            r.checked = true;
                            r.click();
                            matched = true;
                        }
                    });
                }
                if (matched) return;

                // 2. Select elements: prefer name-based match, fall back to value-based
                var selects = form.querySelectorAll('select');
                selects.forEach(function(sel) {
                    if (matched) return;
                    var nameMatch = sel.name.toLowerCase() === keyLower;
                    for (var i = 0; i < sel.options.length; i++) {
                        if ((nameMatch || sel.options[i].value.toLowerCase() === valLower) &&
                            sel.options[i].value.toLowerCase() === valLower) {
                            sel.value = sel.options[i].value;
                            sel.dispatchEvent(new Event('change', {bubbles: true}));
                            matched = true;
                            break;
                        }
                    }
                });
                if (matched) return;

                // 3. Checkbox inputs: prefer name-based match, fall back to value-based
                var checkboxes = form.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(function(c) {
                    var nameMatch = c.name.toLowerCase() === keyLower ||
                        c.name.toLowerCase().replace(/\[\]$/, '') === keyLower;
                    if (nameMatch && c.value.toLowerCase() === valLower) {
                        c.checked = true;
                        c.dispatchEvent(new Event('change', {bubbles: true}));
                        matched = true;
                    } else if (!matched && c.value.toLowerCase() === valLower) {
                        c.checked = true;
                        c.dispatchEvent(new Event('change', {bubbles: true}));
                    }
                });
                if (matched) return;

                // 4. Text-like inputs (text, email, tel, url, number, hidden, textarea):
                //    match by name attribute = URL param key
                var textFields = form.querySelectorAll(
                    'input[type="text"], input[type="email"], input[type="tel"], ' +
                    'input[type="url"], input[type="number"], input[type="hidden"], textarea'
                );
                textFields.forEach(function(f) {
                    if (matched) return;
                    if (f.name.toLowerCase() === keyLower) {
                        f.value = val;
                        f.dispatchEvent(new Event('input', {bubbles: true}));
                        f.dispatchEvent(new Event('change', {bubbles: true}));
                        matched = true;
                    }
                });
            });
        });
    }

    const runAll = () => {
        if (window.__SSP_WEBHOOK_RUNNING__) return;
        window.__SSP_WEBHOOK_RUNNING__ = true;
        initForms();
        renderTurnstileWidgets();
        populateFormsFromURL();
        if (typeof MutationObserver !== 'undefined') {
            new MutationObserver(() => { initForms(); renderTurnstileWidgets(); }).observe(document.body, { childList: true, subtree: true });
        }
        // Ninja Forms renders via Backbone after DOMContentLoaded; re-bind when its forms are ready.
        document.addEventListener('nfFormReady', () => { initForms(); renderTurnstileWidgets(); });
        // GF fires gform_post_render after conditional logic is initialized;
        // re-run population so conditionally-shown fields get their values set.
        if (window.jQuery) {
            jQuery(document).on('gform_post_render', function() {
                setTimeout(populateFormsFromURL, 50);
            });
        }
    };

    if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", runAll); }
    else { runAll(); }
})();
