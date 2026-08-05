'use strict';

const redirectMeta = document.querySelector("meta[name='ssp-comment-redirect-url']");
const endpointMeta = document.querySelector("meta[name='ssp-comment-endpoint']");
const trustedRedirectMeta = document.querySelector("meta[name='ssp-comment-trusted-redirect-origins']");
let redirect_url = redirectMeta ? redirectMeta.getAttribute("content") || '' : '';
let comment_endpoint = '';

try {
    comment_endpoint = endpointMeta ? atob(endpointMeta.getAttribute("content") || '') : '';
} catch (_) {
    comment_endpoint = '';
}

function safeCommentRedirectUrl(value) {
    try {
        const url = new URL(String(value || ''), window.location.href);
        if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;

        const trustedOrigins = [window.location.origin];
        const configuredOrigins = trustedRedirectMeta ? String(trustedRedirectMeta.getAttribute('content') || '').split(',') : [];
        configuredOrigins.forEach(function (origin) {
            try {
                const trusted = new URL(origin.trim());
                if (/^https?:$/.test(trusted.protocol) && !trusted.username && !trusted.password) {
                    trustedOrigins.push(trusted.origin);
                }
            } catch (_) {}
        });

        return trustedOrigins.indexOf(url.origin) === -1 ? null : url.toString();
    } catch (_) {
        return null;
    }
}

function safeCommentEndpoint(value) {
    try {
        const url = new URL(String(value || ''), window.location.href);
        return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.toString() : null;
    } catch (_) {
        return null;
    }
}

function success(el, redirect_url) {
    const submitButton = el.target.querySelector('input[type="submit"], button[type="submit"]');

    if (submitButton) {
        submitButton.disabled = false;
    }

    if (el.target.querySelector('input[type="submit"]')) {
        el.target.querySelector('input[type="submit"]').blur();
    }

    el.target.reset();

    // Redirect if set
    const safeRedirect = safeCommentRedirectUrl(redirect_url);
    if (safeRedirect) {
        window.location.replace(safeRedirect);
    }
}

function submitForm(method, url, redirect_url, data, el) {
    url = safeCommentEndpoint(url);
    if (!url) {
        const invalidSubmitButton = el.target.querySelector('input[type="submit"], button[type="submit"]');
        if (invalidSubmitButton) invalidSubmitButton.disabled = false;
        return;
    }

    let xhr = new XMLHttpRequest();
    const submitButton = el.target.querySelector('input[type="submit"], button[type="submit"]');

    function restoreSubmission() {
        if (submitButton) {
            submitButton.disabled = false;
        }
    }

    xhr.open(method, url);
    xhr.onreadystatechange = function () {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;

        if (xhr.status === 200) {
            success(el, redirect_url);
        } else {
            restoreSubmission();
        }
    };
    xhr.onerror = restoreSubmission;

    xhr.send(data);
}

function modifyFormAttributes(form) {
    form.removeAttribute("action");
    form.removeAttribute("method");
    form.removeAttribute("enctype");
    form.removeAttribute("novalidate");
}

document.addEventListener("DOMContentLoaded", function () {
    const allForms = document.querySelectorAll(
        "#commentform"
    );

    allForms.forEach((form) => {
        modifyFormAttributes(form);

        // Inputs
        const inputs = form.querySelectorAll("input");

        // Add HTML required attribute
        inputs.forEach((input) => {
            if (input.getAttribute("aria-required") === "true") {
                input.required = true;
            }
        });

        form.addEventListener("submit", function (el) {
            el.preventDefault();

            const submitButton = form.querySelector('input[type="submit"], button[type="submit"]');
            const recaptchaInput = form.querySelector('input.g-recaptcha-response[data-sitekey]');

            if (submitButton) {
                submitButton.disabled = true;
            }

            if (recaptchaInput) {
                if (typeof grecaptcha === 'undefined') {
                    if (submitButton) {
                        submitButton.disabled = false;
                    }
                    return;
                }

                grecaptcha.ready(function () {
                    grecaptcha.execute(recaptchaInput.getAttribute('data-sitekey'), {action: 'submit'})
                        .then(function (token) {
                            recaptchaInput.value = token;
                            submitForm("POST", comment_endpoint, redirect_url, new FormData(form), el);
                        })
                        .catch(function () {
                            if (submitButton) {
                                submitButton.disabled = false;
                            }
                        });
                });
                return;
            }

            submitForm("POST", comment_endpoint, redirect_url, new FormData(form), el);
        });
    });
});
