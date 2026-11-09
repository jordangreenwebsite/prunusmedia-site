/**
 * Targeted SEO/accessibility repair for the original Breakdance HTML export.
 * Applies to prerendered Astro markup only; does not change archived source.
 * Prefer credible metadata to invented phone numbers, locations or hours.
 */
const altDescriptions = new Map(Object.entries({
  'copy-of-prunus-media.png':'Prunus Media logo',
  'prunus-media-left-orientation.png':'Prunus Media logo',
  'hero-image.png':'Prunus Media website design and SEO illustration',
  'branding.jpg':'Brand identity and design',
  'content-scaled.jpg':'Website content creation and planning',
  'accountants-scaled.jpg':'Website design for accountancy firms',
  'private-clinic-scaled.jpg':'Website design for private clinics',
  'architect-scaled.jpg':'Website design for architects',
  'physiotherapist-scaled.jpg':'Website design for physiotherapists',
  'lawyer-scaled.jpg':'Website design for solicitors and legal firms',
  'financial-services-scaled.jpg':'Website design for financial services',
  'coaching-scaled.jpg':'Website design for coaching businesses',
  'high-end-trades-scaled.jpg':'Website design for specialist trades',
  'keyord-research-scaled.jpg':'Keyword research for search engine optimisation',
  'competitor-research-scaled.jpg':'Competitor research for search strategy',
  'site-architecture-scaled.jpg':'Planning an accessible website structure',
  'internal-linking-scaled.jpg':'Internal linking and website information structure',
  'seo-scaled.jpg':'Search engine optimisation strategy',
  'seo-report-scaled.jpg':'SEO audit and reporting',
  'screenshot-2026-09-23-080741.png':'Caring Companions Pet Care website project',
  'screenshot-2026-09-23-080825.png':'Car Care TLC website project',
  'uk-trade-websites.png':'UK Trade Websites project',
  'locla-seo-scaled.jpg':'Local search engine optimisation'
}));
const imageDimensions = new Map(Object.entries({
  'hero-image.png':[2000,1414],
  'screenshot-2026-09-23-080741.png':[1024,726],
  'screenshot-2026-09-23-080825.png':[1024,431],
  'uk-trade-websites.png':[1024,1024]
}));
function escapeAttribute(value){
  return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}
function optimizeImage(tag,offset,headerEnd,filename){
  const match=tag.match(/\bsrc=["']([^"']+)["']/i);
  const source=match?.[1]||'';
  const basename=decodeURIComponent(source.split('/').pop().split('?')[0]).toLowerCase();
  const isHeader=offset<headerEnd;
  if(!/\balt\s*=/i.test(tag)){
    // An unverified stock/abstract/duplicate visual is decorative, not
    // keyword-stuffed. Known informative images have human-readable alts.
    const meaning=altDescriptions.get(basename)||
      (/^screenshot-/.test(basename)?'Website design project preview':'');
    tag=tag.replace(/\/?>$/,m=>' alt="'+escapeAttribute(meaning)+'"'+m);
  }
  const dimension=imageDimensions.get(basename);
  if(dimension){
    if(!/\bwidth\s*=/i.test(tag))tag=tag.replace(/\/?>$/,m=>' width="'+dimension[0]+'"'+m);
    if(!/\bheight\s*=/i.test(tag))tag=tag.replace(/\/?>$/,m=>' height="'+dimension[1]+'"'+m);
  }
  if(basename==='copy-of-prunus-media.png' && isHeader){
    tag=tag.replace(/\bsrc=["'][^"']+["']/i,
      'src="/wp-content/uploads/2024/08/Copy-of-PRUNUS-MEDIA-300x300.png"');
    tag=tag.replace(/\bsizes=["'][^"']+["']/i,
      'sizes="(max-width:767px) 90px, 140px"');
  }
  if(basename==='hero-image.png'){
    // The original src was 1.3 MB and sizes="100vw" forced oversized files.
    tag=tag.replace(/\bsrc=["'][^"']+["']/i,
      'src="/wp-content/uploads/2026/09/Hero-image-768x543.png"');
    tag=tag.replace(/\bsizes=["'][^"']+["']/i,
      'sizes="(max-width:767px) 90vw, (max-width:1199px) 58vw, 620px"');
    if(filename==='index.html' || filename==='seo-agency-uk/index.html'){
      tag=tag.replace(/\bloading=["']lazy["']/i,'loading="eager" fetchpriority="high"');
    }
  }
  return tag;
}
const officialProfiles=[
  'https://www.facebook.com/people/Prunusmedia/61564233269657/',
  'https://www.instagram.com/prunus.media/'
];
function improveSchema(html, filename){
  return html.replace(
    /(<script\b[^>]*type=["']application\/ld\+json["'][^>]*class=["']rank-math-schema["'][^>]*>)([\s\S]*?)(<\/script>)/gi,
    (full,open,source,close)=>{
      let graph;
      try{graph=JSON.parse(source);}catch{return full;}
      if(!Array.isArray(graph['@graph']))return full;
      const org=graph['@graph'].find(n=>n['@type']==='Organization');
      if(!org)return full;
      // The published footer already lists these first-party identity links.
      org.url='https://prunusmedia.com/';
      org.sameAs=officialProfiles;
      org.contactPoint={
        '@type':'ContactPoint',
        contactType:'customer support',
        email:'contactprunusmedia@gmail.com',
        availableLanguage:'en-GB'
      };
      // The agency works nationally: describe this on a Service node.
      // No fictional postal address, telephone number or opening hours.
      if(filename==='index.html' && !graph['@graph'].some(n=>n['@id']==='/#design-seo-service')){
        graph['@graph'].push({
          '@type':'Service',
          '@id':'/#design-seo-service',
          name:'Website design and search engine optimisation',
          serviceType:['Website design','SEO'],
          url:'https://prunusmedia.com/website-design/',
          provider:{'@id':'/#organization'},
          areaServed:{'@type':'Country',name:'United Kingdom'}
        });
      }
      const safe=JSON.stringify(graph).replace(/</g,'\\u003c');
      return open+safe+close;
    }
  );
}
export function improveLegacySeo(html,filename){
  if(filename==='index.html'){
    const original=/<h2 class="bde-dual-heading-35-625 bde-dual-heading">([\s\S]*?)<\/h2>/i;
    if(!original.test(html))throw new Error('Cannot locate homepage hero for H1 correction');
    html=html.replace(original,(_,inner)=>
      '<h1 class="bde-dual-heading-35-625 bde-dual-heading">'+
      inner.replace('to become your best source of new business.',
        'with SEO to bring UK businesses more enquiries.')+'</h1>');
  }
  if(filename==='contact/index.html'){
    html=html.replace(
      /<h1 class="bde-heading-30-125 bde-heading">([\s\S]*?)<\/h1>/i,
      '<h2 class="bde-heading-30-125 bde-heading">$1</h2>');
  }
  if(filename==='website-design/content-creation/index.html'){
    html=html.replace(
      /(<meta\s+name="description"\s+content=")[^"]*("\s*\/?>)/i,
      '$1Website content creation for UK businesses. Clear service-page copy, creative visuals and search-led content designed to help customers understand and choose you.$2');
  }
  const headerEnd=html.indexOf('</header>');
  html=html.replace(/<img\b[^>]*>/gi,(tag,offset)=>optimizeImage(tag,offset,headerEnd,filename));
  html=improveSchema(html,filename);
  return html;
}
