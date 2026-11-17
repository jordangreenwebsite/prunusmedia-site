import { CONCEPT_PLANS, quoteWebsite } from './website-checkout-pricing.js';
export const WEBSITE_CATALOGUE = Object.freeze([
 ...Object.entries(CONCEPT_PLANS).map(([id,p])=>({id,brand:'uk-trades',name:p.name,pages:p.pages,kind:id==='seo'?'seo':'build',price:id==='seo'?p.monthly:p.build,from:false,onlineEligible:true,summary:id==='seo'?'Website build and hosting included while SEO is active. Six-month minimum.':'Professional design, mobile friendly and ready for enquiries.'})),
 {id:'uk-financed',brand:'uk-trades',name:'No Upfront Website',pages:'5–9 pages',kind:'financed',price:6500,from:false,onlineEligible:false,summary:'No upfront build fee. £65/month for 12 months, then £39/month for hosting.'},
 {id:'pm-launch',brand:'prunus',name:'10–15 page website',pages:'10–15 pages',kind:'build',price:99500,from:true,onlineEligible:false,summary:'Custom responsive design, technical SEO and service-focused pages.'},
 {id:'pm-growth',brand:'prunus',name:'15–20 page website',pages:'15–20 pages',kind:'build',price:179500,from:true,onlineEligible:false,summary:'Expanded service and location coverage and keyword research.'},
 {id:'pm-custom',brand:'prunus',name:'Fully custom website',pages:'Bespoke scope',kind:'build',price:299500,from:true,onlineEligible:false,summary:'Advanced functionality and integrations, scoped before work begins.'},
 {id:'pm-seo',brand:'prunus',name:'SEO & hosting',pages:'Ongoing website growth',kind:'seo',price:19500,from:true,onlineEligible:false,summary:'Ongoing SEO from £195/month, hosting included while active. New builds quoted separately.'}
]);
export function catalogueQuote(id){
 const p=WEBSITE_CATALOGUE.find(x=>x.id===id);if(!p)throw Error('Unknown catalogue package');
 if(p.onlineEligible)return {...quoteWebsite(id),onlineEligible:true};
 const common={plan:id,onlineEligible:false,currency:'gbp',from:p.from};
 if(p.kind==='financed')return {...common,build:0,today:6500,handover:0,monthly:6500,hosting:3900,minimumMonths:12,minimumTotal:78000};
 if(p.kind==='seo')return {...common,build:null,today:19500,handover:null,monthly:19500,hosting:0,minimumMonths:3,minimumTotal:58500};
 const today=Math.ceil(p.price/2);return {...common,build:p.price,today,handover:p.price-today+9900,monthly:9900,hosting:9900};
}