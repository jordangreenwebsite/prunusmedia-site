/**
 * Approved visual case study for Residential Roofing & Fascias.
 * Uses genuine optimised images from the sister UK Trade Websites site.
 * The two brands maintain independent layout and styling.
 */
const assets={
  before:'https://uktradewebsites.co.uk/case-studies/roofing/before.jpg',
  after:'/images/website-previews/residential-roofing-full.jpg',
  afterMobile:'/images/website-previews/residential-roofing-mobile-full.jpg',
  menu:'https://uktradewebsites.co.uk/case-studies/roofing/after-menu.png',
};

const css=String.raw`<style id="pm-roofing-story-css">
.pm-roofing-story{--roof-sage:#94A998;--roof-gold:#ECCD82;--roof-cream:#FAF4EE;--roof-ink:#2E2E2E;--roof-blush:#F8DCDC;color:var(--roof-ink);background:#fffdf9;box-sizing:border-box;padding:72px 20px;margin:60px 0;border:1px solid #e8e4dc;border-radius:8px}
.pm-roofing-story *{box-sizing:border-box}
.pm-roofing-story__inner{max-width:1100px;margin:0 auto}
.pm-roofing-story__eyebrow{display:block;font:700 12px/1.5 "Space Grotesk",sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#5f7663;margin:0 0 13px}
.pm-roofing-story h2,.pm-roofing-story h3{font-family:"Playfair Display",Georgia,serif;color:var(--roof-ink);line-height:1.2}
.pm-roofing-story h2{font-size:clamp(30px,4vw,48px);margin:0 0 17px}
.pm-roofing-story h3{font-size:clamp(24px,2.8vw,31px);margin:0 0 13px}
.pm-roofing-story p,.pm-roofing-story li{font:400 clamp(17px,1.6vw,19px)/1.6 "Alegreya Sans",Arial,sans-serif}
.pm-roofing-story__intro{max-width:850px;margin:0 auto 30px;text-align:center}
.pm-roofing-story__intro p{margin:11px 0}
.pm-roofing-story__comparison{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px;margin:30px 0 0}
.pm-roofing-story__window{margin:0;background:#fff;border:1px solid #d9ddd5;border-radius:8px;overflow:hidden;box-shadow:0 7px 28px rgba(46,46,46,.08)}
.pm-roofing-story__window figcaption{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 18px;font:600 16px/1.4 "Space Grotesk",sans-serif;min-height:62px}
.pm-roofing-story__phase{display:inline-block;padding:6px 11px;border-radius:999px;font:700 12px/1.3 "Space Grotesk",sans-serif}
.pm-roofing-story__phase--before{background:#ebe8e4;color:#555}
.pm-roofing-story__phase--after{background:#dfece1;color:#305a3c}
.pm-roofing-story__scroll{height:clamp(340px,37vw,530px);overflow:auto;overscroll-behavior:contain;border-top:1px solid #ebede8;background:#fff;scrollbar-width:thin;outline-offset:-3px}
.pm-roofing-story__scroll:focus-visible{outline:3px solid #6d886e}
.pm-roofing-story__scroll img{display:block;width:100%;height:auto}
.pm-roofing-story__hint{text-align:center;font-size:15px!important;color:#5c665d;margin:14px 0 34px}
.pm-roofing-story__result{display:grid;grid-template-columns:155px minmax(0,1fr);gap:30px;align-items:center;background:var(--roof-cream);border:1px solid #e9e4db;border-radius:8px;padding:30px;margin-bottom:43px}
.pm-roofing-story__count{display:flex;flex-direction:column;text-align:center;justify-content:center;align-items:center;border-radius:8px;background:#3f5c4e;color:white;min-height:140px;padding:15px}
.pm-roofing-story__count strong{font:700 66px/1 "Playfair Display",Georgia,serif;color:var(--roof-gold)}
.pm-roofing-story__count span{font:600 13px/1.35 "Space Grotesk",sans-serif}
.pm-roofing-story__result p{margin:8px 0}
.pm-roofing-story__menu{display:grid;grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:28px;align-items:center}
.pm-roofing-story__menu h3{margin-top:0}
.pm-roofing-story__menu img{display:block;width:100%;height:auto;border-radius:5px}
.pm-roofing-story__menu figure{margin:0;padding:10px;border:1px solid #e6e4dc;background:#fff;border-radius:7px}
.pm-roofing-story__menu figcaption{font:400 14px/1.45 "Space Grotesk",sans-serif;color:#647068;margin:9px 6px 3px}
.pm-roofing-story__menu ul{padding-left:22px}
.pm-roofing-story__cta{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:center;margin-top:33px}
.pm-roofing-story__cta a{display:inline-block;background:#2E2E2E;color:#fff!important;text-decoration:none;font:600 14px/1.4 "Space Grotesk",sans-serif;padding:12px 20px;border-radius:3px}
.pm-roofing-story__cta a:nth-child(2){background:#e9eee6;color:#344d3c!important}
.pm-roofing-story__cta a:hover{filter:brightness(1.1)}
.pm-roofing-story--compact{padding:55px 18px;margin:40px 0}
@media(max-width:740px){
  .pm-roofing-story{padding:45px 14px;margin:45px 0}
  .pm-roofing-story__intro{text-align:left}
  .pm-roofing-story__comparison{grid-template-columns:1fr;gap:21px}
  .pm-roofing-story__scroll{height:370px}
  .pm-roofing-story__result,.pm-roofing-story__menu{grid-template-columns:1fr}
  .pm-roofing-story__count{min-height:95px;max-width:190px}
  .pm-roofing-story__count strong{font-size:48px}
}
</style>`;

