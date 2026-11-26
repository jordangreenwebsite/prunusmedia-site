/**
 * Consent-first Google Analytics 4 for the Prunus Media public website.
 * Load the direct Google tag only after the visitor opts in to analytics.
 * This avoids requiring a separate Google Tag Manager account.
 */
(() => {
  'use strict';

  const measurementId = 'G-QGL84J7V81';
  const storageKey = 'prunus_analytics_consent_v1';
  const allowedValues = new Set(['accepted', 'rejected']);
  const dataLayer = window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { dataLayer.push(arguments); };

  // Deny Google analytics/ad storage by default. No Google tag is requested
  // and no page_view is sent before visitors opt in.
  window.gtag('consent', 'default', {
    analytics_storage: 'denied',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    personalization_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted'
  });

  function readChoice() {
    try {
      const value = window.localStorage.getItem(storageKey);
      return allowedValues.has(value) ? value : null;
    } catch {
      return null;
    }
  }

  function storeChoice(value) {
    try { window.localStorage.setItem(storageKey, value); } catch {
      // If storage is unavailable, never assume consent on the next visit.
    }
  }

  let analyticsLoaded = false;
  function loadAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;
    // The queued commands are processed in order after gtag.js loads.
    // Exactly one config call sends the initial GA4 page_view.
    window.gtag('js', new Date());
    window.gtag('config', measurementId);
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    script.dataset.prunusGa4 = measurementId;
    document.head.appendChild(script);
  }

  function removeAnalyticsCookies() {
    const parts = location.hostname.split('.');
    const domains = ['', location.hostname, parts.length >= 2 ? '.' + parts.slice(-2).join('.') : ''];
    document.cookie.split(';').forEach((item) => {
      const name = item.split('=')[0].trim();
      if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name)) return;
      domains.forEach((domain) => {
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax' +
          (domain ? '; domain=' + domain : '');
      });
    });
  }

  const css = `
    #pm-analytics-consent { position:fixed;z-index:2147483000;right:18px;bottom:18px;
      width:min(430px,calc(100vw - 36px));background:#fffdf9;color:#243b33;
      border:1px solid #cbd5cb;border-radius:6px;box-shadow:0 12px 38px #172e2430;
      padding:20px 22px 19px;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;
      line-height:1.5 }
    #pm-analytics-consent[hidden] { display:none!important }
    #pm-analytics-consent h2 { font:600 20px/1.25 Georgia,serif;margin:0 0 10px;color:#243b33 }
    #pm-analytics-consent p { font:400 14px/1.55 Arial,Helvetica,sans-serif;margin:0 0 14px;color:#405249 }
    #pm-analytics-consent .pm-analytics-buttons {display:flex;gap:10px;flex-wrap:wrap}
    #pm-analytics-consent button {flex:1;min-width:140px;cursor:pointer;border-radius:4px;
      border:1px solid #365b4b;background:#365b4b;color:white;min-height:42px;padding:9px 14px;
      font:600 14px Arial,Helvetica,sans-serif}
    #pm-analytics-consent button[data-choice="rejected"] {background:#fffdf9;color:#365b4b}
    #pm-analytics-consent button:focus-visible,.pm-analytics-settings:focus-visible {
      outline:3px solid #739e85;outline-offset:3px }
    .pm-analytics-settings {cursor:pointer;border:0;background:transparent;color:inherit;
      padding:0;text-decoration:underline;text-underline-offset:3px;font:inherit}
    @media(max-width:480px){#pm-analytics-consent {right:10px;bottom:10px;
      width:calc(100vw - 20px);padding:17px}}
  `;
  const style = document.createElement('style');
  style.id = 'pm-analytics-consent-style';
  style.textContent = css;
  document.head.appendChild(style);

  const banner = document.createElement('section');
  banner.id = 'pm-analytics-consent';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-modal', 'false');
  banner.setAttribute('aria-labelledby', 'pm-analytics-consent-title');
  banner.hidden = true;

  const heading = document.createElement('h2');
  heading.id = 'pm-analytics-consent-title';
  heading.textContent = 'Optional analytics cookies';

  const explanation = document.createElement('p');
  explanation.textContent =
    'May we use Google Analytics to understand visits and improve this website? ' +
    'Analytics is off unless you agree. You can change your choice at any time using Cookie settings.';

  const controls = document.createElement('div');
  controls.className = 'pm-analytics-buttons';
  const reject = document.createElement('button');
  reject.type = 'button';
  reject.dataset.choice = 'rejected';
  reject.textContent = 'Reject analytics';
  const accept = document.createElement('button');
  accept.type = 'button';
  accept.dataset.choice = 'accepted';
  accept.textContent = 'Accept analytics';
  controls.append(reject, accept);
  banner.append(heading, explanation, controls);
  document.body.appendChild(banner);

  function showBanner() { banner.hidden = false; }
  function hideBanner() { banner.hidden = true; }

  function changeChoice(next) {
    const previous = readChoice();
    storeChoice(next);
    if (next === 'accepted') {
      window.gtag('consent', 'update', { analytics_storage: 'granted' });
      loadAnalytics();
    } else {
      window.gtag('consent', 'update', { analytics_storage: 'denied' });
      removeAnalyticsCookies();
      // Reload if GA4 was already loaded to stop tracking after revocation.
      if (previous === 'accepted' || analyticsLoaded) location.reload();
    }
    hideBanner();
  }

  controls.addEventListener('click', (event) => {
    const next = event.target.closest('button[data-choice]')?.dataset.choice;
    if (allowedValues.has(next)) changeChoice(next);
  });

  const settings = document.createElement('button');
  settings.type = 'button';
  settings.className = 'pm-analytics-settings';
  settings.textContent = 'Cookie settings';
  settings.addEventListener('click', showBanner);

  const legalFooter = document.querySelector('.pm-footer-legal');
  if (legalFooter) legalFooter.insertBefore(settings, legalFooter.lastElementChild);
  else {
    settings.style.cssText = 'display:block;margin:18px auto;font:14px Arial,sans-serif';
    document.body.appendChild(settings);
  }

  const previousChoice = readChoice();
  if (previousChoice === 'accepted') {
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    loadAnalytics();
  } else if (!previousChoice) {
    showBanner();
  }
})();
