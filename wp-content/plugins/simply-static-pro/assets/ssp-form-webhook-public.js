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

    function settleManagedSubmission(submission) {
        return Promise.resolve(submission).then(function (result) {
            return {
                accepted: !!(result && result.success === true),
                result: result || null
            };
        }, function () {
            return { accepted: false, result: null };
        });
    }

    function managedSubmissionMessage(outcome) {
        var settings = outcome && outcome.result && outcome.result.settings
            ? outcome.result.settings
            : null;
        var key = outcome && outcome.accepted ? 'form_success_message' : 'form_error_message';
        var fallback = outcome && outcome.accepted
            ? 'Thanks! Your message has been sent.'
            : 'Sorry, something went wrong. Please try again.';
        return settings && settings[key] ? String(settings[key]) : fallback;
    }

    function escapeManagedResponseHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function (character) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            }[character];
        });
    }

    function managedProviderPayload(provider, outcome, context) {
        context = context || {};
        var accepted = !!(outcome && outcome.accepted);
        var message = managedSubmissionMessage(outcome);
        var escapedMessage = escapeManagedResponseHtml(message);
        var formId = context.formId || '0';
        var escapedFormId = escapeManagedResponseHtml(formId);

        switch (provider) {
            case 'cf7':
                return {
                    status: accepted ? 'mail_sent' : 'mail_failed',
                    message: message,
                    posted_data_hash: '',
                    into: context.into || '.wpcf7',
                    invalid_fields: []
                };
            case 'ws_form':
                return accepted
                    ? { error: false, data: { js: '' } }
                    : { error: true, data: { message: message } };
            case 'kadence_forms':
                if (context.rest) {
                    return accepted ? { success: true } : { success: false, message: message };
                }
                return accepted
                    ? {
                        success: true,
                        html: '<div class="kadence-blocks-form-message kadence-blocks-form-success">' + escapedMessage + '</div>'
                    }
                    : {
                        success: false,
                        html: '<div class="kadence-blocks-form-message kadence-blocks-form-error">' + escapedMessage + '</div>',
                        message: message
                    };
            case 'ninja_forms':
                return accepted
                    ? {
                        data: {
                            actions: { success_message: message },
                            form_id: formId
                        },
                        errors: []
                    }
                    : {
                        data: { form_id: formId },
                        errors: [ { message: message } ]
                    };
            case 'wp_forms':
                return accepted
                    ? {
                        success: true,
                        data: {
                            confirmation: '<div class="wpforms-confirmation-container"><p>' + escapedMessage + '</p></div>'
                        }
                    }
                    : { success: false, data: { message: message } };
            case 'forminator':
                return accepted
                    ? {
                        success: true,
                        data: {
                            success: true,
                            message: message,
                            behav: 'behaviour-thankyou',
                            errors: [],
                            fadeout: false,
                            fadeout_time: 0
                        }
                    }
                    : {
                        success: false,
                        data: { success: false, message: message, errors: [] }
                    };
            case 'fluent_forms':
                if (!accepted) {
                    return { success: false, data: { message: message } };
                }
                var settings = outcome.result && outcome.result.settings ? outcome.result.settings : null;
                var result = { message: message, action: 'hide_form' };
                var redirectUrl = settings && settings.form_redirect_url
                    ? safeRedirectUrl(settings.form_redirect_url, settings)
                    : null;
                if (isSettingEnabled(settings && settings.form_use_redirect) && redirectUrl) {
                    result.redirectTo = 'customUrl';
                    result.redirectUrl = redirectUrl;
                }
                return { success: true, data: { result: result } };
            case 'elementor_forms':
                return accepted
                    ? { success: true, data: { message: message } }
                    : { success: false, data: { message: message, errors: [] } };
            case 'gravity_forms':
                return accepted
                    ? {
                        success: true,
                        data: {
                            is_valid: true,
                            page_number: 0,
                            source_page_number: 0,
                            confirmation_markup: '<div id="gform_confirmation_wrapper_' + escapedFormId + '" class="gform_confirmation_wrapper"><div id="gform_confirmation_message_' + escapedFormId + '" class="gform_confirmation_message_' + escapedFormId + ' gform_confirmation_message">' + escapedMessage + '</div></div>',
                            confirmation_type: 'message'
                        }
                    }
                    : {
                        success: false,
                        data: { is_valid: false, message: message, validation_messages: {} }
                    };
            case 'bricks_forms':
                return accepted
                    ? { success: true, data: { type: 'success', message: message } }
                    : { success: false, data: { type: 'danger', message: message } };
            default:
                return { success: accepted, data: { message: message } };
        }
    }

    function managedFetchResponse(provider, submission, context) {
        return settleManagedSubmission(submission).then(function (outcome) {
            return new Response(JSON.stringify(managedProviderPayload(provider, outcome, context)), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        });
    }

    function completeManagedXhr(provider, xhr, submission, context) {
        return settleManagedSubmission(submission).then(function (outcome) {
            completeXhr(xhr, 200, JSON.stringify(managedProviderPayload(provider, outcome, context)));
        });
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
    // On static sites these endpoints don't exist and return 404. We intercept them,
    // wait for SSP's managed submission, and then return the matching plugin-native
    // success or failure response so the plugin UI cannot acknowledge lost data.
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
                var cf7Submission = null;

                // Find the CF7 form element and trigger SSP webhook submission
                var cf7Form = document.querySelector('#wpcf7-f' + formId + ' form') ||
                    document.querySelector('input[name="_wpcf7"][value="' + formId + '"]')?.closest('form');
                if (cf7Form && window.__SSP_MANAGE_FORM__) {
                    var unitTag = cf7Form.querySelector('input[name="_wpcf7_unit_tag"]');
                    var candidates = [formId];
                    if (unitTag && unitTag.value) { candidates.push(unitTag.value); }
                    cf7Submission = window.__SSP_MANAGE_FORM__(candidates, cf7Form, (init && init.body) ? init.body : null);
                }

                // Build the `into` selector CF7 uses to locate its form container
                // for displaying the success/error message. CF7 6.x expects this to
                // be a valid CSS selector pointing to the .wpcf7 wrapper element.
                var cf7Container = cf7Form ? cf7Form.closest('.wpcf7') : null;
                var intoSelector = (cf7Container && cf7Container.id) ? '#' + cf7Container.id : '.wpcf7';
                return managedFetchResponse('cf7', cf7Submission, { into: intoSelector });
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
                var wsSubmission = null;
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
                            wsSubmission = window.__SSP_MANAGE_FORM__([wsFormId, 'ws-form-' + wsFormId, 'wsf-' + wsFormId], wsForm, (init && init.body) ? init.body : null);
                        }
                    }
                }
                return managedFetchResponse('ws_form', wsSubmission, { formId: wsFormId || '0' });
            }

            // Intercept Kadence Forms REST API submissions
            var kadenceMatch = method === 'POST' && url.match(/kadence-form\/v1\/process|kb-form\/v1\/process/);
            if (kadenceMatch) {
                var kbSubmissionFetch = null;
                if (init && init.body instanceof FormData) {
                    var kbIdFetch = null;
                    try { kbIdFetch = init.body.get('_kb_form_id'); } catch (e) {}
                    if (kbIdFetch) {
                        var kbInp = document.querySelector('input[name="_kb_form_id"][value="' + kbIdFetch + '"]');
                        var kbFormFetch = kbInp ? kbInp.closest('form') : document.querySelector('.kb-form');
                        if (kbFormFetch && window.__SSP_MANAGE_FORM__) {
                            kbSubmissionFetch = window.__SSP_MANAGE_FORM__([kbIdFetch], kbFormFetch);
                        }
                    }
                }
                return managedFetchResponse('kadence_forms', kbSubmissionFetch, {
                    formId: kbIdFetch || '0',
                    rest: true
                });
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
                    var wsSubmissionXhr = null;
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
                                wsSubmissionXhr = window.__SSP_MANAGE_FORM__([wsFormIdXhr, 'ws-form-' + wsFormIdXhr, 'wsf-' + wsFormIdXhr], wsFormXhr, body);
                            }
                        }
                    }
                    completeManagedXhr('ws_form', this, wsSubmissionXhr, { formId: wsFormIdXhr || '0' });
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
                    var nfSubmission = null;
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
                            // Ninja serializes ordinary values into formData, but File
                            // objects remain on the live DOM controls. Capture them now,
                            // before Ninja clears the form after its AJAX callback.
                            nfOrigData = appendSelectedFileInputs(nfOrigData, formEl, body);
                            nfSubmission = window.__SSP_MANAGE_FORM__([nfFormId, 'nf-form-' + nfFormId + '-cont'], formEl, nfOrigData);
                        }
                    }
                    completeManagedXhr('ninja_forms', this, nfSubmission, { formId: nfFormId || '0' });
                    return;
                }

                // WPForms
                if (actionName === 'wpforms_submit') {
                    var wpFormsId = null;
                    var wpFormsSubmission = null;
                    try { wpFormsId = (body instanceof FormData) ? body.get('wpforms[id]') : new URLSearchParams(bodyStr).get('wpforms[id]'); } catch (e) {}
                    if (wpFormsId) {
                        var wpFormEl = document.querySelector('#wpforms-form-' + wpFormsId) ||
                            document.querySelector('#wpforms-' + wpFormsId) ||
                            document.querySelector('.wpforms-form');
                        if (wpFormEl && window.__SSP_MANAGE_FORM__) {
                            wpFormsSubmission = window.__SSP_MANAGE_FORM__([wpFormsId, 'wpforms-form-' + wpFormsId, 'wpforms-' + wpFormsId], wpFormEl);
                        }
                    }
                    completeManagedXhr('wp_forms', this, wpFormsSubmission, { formId: wpFormsId || '0' });
                    return;
                }

                // Forminator
                if (actionName === 'forminator_submit_form_custom-forms') {
                    var fmId = null;
                    var fmSubmission = null;
                    try { fmId = (body instanceof FormData) ? body.get('form_id') : new URLSearchParams(bodyStr).get('form_id'); } catch (e) {}
                    if (fmId) {
                        var fmEl = document.querySelector('#forminator-module-' + fmId + ' form') ||
                            document.querySelector('.forminator-custom-form[data-form-id="' + fmId + '"]') ||
                            document.querySelector('.forminator-custom-form');
                        if (fmEl && window.__SSP_MANAGE_FORM__) {
                            fmSubmission = window.__SSP_MANAGE_FORM__([fmId, 'forminator-module-' + fmId], fmEl);
                        }
                    }
                    completeManagedXhr('forminator', this, fmSubmission, { formId: fmId || '0' });
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
                    var ffSubmission = null;
                    try { ffId = (body instanceof FormData) ? body.get('form_id') : new URLSearchParams(bodyStr).get('form_id'); } catch (e) {}
                    var ffCandidates = [];
                    if (ffId) {
                        ffCandidates = [ffId, 'fluentform_' + ffId];
                        var ffEl = document.querySelector('form.frm-fluent-form[data-form_id="' + ffId + '"]') ||
                            document.querySelector('.frm-fluent-form');
                        if (ffEl && window.__SSP_MANAGE_FORM__) {
                            ffSubmission = window.__SSP_MANAGE_FORM__(ffCandidates, ffEl);
                        }
                    }
                    completeManagedXhr('fluent_forms', this, ffSubmission, { formId: ffId || '0' });
                    return;
                }

                // Kadence Forms
                if (actionName === 'kb_process_ajax_submit' || actionName === 'kb_process_advanced_form_submit') {
                    var kbId = null;
                    var kbSubmission = null;
                    try { kbId = (body instanceof FormData) ? body.get('_kb_form_id') : new URLSearchParams(bodyStr).get('_kb_form_id'); } catch (e) {}
                    if (kbId) {
                        var kbEl = document.querySelector('input[name="_kb_form_id"][value="' + kbId + '"]');
                        kbEl = kbEl ? kbEl.closest('form') : document.querySelector('.kb-form');
                        if (kbEl && window.__SSP_MANAGE_FORM__) {
                            kbSubmission = window.__SSP_MANAGE_FORM__([kbId], kbEl);
                        }
                    }
                    completeManagedXhr('kadence_forms', this, kbSubmission, { formId: kbId || '0' });
                    return;
                }

                // Elementor Forms
                if (actionName === 'elementor_pro_forms_send_form') {
                    var elFormId = null;
                    var elSubmission = null;
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
                            elSubmission = window.__SSP_MANAGE_FORM__([elFormId, 'elementor-form-' + elFormId], elFormEl, elOrigData);
                        }
                    }
                    completeManagedXhr('elementor_forms', this, elSubmission, { formId: elFormId || '0' });
                    return;
                }

                // Gravity Forms AJAX (GF 2.9+ uses 'gform_submit_form', legacy uses 'gform_submit')
                if (actionName === 'gform_submit_form' || actionName === 'gform_submit') {
                    var gfId = null;
                    var gfSubmission = null;
                    try { gfId = (body instanceof FormData) ? (body.get('gform_submit') || body.get('form_id')) : (new URLSearchParams(bodyStr).get('gform_submit') || new URLSearchParams(bodyStr).get('form_id')); } catch (e) {}
                    if (gfId) {
                        var gfEl = document.querySelector('#gform_' + gfId) || document.querySelector('#gform_wrapper_' + gfId + ' form');
                        if (gfEl && window.__SSP_MANAGE_FORM__) {
                            gfSubmission = window.__SSP_MANAGE_FORM__([gfId, 'gform_' + gfId, 'gform_wrapper_' + gfId], gfEl);
                        }
                    }
                    completeManagedXhr('gravity_forms', this, gfSubmission, { formId: gfId || '0' });
                    return;
                }

                // Bricks Forms
                if (actionName === 'bricks_form_submit') {
                    var bxFormId = null;
                    var bxSubmission = null;
                    try { bxFormId = (body instanceof FormData) ? (body.get('formId') || body.get('postId')) : (new URLSearchParams(bodyStr).get('formId') || new URLSearchParams(bodyStr).get('postId')); } catch (e) {}
                    if (bxFormId) {
                        var bxEl = document.querySelector('#brxe-' + bxFormId) || document.querySelector('.brxe-form');
                        var bxForm = bxEl ? ((bxEl.tagName === 'FORM') ? bxEl : bxEl.querySelector('form')) : null;
                        if (!bxForm) { bxForm = bxEl; }
                        if (bxForm && window.__SSP_MANAGE_FORM__) {
                            bxSubmission = window.__SSP_MANAGE_FORM__([bxFormId, 'brxe-' + bxFormId], bxForm);
                        }
                    }
                    completeManagedXhr('bricks_forms', this, bxSubmission, { formId: bxFormId || '0' });
                    return;
                }

				// Unknown admin-ajax actions may be unrelated plugin requests. Preserve
				// their real response instead of acknowledging delivery that never ran.
				return _origSend.apply(this, arguments);
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

        // Older Form Connections could serialize an empty repeater as a lone
        // comma. Preserve strict validation for real entries while treating
        // delimiter-only legacy values as the empty header list they represent.
        if (/^[\s,]*$/.test(raw)) {
            raw = '';
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

    function appendSelectedFileInputs(data, form, interceptedData) {
        if (!(data instanceof FormData)) { return data; }
        var filesByField = Object.create(null);
        var interceptedFileFields = Object.create(null);
        var collectFile = function (fieldName, file) {
            fieldName = String(fieldName || '').trim();
            if (!fieldName || typeof File === 'undefined' || !(file instanceof File) || file.size < 1) { return; }
            filesByField[fieldName] = filesByField[fieldName] || [];
            filesByField[fieldName].push(file);
        };
        if (interceptedData instanceof FormData) {
            interceptedData.forEach(function (value, fieldName) {
                if (typeof File !== 'undefined' && value instanceof File && value.size > 0) {
                    interceptedFileFields[String(fieldName || '').trim()] = true;
                }
                collectFile(fieldName, value);
            });
        }
        if (form && typeof form.querySelectorAll === 'function') {
            form.querySelectorAll('input[type="file"]').forEach(function (input) {
                if (input.disabled) { return; }
                var fieldName = String(input.name || input.id || '').trim();
                // The intercepted request is authoritative when it already contains
                // files for this field; DOM fallback exists for Ninja versions that
                // serialize only scalar JSON into the request body.
                if (!fieldName || interceptedFileFields[fieldName]) { return; }
                Array.prototype.forEach.call(input.files || [], function (file) {
                    collectFile(fieldName, file);
                });
            });
        }
        Object.keys(filesByField).forEach(function (fieldName) {
            data.delete(fieldName);
            filesByField[fieldName].forEach(function (file) {
                data.append(fieldName, file, file.name);
            });
        });
        return data;
    }

    function queuedFileEntries(data) {
        var files = [];
        if (!(data instanceof FormData)) { return files; }
        var position = 0;
        data.forEach(function (value, fieldName) {
            if (!(value instanceof File) || value.size < 1) { return; }
            files.push({ position: position++, fieldName: String(fieldName), file: value });
        });
        return files;
    }

    function queueSubmissionData(data, attachmentIds) {
        var clean = new FormData();
        data.forEach(function (value, fieldName) {
            if (!(value instanceof File)) { clean.append(fieldName, value); }
        });
        clean.set('_ssp_attachments', JSON.stringify(attachmentIds));
        return clean;
    }

    function sha256File(file) {
        if (!window.crypto || !window.crypto.subtle || typeof file.arrayBuffer !== 'function') {
            return Promise.reject(new Error('This browser cannot verify attachment integrity.'));
        }
        return file.arrayBuffer().then(function (bytes) {
            return window.crypto.subtle.digest('SHA-256', bytes);
        }).then(function (digest) {
            return Array.prototype.map.call(new Uint8Array(digest), function (value) {
                return value.toString(16).padStart(2, '0');
            }).join('');
        });
    }

    function resolveAttachmentEndpoint(settings, submitUrl) {
        var configured = settings && settings.form_attachment_endpoint
            ? String(settings.form_attachment_endpoint)
            : '';
        try {
            var submit = new URL(String(submitUrl || ''), window.location.href);
            var upload = configured ? new URL(configured, window.location.href) : new URL(submit.toString());
            if (!configured) {
                upload.pathname = upload.pathname.replace(/\/form-submit\/?$/, '/form-upload');
                upload.search = '';
                upload.hash = '';
            }
            if (
                upload.origin !== submit.origin ||
                !/\/functions\/v1\/form-upload\/?$/.test(upload.pathname) ||
                upload.search || upload.hash
            ) {
                return '';
            }
            return upload.toString();
        } catch (e) {
            return '';
        }
    }

    function uploadToSignedAttachment(uploadUrl, file, sha256) {
        var body = new FormData();
        body.append('cacheControl', '0');
        body.append('metadata', JSON.stringify({ sha256: sha256 }));
        body.append('', file, file.name);
        return fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'x-upsert': 'false' },
            body: body,
            mode: 'cors',
            credentials: 'omit'
        }).then(function (response) {
            if (!response.ok) {
                throw new Error('An attachment could not be uploaded.');
            }
        });
    }

    function uploadQueuedAttachments(targetUrl, settings, data) {
        var files = queuedFileEntries(data);
        if (!files.length) { return Promise.resolve(data); }
        if (files.length > 10) {
            return Promise.reject(new Error('The form has too many attachments.'));
        }
        var totalBytes = files.reduce(function (total, item) { return total + item.file.size; }, 0);
        if (files.some(function (item) { return item.file.size > 25 * 1024 * 1024; }) || totalBytes > 50 * 1024 * 1024) {
            return Promise.reject(new Error('The selected attachments are too large.'));
        }

        var uploadEndpoint = resolveAttachmentEndpoint(settings, targetUrl);
        if (!uploadEndpoint) {
            return Promise.reject(new Error('Attachment delivery is not configured.'));
        }

        return Promise.all(files.map(function (item) {
            return sha256File(item.file).then(function (sha256) {
                return {
                    position: item.position,
                    fieldName: item.fieldName,
                    file: item.file,
                    sha256: sha256
                };
            });
        })).then(function (preparedFiles) {
            var headers = buildWebhookHeaders(settings && settings.form_custom_headers);
            headers.set('Content-Type', 'application/json');
            return fetch(uploadEndpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    submission_id: String(data.get('_ssp_submission_id') || ''),
                    site_id: String(data.get('_ssp_site_id') || ''),
                    form_connection_id: String(data.get('_ssp_connection_id') || ''),
                    turnstile_token: String(data.get('cf-turnstile-response') || ''),
                    recaptcha_token: String(data.get('g-recaptcha-response') || ''),
                    files: preparedFiles.map(function (item) {
                        return {
                            field_name: item.fieldName,
                            file_name: item.file.name,
                            content_type: item.file.type || 'application/octet-stream',
                            byte_size: item.file.size,
                            sha256: item.sha256
                        };
                    })
                }),
                redirect: 'manual',
                mode: 'cors',
                credentials: 'omit'
            }).then(function (response) {
                return response.json().catch(function () { return {}; }).then(function (body) {
                    if (!response.ok || body.success !== true || !Array.isArray(body.uploads)) {
                        throw new Error(body.error || 'Attachment delivery could not be prepared.');
                    }
                    return { body: body, preparedFiles: preparedFiles };
                });
            });
        }).then(function (result) {
            if (result.body.uploads.length !== result.preparedFiles.length) {
                throw new Error('Attachment delivery returned an invalid manifest.');
            }
            var attachmentIds = [];
            return Promise.all(result.body.uploads.map(function (upload, index) {
                var prepared = result.preparedFiles[index];
                var attachmentId = String(upload.attachment_id || '').toLowerCase();
                if (
                    Number(upload.position) !== prepared.position ||
                    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(attachmentId)
                ) {
                    throw new Error('Attachment delivery returned an invalid manifest.');
                }
                attachmentIds[index] = attachmentId;
                if (upload.committed === true && !upload.upload_url) { return Promise.resolve(); }
                if (!upload.upload_url) {
                    throw new Error('Attachment delivery did not return an upload target.');
                }
                return uploadToSignedAttachment(String(upload.upload_url), prepared.file, prepared.sha256);
            })).then(function () {
                return queueSubmissionData(data, attachmentIds);
            });
        });
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

        const norm = (v) => (v == null ? '' : String(v).trim());
        const stripHash = (v) => norm(v).replace(/^#/, '');
        const ids = (Array.isArray(candidateIds) ? candidateIds : [candidateIds])
            .map(stripHash)
            .filter(Boolean);
        const providerId = (plugin, value) => {
            const id = stripHash(value);
            const patterns = {
                cf7: /^(?:wpcf7-f)?(\d+)(?:-p\d+-o\d+)?$/i,
                gravity_forms: /^(?:gform(?:_wrapper)?_)?(\d+)$/i,
                wp_forms: /^(?:wpforms-form-)?(\d+)$/i,
                forminator: /^(?:forminator-(?:form|module)-)?(\d+)$/i,
                fluent_forms: /^(?:fluentform[_-])?(\d+)$/i,
                ws_form: /^(?:(?:wsf|ws)-form-)?(\d+)$/i,
                ninja_forms: /^(?:nf-form-)?(\d+)(?:-cont)?$/i
            };
            const match = patterns[plugin] && id.match(patterns[plugin]);
            return match ? match[1] : id;
        };
        const hasTypedPrefix = (plugin, value) => {
            const id = stripHash(value);
            const patterns = {
                cf7: /^wpcf7-f\d+/i,
                gravity_forms: /^gform(?:_wrapper)?_\d+/i,
                wp_forms: /^wpforms-form-\d+/i,
                forminator: /^forminator-(?:form|module)-\d+/i,
                fluent_forms: /^fluentform[_-]\d+/i,
                ws_form: /^(?:wsf|ws)-form-\d+/i,
                ninja_forms: /^nf-form-\d+-cont/i
            };
            return !!(patterns[plugin] && patterns[plugin].test(id));
        };

        const namedInputs = Object.create(null);
        const providerHints = [];
        const addProviderHint = (plugin) => {
            if (providerHints.indexOf(plugin) === -1) { providerHints.push(plugin); }
        };
        try {
            const controls = form && form.elements
                ? Array.from(form.elements)
                : (form ? Array.from(form.querySelectorAll('input[name]')) : []);
            controls.forEach(control => {
                if (!control || String(control.tagName).toLowerCase() !== 'input' ||
                    String(control.type || '').toLowerCase() !== 'hidden' || !control.name || !control.value) return;
                if (!Object.prototype.hasOwnProperty.call(namedInputs, control.name)) {
                    namedInputs[control.name] = control.value;
                } else if (namedInputs[control.name] !== control.value) {
                    // Conflicting duplicate hidden markers are ambiguous.
                    namedInputs[control.name] = null;
                }
            });

            const formId = stripHash(form && form.id);
            const classList = form && form.classList;
            if (namedInputs._wpcf7 || (form && form.closest('.wpcf7'))) { addProviderHint('cf7'); }
            if (namedInputs.gform_submit || /^gform_\d+$/i.test(formId)) { addProviderHint('gravity_forms'); }
            if (namedInputs['wpforms[id]'] || (classList && classList.contains('wpforms-form')) || /^wpforms-form-\d+$/i.test(formId)) { addProviderHint('wp_forms'); }
            if (namedInputs.forminator_form_id || namedInputs.forminator_nonce || namedInputs._forminator_nonce || (form && form.closest('[id^="forminator-module-"]'))) { addProviderHint('forminator'); }
            if (namedInputs._fluentform_id || (classList && classList.contains('frm-fluent-form'))) { addProviderHint('fluent_forms'); }
            if (namedInputs.wsf_form_id || (form && form.closest('.wsf-form'))) { addProviderHint('ws_form'); }
            if (namedInputs._kb_form_id || (classList && classList.contains('kb-form'))) { addProviderHint('kadence_forms'); }
            if (namedInputs.elementor_form_id || (classList && classList.contains('elementor-form'))) { addProviderHint('elementor_forms'); }
            if (namedInputs.bricks_form_id || namedInputs.formId || (classList && classList.contains('brxe-form'))) { addProviderHint('bricks_forms'); }
            if (namedInputs.nf_form_id || (form && form.closest('.nf-form-cont, .ninja-forms-form-wrap'))) { addProviderHint('ninja_forms'); }
        } catch (e) { }

        const connectionMarker = norm(form && form.getAttribute && form.getAttribute('data-ssp-form-connection'));
        if (connectionMarker) {
            const connectionMatches = json.filter(cfg => cfg && norm(cfg.form_type) === 'webhook' && cfg.form_plugin === 'other' &&
                norm(cfg.form_connection_id) === connectionMarker);
            if (connectionMatches.length === 1) { return connectionMatches[0]; }
            // An exported connection marker is authoritative. Never fall back to a
            // DOM ID or hidden field when it is stale, unknown, or duplicated.
            return null;
        }
		const otherDomId = stripHash(form && form.id);
		let otherDomIdUnique = true;
		try {
			if (otherDomId && document.forms) {
				const duplicateCount = Array.prototype.filter.call(document.forms, candidate =>
					stripHash(candidate && candidate.id) === otherDomId
				).length;
				otherDomIdUnique = duplicateCount <= 1;
			}
		} catch (e) { otherDomIdUnique = false; }

        const matches = json.filter(cfg => {
            if (!cfg || norm(cfg.form_type) !== 'webhook') { return false; }
            const plugin = norm(cfg.form_plugin);
            const formId = stripHash(cfg.form_id);
            if (!plugin || !formId || (providerHints.length && providerHints.indexOf(plugin) === -1)) {
                return false;
            }

            const hiddenName = norm(cfg.form_hidden_name);
            const hiddenValue = hiddenName && Object.prototype.hasOwnProperty.call(namedInputs, hiddenName)
                ? stripHash(namedInputs[hiddenName])
                : '';
            const ownMarkerMatches = hiddenValue && (
                hiddenValue === formId || providerId(plugin, hiddenValue) === providerId(plugin, formId)
            );
            if (plugin === 'other') {
				return !!ownMarkerMatches || !!(otherDomIdUnique && otherDomId && otherDomId === formId);
            }
            if (ownMarkerMatches) { return true; }

            return ids.some(candidate => {
                const typed = hasTypedPrefix(plugin, candidate);
                if (!providerHints.length && !typed && candidate !== formId) { return false; }
                return candidate === formId || providerId(plugin, candidate) === providerId(plugin, formId);
            });
        });

        if (matches.length <= 1) { return matches[0] || null; }

        // Older versions could publish aliases for the same provider identity
        // as separate connections (for example Gravity Forms `1` and
        // `gform_1`). Prefer the one whose stored identifier exactly matches
        // the form on the page. Exact duplicate configurations remain
        // ambiguous and deliberately fail closed.
        if (otherDomId) {
            const exactDomMatches = matches.filter(cfg => stripHash(cfg.form_id) === otherDomId);
            if (exactDomMatches.length > 1) { return null; }
            if (exactDomMatches.length === 1) { return exactDomMatches[0]; }
        }

        for (const candidate of ids) {
            const exactCandidateMatches = matches.filter(cfg => stripHash(cfg.form_id) === candidate);
            if (exactCandidateMatches.length > 1) { return null; }
            if (exactCandidateMatches.length === 1) { return exactCandidateMatches[0]; }
        }

        return null;
    }

    function sspTurnstileWidget(form) {
        if (!form || typeof form.querySelector !== 'function') { return null; }
        var widget = form.querySelector('.ssp-cf-turnstile');
        if (widget) { return widget; }
        var wrapper = typeof form.closest === 'function'
            ? (form.closest('.nf-form-cont') || form.closest('.ninja-forms-form-wrap'))
            : null;
        return wrapper ? wrapper.querySelector('.ssp-cf-turnstile') : null;
    }

    function applySspTurnstileToken(data, form) {
        var widget = sspTurnstileWidget(form);
        if (!(data instanceof FormData) || !widget) { return false; }
        var token = '';
        var widgetId = widget.dataset ? String(widget.dataset.sspWidgetId || '') : '';
        if (widgetId && window.turnstile && typeof window.turnstile.getResponse === 'function') {
            try { token = String(window.turnstile.getResponse(widgetId) || ''); } catch (e) {}
        }
        if (!token) {
            var input = widget.querySelector('input[name="cf-turnstile-response"]');
            token = input ? String(input.value || '') : '';
        }

        // Provider-native CAPTCHA plugins may add the same field name with a
        // different site key. Never let their token win FormData insertion order.
        data.delete('cf-turnstile-response');
        if (token) { data.set('cf-turnstile-response', token); }
        return !!token;
    }

    function resetSspTurnstileWidget(form) {
        var widget = sspTurnstileWidget(form);
        var widgetId = widget && widget.dataset ? String(widget.dataset.sspWidgetId || '') : '';
        if (!widgetId || !window.turnstile || typeof window.turnstile.reset !== 'function') { return; }
        try { window.turnstile.reset(widgetId); } catch (e) {}
    }

    function sspRecaptchaV2Widget(form) {
        if (!form || typeof form.querySelector !== 'function') { return null; }
        var widget = form.querySelector('.ssp-g-recaptcha[data-sitekey]');
        if (widget) { return widget; }
        var wrapper = typeof form.closest === 'function'
            ? (form.closest('.nf-form-cont') || form.closest('.ninja-forms-form-wrap'))
            : null;
        return wrapper ? wrapper.querySelector('.ssp-g-recaptcha[data-sitekey]') : null;
    }

    function applySspRecaptchaV2Token(data, form) {
        var widget = sspRecaptchaV2Widget(form);
        if (!(data instanceof FormData) || !widget) { return false; }
        var token = '';
        var widgetId = widget.dataset ? String(widget.dataset.sspWidgetId || '') : '';
        if (widgetId && window.grecaptcha && typeof window.grecaptcha.getResponse === 'function') {
            try { token = String(window.grecaptcha.getResponse(widgetId) || ''); } catch (e) {}
        }
        if (!token) {
            var input = widget.querySelector('textarea[name="g-recaptcha-response"], input[name="g-recaptcha-response"]');
            token = input ? String(input.value || '') : '';
        }

        // The page can still contain a provider-native widget while an older
        // static export is being replaced. Submit only the SSP-managed token.
        data.delete('g-recaptcha-response');
        if (token) { data.set('g-recaptcha-response', token); }
        return !!token;
    }

    function resetSspRecaptchaV2Widget(form) {
        var widget = sspRecaptchaV2Widget(form);
        var widgetId = widget && widget.dataset ? String(widget.dataset.sspWidgetId || '') : '';
        if (!widgetId || !window.grecaptcha || typeof window.grecaptcha.reset !== 'function') { return; }
        try { window.grecaptcha.reset(widgetId); } catch (e) {}
    }

    // Gravity Forms consent fields always serialize hidden copies of their
    // label and description. Those audit values are useful to Gravity's own
    // entry model, but are not submitted answers and must not appear in a
    // managed notification when the visible consent checkbox is unchecked.
    function scrubGravityConsentMetadata(data, form, settings) {
        if (!(data instanceof FormData) || !form || typeof form.querySelectorAll !== 'function') {
            return data;
        }
        var plugin = settings ? String(settings.form_plugin || '') : '';
        if (plugin !== 'gravity_forms' && !form.closest('.gform_wrapper')) {
            return data;
        }

        form.querySelectorAll('.gfield--type-consent, .ginput_container_consent').forEach(function (container) {
            var field = container.closest('.gfield') || container;
            var checkbox = field.querySelector('input[type="checkbox"][name]');
            if (!checkbox) { return; }
            var match = String(checkbox.name || '').match(/^(input_\d+)[._]1$/);
            if (!match) { return; }

            if (!checkbox.checked) {
                data.delete(checkbox.name);
            }
            field.querySelectorAll('input[type="hidden"][name]').forEach(function (hidden) {
                if (new RegExp('^' + match[1] + '[._](?:2|3)$').test(String(hidden.name || ''))) {
                    data.delete(hidden.name);
                }
            });
        });

        return data;
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
                data = scrubGravityConsentMetadata(data, form, settings);
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
                var hasTurnstile = !!sspTurnstileWidget(form);
                var recaptchaInput = form.querySelector('input.ssp-g-recaptcha-response[data-sitekey]') || (form.closest('.nf-form-cont') && form.closest('.nf-form-cont').querySelector('input.ssp-g-recaptcha-response[data-sitekey]'));
                var hasRecaptcha = !!recaptchaInput;
                var recaptchaV2Widget = sspRecaptchaV2Widget(form);
				var hasRecaptchaV2Token = recaptchaV2Widget
					? applySspRecaptchaV2Token(data, form)
					: !!form.querySelector('.elementor-g-recaptcha[data-sitekey], .g-recaptcha[data-sitekey]') && !!String(data.get('g-recaptcha-response') || '').trim();
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
					(requiredService === 'recaptcha_v2' && !hasRecaptchaV2Token) ||
					(requiredService !== 'recaptcha_v2' && requiredService !== 'recaptcha_v3' && !hasTurnstile)
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
                    var submitQueuedData = function () {
                        return uploadQueuedAttachments(targetUrl, settings, data).then(function (submissionData) {
                            return submitForm(targetUrl, settings, submissionData, form);
                        }).catch(function (error) {
                            // The managed submit has not started when attachment
                            // preparation fails. Use a fresh reservation ID on retry
                            // so changed file selections cannot collide with the old
                            // (eventually cleaned-up) reservation.
                            form.__sspQueueSubmissionId = null;
                            handleMessage(settings, true, form);
                            return { success: false, settings: settings, form: form, error: error };
                        });
                    };
					if (requiredService === 'recaptcha_v2') {
						return submitQueuedData();
					}
                    if (hasTurnstile) {
                        applySspTurnstileToken(data, form);
                        return submitQueuedData();
                    }

                    if (hasRecaptcha && typeof grecaptcha !== 'undefined') {
                        return new Promise(function (resolve) {
                            grecaptcha.ready(function () {
                                grecaptcha.execute(recaptchaInput.getAttribute('data-sitekey'), { action: 'submit' }).then(function (token) {
                                    data.set('g-recaptcha-response', token);
                                    resolve(submitQueuedData());
                                }).catch(function () {
                                    handleMessage(settings, true, form);
                                    resolve({ success: false, settings: settings, form: form, error: 'recaptcha_failed' });
                                });
                            });
                        });
                    }

                    return submitQueuedData();
                }

				if (requiredService === 'recaptcha_v2' && restBase && targetUrl) {
					return submitForm(restBase + 'simplystatic/v1/recaptcha/submit?forward_to=' + encodeURIComponent(targetUrl), settings, data, form);
				} else if (hasTurnstile && restBase && targetUrl) {
                    applySspTurnstileToken(data, form);
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
            var clearActiveSubmission = function () {
                if (form.__sspSubmissionPromise === submissionPromise) {
                    resetSspTurnstileWidget(form);
                    resetSspRecaptchaV2Widget(form);
                    form.__sspSubmitting = false;
                    form.__sspSubmissionPromise = null;
                }
            };
            submissionPromise.then(clearActiveSubmission, clearActiveSubmission);
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
                try {
                    var widgetId = turnstile.render(placeholder, {
                        sitekey: placeholder.getAttribute('data-sitekey'),
                        theme: placeholder.getAttribute('data-theme') || 'auto',
                        size: placeholder.getAttribute('data-size') || 'normal'
                    });
                    placeholder.dataset.sspRendered = '1';
                    if (widgetId !== undefined && widgetId !== null) {
                        placeholder.dataset.sspWidgetId = String(widgetId);
                    }
                } catch (e) {
                    delete placeholder.dataset.sspRendered;
                    delete placeholder.dataset.sspWidgetId;
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

    // Explicit reCAPTCHA v2 rendering mirrors the Turnstile lifecycle and
    // restores widgets removed by dynamically rendered Ninja/WS forms.
    function renderRecaptchaV2Widgets() {
        if (!window.grecaptcha || typeof window.grecaptcha.render !== 'function') return;

        document.querySelectorAll('form').forEach(function (form) {
            var placeholder = sspRecaptchaV2Widget(form);
            if (!placeholder) {
                var nfWrap = form.closest('.nf-form-cont') || form.closest('.ninja-forms-form-wrap');
                var wsWrap = form.closest('.wsf-form') || form.closest('.ws-form');
                if (nfWrap || wsWrap) {
                    var existingWidget = document.querySelector('.ssp-g-recaptcha[data-sitekey]');
                    var cfg = window.__SSP_RECAPTCHA_V2_CFG__ || {};
                    var sitekey = existingWidget ? existingWidget.getAttribute('data-sitekey') : (cfg.sitekey || '');
                    if (sitekey) {
                        placeholder = document.createElement('div');
                        placeholder.className = 'g-recaptcha ssp-g-recaptcha';
                        placeholder.setAttribute('data-sitekey', sitekey);
                        placeholder.style.marginTop = '15px';
                        var submitBtn = form.querySelector('input[type="submit"], button[type="submit"]');
                        if (submitBtn && submitBtn.parentNode) {
                            submitBtn.parentNode.insertBefore(placeholder, submitBtn);
                        } else {
                            form.appendChild(placeholder);
                        }
                    }
                }
            }

            if (placeholder && !placeholder.dataset.sspWidgetId) {
                try {
                    var widgetId = window.grecaptcha.render(placeholder, {
                        sitekey: placeholder.getAttribute('data-sitekey')
                    });
                    placeholder.dataset.sspWidgetId = String(widgetId);
                } catch (e) {
                    delete placeholder.dataset.sspWidgetId;
                    if (typeof console !== 'undefined') {
                        console.warn('[SSP] reCAPTCHA v2 render error:', e.message || e);
                    }
                }
            }
        });
    }

    window.__sspRenderRecaptchaV2Widgets = renderRecaptchaV2Widgets;
    window.__sspRecaptchaV2Ready = renderRecaptchaV2Widgets;

    if (window.grecaptcha && typeof window.grecaptcha.render === 'function') {
        renderRecaptchaV2Widgets();
    }

    function initForms() {
        const allFormRoots = document.querySelectorAll("form[data-ssp-form-connection], .wpcf7 form, .wpcf7-form, .gform_wrapper form, .gform_wrapper, .wpforms-container form, .elementor-form, .wsf-form form, .ws-form form, .frm-fluent-form, .brxe-form, .brxe-brf-pro-forms, .wp-block-kadence-form form, .forminator-custom-form, .ninja-forms-form-wrap form, .nf-form-cont form, .ninja-forms-form-wrap, .nf-form-cont");

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
        renderRecaptchaV2Widgets();
        populateFormsFromURL();
        if (typeof MutationObserver !== 'undefined') {
            new MutationObserver(() => { initForms(); renderTurnstileWidgets(); renderRecaptchaV2Widgets(); }).observe(document.body, { childList: true, subtree: true });
        }
        // Ninja Forms renders via Backbone after DOMContentLoaded; re-bind when its forms are ready.
        document.addEventListener('nfFormReady', () => { initForms(); renderTurnstileWidgets(); renderRecaptchaV2Widgets(); });
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
