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
function imageLabelFromFilename(filename) {
  // Use only recognisable subjects. Filename hashes, icons and textures remain
  // decorative: an invented keyword-heavy label is worse for screen readers.
  const cleaned = filename
    .replace(/\.[^.]+$/, '')
    .replace(/-\d+x\d+$/i, '')
    .replace(/-scaled$/i, '')
    .replace(/^(?:screenshot|image|img|photo)-\d{4}[^-]*-?/i, '')
    .replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length < 5 || /\b(?:unsplash|pexels|pixabay|background|pattern|icon|shape|arrow|texture|decorative|flower|petal|swirl)\b/i.test(cleaned)) return '';
  if (/^[a-f0-9]{8,}$/i.test(cleaned) || /^[a-z]+[\d_]+$/i.test(cleaned)) return '';
  if (cleaned.split(' ').length > 6 || /^[A-Z]{2,4}$/i.test(cleaned)) return '';
  // A label based on a descriptive asset name, never a claim about conversions.
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
const cardImageNames = new Set([
  'accountants-scaled.jpg', 'private-clinic-scaled.jpg', 'architect-scaled.jpg',
  'physiotherapist-scaled.jpg', 'lawyer-scaled.jpg', 'financial-services-scaled.jpg',
  'coaching-scaled.jpg', 'high-end-trades-scaled.jpg', 'branding.jpg',
  'content-scaled.jpg', 'keyord-research-scaled.jpg',
  'competitor-research-scaled.jpg', 'site-architecture-scaled.jpg',
  'internal-linking-scaled.jpg', 'seo-scaled.jpg'
]);
function optimizeImage(tag, offset, headerEnd, filename) {
  const match = tag.match(/\bsrc=["']([^"']+)["']/i);
  const source = match?.[1] || '';
  const basename = decodeURIComponent(source.split('/').pop().split('?')[0]).toLowerCase();
  const isHeader = offset < headerEnd;
  const isHero = basename === 'hero-image.png';
  const isLogo = basename === 'copy-of-prunus-media.png';
  const meaningfulAlt = altDescriptions.get(basename) ||
    (/^screenshot-/.test(basename) ? 'Website project screenshot' : '') ||
    imageLabelFromFilename(basename);
  if (!/\balt\s*=/i.test(tag)) {
    tag = tag.replace(/\/?>$/, m => ' alt="' + escapeAttribute(meaningfulAlt) + '"' + m);
  } else if (/\balt\s*=\s*(?:""|'')/i.test(tag) && meaningfulAlt && !/icon|flower|petal|background|pattern/i.test(basename)) {
    tag = tag.replace(/\balt\s*=\s*(?:""|'')/i, 'alt="' + escapeAttribute(meaningfulAlt) + '"');
  }
  const dimension = imageDimensions.get(basename);
  if (dimension) {
    if (!/\bwidth\s*=/i.test(tag)) tag = tag.replace(/\/?>$/, m => ' width="' + dimension[0] + '"' + m);
    if (!/\bheight\s*=/i.test(tag)) tag = tag.replace(/\/?>$/, m => ' height="' + dimension[1] + '"' + m);
  }
  if (isLogo && isHeader) {
    tag = tag.replace(/\bsrc=["'][^"']+["']/i,
      'src="/wp-content/uploads/2024/08/Copy-of-PRUNUS-MEDIA-300x300.png"');
    tag = tag.replace(/\bsizes=["'][^"']+["']/i,
      'sizes="(max-width:767px) 90px, 140px"');
    // The header logo is a navigational asset; don't mark it as decorative.
    tag = tag.replace(/\balt\s*=\s*(?:""|'')/i, 'alt="Prunus Media home"');
  }
  if (isHero) {
    tag = tag.replace(/\bsrc=["'][^"']+["']/i,
      'src="/wp-content/uploads/2026/09/Hero-image-768x543.png"');
    tag = tag.replace(/\bsizes=["'][^"']+["']/i,
      'sizes="(max-width:767px) 90vw, (max-width:1199px) 58vw, 620px"');
  }
  if (filename === 'index.html' && cardImageNames.has(basename) && /\bsrcset\s*=/.test(tag)) {
    // The original export often declared cards as 2560px-wide images; these
    // actually occupy one column. Let the browser choose existing small files.
    tag = tag.replace(/\bsizes=["'][^"']+["']/i,
      'sizes="(max-width: 700px) 92vw, (max-width: 1100px) 44vw, 390px"');
  }
  const highPriority = isHeader || (isHero && (filename === 'index.html' || filename === 'seo-agency-uk/index.html'));
  tag = tag.replace(/\bloading=["'][^"']+["']/i, '');
  if (highPriority) {
    tag = tag.replace(/\/?>$/, m => ' loading="eager"' + m);
    if (isHero && !/\bfetchpriority\s*=/.test(tag)) tag = tag.replace(/\/?>$/, m => ' fetchpriority="high"' + m);
  } else {
    tag = tag.replace(/\/?>$/, m => ' loading="lazy"' + m);
  }
  if (!/\bdecoding\s*=/.test(tag)) tag = tag.replace(/\/?>$/, m => ' decoding="async"' + m);
  return tag;
}
const officialProfiles=[
  'https://www.facebook.com/people/Prunusmedia/61564233269657/',
  'https://www.instagram.com/prunus.media/'
];
const siteOrigin = 'https://prunusmedia.com';
const serviceAreas = [
  { '@type': 'Country', name: 'United Kingdom' },
  { '@type': 'Place', name: 'Worldwide' }
];
const ukOfficeHours = {
  '@type': 'OpeningHoursSpecification',
  dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  opens: '09:00',
  closes: '17:00',
  description: 'UK time (Europe/London)'
};
const servicePages = new Map(Object.entries({
  'index.html': ['Website design and SEO', 'Website design and search engine optimisation'],
  'website-design/index.html': ['Website design', 'Website design'],
  'seo-agency-uk/index.html': ['Search engine optimisation', 'SEO'],
  'seo-agency-uk/local-seo/index.html': ['Local SEO', 'Local search engine optimisation'],
  'seo-agency-uk/technical-seo/index.html': ['Technical SEO', 'Technical search engine optimisation'],
  'seo-agency-uk/seo-content/index.html': ['SEO content', 'SEO content strategy and writing'],
  'social-media-marketing-uk/index.html': ['Social media marketing', 'Social media marketing'],
  'website-design/content-creation/index.html': ['Website content creation', 'Website content creation'],
  'website-design/website-redesign/index.html': ['Website redesign', 'Website redesign'],
  'website-design/website-care-hosting/index.html': ['Website care and hosting', 'Website maintenance and hosting'],
  'website-design/landing-page-design/index.html': ['Landing page design', 'Landing page design'],
  'website-design/brand-identity/index.html': ['Brand identity', 'Brand identity design']
}));
function improveSchema(html, filename) {
  const path = filename === 'index.html' ? '/' : '/' + filename.replace(/index\.html$/, '');
  const pageUrl = siteOrigin + path;
  return html.replace(
    /(<script\b[^>]*type=["']application\/ld\+json["'][^>]*class=["']rank-math-schema["'][^>]*>)([\s\S]*?)(<\/script>)/gi,
    (full, open, source, close) => {
      let graph;
      try { graph = JSON.parse(source); } catch { return full; }
      if (!Array.isArray(graph['@graph'])) return full;
      const nodes = graph['@graph'];
      const org = nodes.find(n => n['@type'] === 'Organization');
      if (!org) return full;
      org.url = siteOrigin + '/';
      org.name = 'Prunus Media';
      org.sameAs = officialProfiles;
      org.areaServed = serviceAreas;
      org.contactPoint = {
        '@type': 'ContactPoint',
        contactType: 'customer enquiries',
        email: 'contactprunusmedia@gmail.com',
        availableLanguage: ['en-GB'],
        areaServed: serviceAreas,
        hoursAvailable: ukOfficeHours
      };
      if (org.logo && typeof org.logo === 'object') {
        org.logo.url = siteOrigin + '/wp-content/uploads/2024/08/Copy-of-PRUNUS-MEDIA-300x300.png';
        org.logo.contentUrl = org.logo.url;
        org.logo.width = 300;
        org.logo.height = 300;
      }
      const website = nodes.find(n => n['@type'] === 'WebSite');
      if (website) {
        website.url = siteOrigin + '/';
        // A legacy WordPress search endpoint no longer exists on this static site.
        delete website.potentialAction;
      }
      const webpage = nodes.find(n => n['@type'] === 'WebPage');
      if (webpage) {
        webpage.url = pageUrl;
        // The export date is not an actual editorial update date.
        delete webpage.dateModified;
      }
      for (const node of nodes) {
        if (node['@type'] === 'ImageObject' && typeof node.url === 'string' && node.url.startsWith('/')) {
          node.url = siteOrigin + node.url;
        }
      }
      const service = servicePages.get(filename);
      if (service) {
        const existing = nodes.find(n => n['@type'] === 'Service' && n['@id'] === pageUrl + '#service');
        if (!existing) nodes.push({
          '@type': 'Service',
          '@id': pageUrl + '#service',
          name: service[0],
          serviceType: service[1],
          url: pageUrl,
          provider: { '@id': '/#organization' },
          areaServed: serviceAreas,
          hoursAvailable: ukOfficeHours
        });
      }
      // Keep page-specific validated schema; no made-up address, rating or
      // LocalBusiness node for a remote-first international agency.
      return open + JSON.stringify(graph).replace(/</g, '\\u003c') + close;
    }
  );
}
export function improveLegacySeo(html,filename){
  if(filename==='index.html'){
    const original=/<h2 class="bde-dual-heading-35-625 bde-dual-heading">([\s\S]*?)<\/h2>/i;
    if(!original.test(html))throw new Error('Cannot locate homepage hero for H1 correction');
    html=html.replace(original,(_,inner)=>
      // Semantic H1 with the previously approved H2 visual preset and copy.
      '<h1 class="bde-h2 bde-dual-heading-35-625 bde-dual-heading">'+
      inner+'</h1>');
  }
  if(filename==='contact/index.html'){
    html=html.replace(
      /<h1 class="bde-heading-30-125 bde-heading"([^>]*)>([\s\S]*?)<\/h1>/i,
      '<h2 class="bde-heading-30-125 bde-heading"$1>$2</h2>');
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
