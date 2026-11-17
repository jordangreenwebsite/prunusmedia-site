// All amounts are integer GBP pence. Never accept an amount from a browser.
// This catalogue is specifically for the agreed UK Trades concept offer, not Prunus bespoke projects.
export const CONCEPT_PLANS = Object.freeze({
  starter: Object.freeze({ name: 'Starter Website', pages: '1–5 pages', build: 14900, hosting: 3900 }),
  growth: Object.freeze({ name: 'Trade Growth Website', pages: '5–9 pages', build: 24900, hosting: 3900 }),
  seo: Object.freeze({ name: 'Website + SEO', pages: 'Up to 15 pages', build: 0, hosting: 0, monthly: 19500, minimumMonths: 6 })
});
const integer = (n) => Number.isSafeInteger(n) && n >= 0;
function currentOffer(offer, plan, now) {
  return offer && offer.active === true && Array.isArray(offer.plans) && offer.plans.includes(plan)
    && integer(offer.start) && integer(offer.end) && offer.start <= now && now < offer.end
    && ['fixed', 'percent', 'price'].includes(offer.kind) && integer(offer.value);
}
function discount(amount, offer) {
  if (!offer) return amount;
  if (offer.kind === 'percent' && offer.value > 100) throw Error('Invalid discount percent');
  const price = offer.kind === 'fixed' ? amount - offer.value : offer.kind === 'price' ? offer.value : Math.round(amount * (100-offer.value)/100);
  if (price <= 0 || price > amount) throw Error('Offer must have a positive price no higher than the standard price');
  return price;
}
// Offer must come from a validated server-owned record, after brand, eligibility,
// redemption and campaign capacity checks. These pure calculations do not reserve a redemption.
export function quoteWebsite(plan, offer = null, now = Date.now()) {
  if (!Object.hasOwn(CONCEPT_PLANS, plan)) throw Error('Unknown package');
  const p = CONCEPT_PLANS[plan];
  const applicable = currentOffer(offer, plan, now) && offer.scope === (plan === 'seo' ? 'first-seo-month' : 'build') ? offer : null;
  const offerInfo = applicable ? { id: String(applicable.id), end: applicable.end } : null;
  if (plan === 'seo') {
    const today = discount(p.monthly, applicable);
    return { plan, currency: 'gbp', build: 0, today, handover: 0, monthly: p.monthly, hosting: 0, minimumMonths: 6, minimumTotal: today + 5*p.monthly, offer: offerInfo };
  }
  const build = discount(p.build, applicable);
  const today = Math.ceil(build/2);
  return { plan, currency: 'gbp', build, today, handover: build-today+p.hosting, monthly: p.hosting, hosting: p.hosting, offer: offerInfo };
}
