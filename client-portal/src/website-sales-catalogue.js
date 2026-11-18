import { CONCEPT_PLANS, quoteWebsite } from './website-checkout-pricing.js';
export const WEBSITE_CATALOGUE = Object.freeze([
 ...Object.entries(CONCEPT_PLANS).map(([id,p])=>({id,brand:'uk-trades',name:p.name,pages:p.pages,kind:id==='seo'?'seo':'build',price:id==='seo'?p.monthly:p.build,from:false,onlineEligible:true,summary:id==='seo'?'Initial trade website of up to 9 pages, SEO and hosting included. No upfront build fee; six-month minimum. SEO-led expansion included where appropriate.':'Professional design, mobile friendly and ready for enquiries.'})),
 {id:'uk-financed',brand:'uk-trades',name:'No Upfront Website',pages:'5–9 pages',kind:'financed',price:6500,from:false,onlineEligible:true,summary:'No upfront build fee. £65/month for 12 months, then £39/month for hosting.'},
 {id:'pm-launch',brand:'prunus',name:'10–15 page website',pages:'10–15 pages',kind:'build',price:99500,from:true,onlineEligible:true,summary:'Custom responsive design, technical SEO and service-focused pages.'},
 {id:'pm-growth',brand:'prunus',name:'16–20 page website',pages:'16–20 pages',kind:'build',price:179500,from:true,onlineEligible:true,summary:'Expanded service and location coverage and keyword research.'},
 {id:'pm-custom',brand:'prunus',name:'Fully custom website',pages:'Bespoke scope',kind:'build',price:299500,from:true,onlineEligible:true,summary:'Advanced functionality and integrations, scoped before work begins.'},
 {id:'pm-seo',brand:'prunus',name:'Ongoing SEO + hosting',pages:'Existing website or separately quoted build',kind:'seo',price:19500,from:false,onlineEligible:false,summary:'SEO and managed hosting for £195/month. New website builds are quoted separately; special build offers can be agreed in writing. Six-month minimum.'}
]);
export function catalogueQuote(id){
 const p=WEBSITE_CATALOGUE.find(x=>x.id===id);if(!p)throw Error('Unknown catalogue package');
 if(Object.hasOwn(CONCEPT_PLANS,id))return {...quoteWebsite(id),onlineEligible:true,brand:p.brand,name:p.name};
 const common={plan:id,onlineEligible:true,currency:'gbp',from:p.from,brand:p.brand,name:p.name};
 if(p.kind==='financed')return {...common,build:0,today:6500,handover:0,monthly:6500,hosting:3900,minimumMonths:12,minimumTotal:78000};
 if(p.kind==='seo')return {...common,onlineEligible:p.onlineEligible,build:null,today:19500,handover:null,monthly:19500,hosting:0,minimumMonths:6,minimumTotal:117000};
 const today=Math.ceil(p.price/2);return {...common,build:p.price,today,handover:p.price-today+9900,monthly:9900,hosting:9900};
}
export const AGREEMENT_VERSION='website-packages-2026-11-18-v3';
export const isRecurringPlan=id=>['seo','uk-financed','pm-seo'].includes(id);
export const isBuildPlan=id=>['starter','growth','pm-launch','pm-growth','pm-custom'].includes(id);
export const purchasablePlanIds=()=>WEBSITE_CATALOGUE.filter(p=>p.onlineEligible).map(p=>p.id);
export const planIds=brand=>WEBSITE_CATALOGUE.filter(p=>!brand||p.brand===brand).map(p=>p.id);
const pounds=n=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n/100);
export function agreementFor(q){
 if(q.plan==='uk-financed')return 'I am buying for my business and authorise '+pounds(q.today)+' today, then £65/month for the remainder of the first 12 monthly payments, then £39/month hosting using my saved payment method. No separate build deposit.';
 if(q.plan==='seo'||q.plan==='pm-seo')return 'I am buying for my business and authorise '+pounds(q.today)+' today and '+pounds(q.monthly)+'/month thereafter with a '+q.minimumMonths+'-month minimum. Hosting is included while SEO is active. After the minimum I may request a switch to '+(q.plan==='seo'?'£39':'£99')+'/month hosting. '+(q.plan==='seo'?' An initial trade website of up to 9 pages is included with no upfront build fee. SEO-led expansion does not change the agreed hosting rate.':' Website builds are priced separately; no free build is included. SEO-led expansion does not change the agreed hosting rate.');
 return 'I am buying for my business and authorise '+pounds(q.today)+' deposit today, '+pounds(q.handover)+' at handover including the first hosting month, then '+pounds(q.monthly)+'/month hosting using my saved payment method.'+(q.brand==='prunus'?' These amounts are for the advertised starting-price scope; additional work requires a separately agreed quote. New hosted builds have a 12-month hosting commitment.':'');
}
export function checkoutQuote(id,offer=null,now=Date.now()){
 const p=WEBSITE_CATALOGUE.find(x=>x.id===id);if(!p)throw Error('Unknown plan');
 return {...(Object.hasOwn(CONCEPT_PLANS,id)?{...quoteWebsite(id,offer,now),onlineEligible:true}:catalogueQuote(id)),brand:p.brand,name:p.name,pages:p.pages};
}