export function roofingComparisonHtml({id='pm-roofing-story',compact=false}={}){
return css+`
<section class="pm-roofing-story${compact?' pm-roofing-story--compact':''}" id="${id}" aria-labelledby="${id}-title">
 <div class="pm-roofing-story__inner">
  <div class="pm-roofing-story__intro">
   <p class="pm-roofing-story__eyebrow">Client transformation / Residential Roofing &amp; Fascias</p>
   <h2 id="${id}-title">Same character. A website built to work harder.</h2>
   <p>His first website was new but had little search visibility, and the editing process was taking too much time. He wanted the familiar colours and character kept, but rebuilt into something professional, easier to navigate and ready for local SEO.</p>
   <p>We rebuilt the site in Astro, preserving the business's identity and adding clearer customer journeys and a structure that is easier to maintain.</p>
  </div>
  <div class="pm-roofing-story__comparison" aria-label="Residential Roofing website before-and-after comparison">
   <figure class="pm-roofing-story__window">
    <figcaption><span class="pm-roofing-story__phase pm-roofing-story__phase--before">Before</span> Original website</figcaption>
    <div class="pm-roofing-story__scroll" role="region" tabindex="0" aria-label="Scroll through the original roofing website screenshot">
     <img src="${assets.before}" loading="lazy" decoding="async" alt="Full-page screenshot of the old Residential Roofing and Fascias website">
    </div>
   </figure>
   <figure class="pm-roofing-story__window">
    <figcaption><span class="pm-roofing-story__phase pm-roofing-story__phase--after">After</span> New Astro website</figcaption>
    <div class="pm-roofing-story__scroll" role="region" tabindex="0" aria-label="Scroll through the rebuilt roofing website screenshot">
     <picture><source media="(max-width: 740px)" srcset="${assets.afterMobile}"><img src="${assets.after}" loading="lazy" decoding="async" alt="Final full-page screenshot of the Residential Roofing and Fascias website"></picture>
    </div>
   </figure>
  </div>
  <p class="pm-roofing-story__hint">Scroll within either image to explore the website from top to bottom.</p>
  <div class="pm-roofing-story__result">
   <div class="pm-roofing-story__count"><strong>15</strong><span>additional pages</span></div>
   <div><h3>New pages for genuine services and local areas</h3>
    <p>The 17-page rebuild includes 15 additional service and location pages for places such as Cirencester, Swindon, Gloucestershire and Wiltshire. Each page gives people a more useful route to the information relevant to them.</p>
    <p>Dedicated headings, structured data and internal linking create stronger foundations for local search. They support discovery over time; rankings cannot be guaranteed immediately.</p>
   </div>
  </div>
  <div class="pm-roofing-story__menu">
   <div>
    <p class="pm-roofing-story__eyebrow">The new navigation</p>
    <h3>Making it easier for customers to find the right service</h3>
    <p>We reorganised the menu to connect services with the local areas covered, so homeowners can navigate to useful pages without having to search through the whole site.</p>
    <ul><li>17-page Astro website rebuild</li><li>Services and area-specific landing pages</li><li>Technical SEO and structured data</li><li>Clear mobile navigation and enquiry options</li><li>Ongoing SEO support after launch</li></ul>
   </div>
   <figure>
    <img src="${assets.menu}" loading="lazy" decoding="async" alt="Screenshot of the new roofing website service and location navigation menu">
    <figcaption>The redesigned navigation links visitors to service and location pages.</figcaption>
   </figure>
  </div>
  <nav class="pm-roofing-story__cta" aria-label="Explore this roofing project">
   <a href="/our-work/residential-roofing-and-fascias/">Read the full project</a>
   <a href="/contact/">Discuss a website rebuild</a>
  </nav>
 </div>
</section>`;
}
