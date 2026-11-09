/**
 * Prefill the current Prunus enquiry form from pricing links.
 * Does not submit data or change the existing Formspree destination.
 */
(() => {
  const interest = new URLSearchParams(window.location.hash.slice(1)).get('interest');
  if (!interest) return;
  const options = {
    'build-10-15': ['New website', 'a 10–15 page website build'],
    'build-15-20': ['New website', 'a 15–20 page website build'],
    'build-custom': ['New website', 'a custom website build'],
    rebuild: ['Website redesign', 'a website rebuild and technical SEO'],
    seo: ['SEO', 'ongoing SEO at £195/month'],
    hosting: ['Website care and hosting', 'managed hosting at £99/month'],
    social: ['Social media marketing', 'social media management'],
    ads: ['Several services', 'Meta or Google Ads management'],
    hourly: ['Several services', 'website support at £50/hour'],
    consultation: ['Not sure', 'a new website and growth consultation']
  };
  if (!Object.prototype.hasOwnProperty.call(options, interest)) return;
  const [type, subject] = options[interest];
  const select = document.getElementById('service');
  const message = document.getElementById('message');
  if (select && [...select.options].some(option => option.value === type)) {
    select.value = type;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (message && !message.value) {
    message.value = 'I would like to discuss ' + subject + '. Please let me know the next steps.';
  }
  const form = document.querySelector('.prunus-contact-form');
  if (form) form.scrollIntoView({ block: 'start', behavior: 'instant' });
})();