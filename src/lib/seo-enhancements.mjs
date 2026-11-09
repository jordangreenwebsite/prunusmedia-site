
/**
 * SEO improvements for the retained Astro/Breakdance HTML snapshot.
 * Keeps the approved markup/design while improving accessibility, data
 * accuracy, image request sizes and semantic document structure.
 */
const knownAlts = new Map([
  ['Copy-of-PRUNUS-MEDIA.png', 'Prunus Media logo'],
  ['Hero-image.png', 'Website design and search engine optimisation services'],
  ['Branding.jpg', 'Brand identity design'],
  ['Content-scaled.jpg', 'Website content creation and marketing'],
  ['keyord-research-scaled.jpg', 'Keyword research for SEO'],
  ['Competitor-research-scaled.jpg', 'Competitor and keyword research'],
  ['Site-architecture-scaled.jpg', 'Website structure and planning'],
  ['internal-linking-scaled.jpg', 'Website internal linking strategy'],
  ['seo-scaled.jpg', 'Search engine optimisation strategy'],
  ['seo-2-scaled.jpg', 'SEO planning and analysis'],
  ['seo-3-scaled.jpg', 'Search engine optimisation'],
  ['SEO-report-scaled.jpg', 'Search engine optimisation reporting'],
  ['Locla-SEO-scaled.jpg', 'Local search optimisation'],
  ['financial-services-scaled.jpg', 'Website design for financial services'],
  ['Accountants-scaled.jpg', 'Website design for accountants'],
  ['Private-clinic-scaled.jpg', 'Website design for private clinics'],
  ['architect-scaled.jpg', 'Website design for architects'],
  ['physiotherapist-scaled.jpg', 'Website design for physiotherapists'],
  ['lawyer-scaled.jpg', 'Website design for legal practices'],
  ['coaching-scaled.jpg', 'Website design for coaches'],
  ['high-end-trades-scaled.jpg', 'Website design for specialist trades'],
  ['Screeshot-2026-09-23-080741.png', 'Caring Companions Pet Care website example'],
  ['Screenshot-2026-09-23-080741.png', 'Caring Companions Pet Care website example'],
  ['Screenshot-2026-09-23-080825.png', 'Car Care TLC website example'],
  ['Your-Website-Audit-for-cbcsuk.co_.uk_page-0001-e1790591521610.jpg', 'Example website SEO audit report']
]);
const decorativeLogoSet=new Set(['CC.png','DB.png','SEO.png','SM.png','WEBSITE.png']);
const primaryLogo = /\/2024\/08\/Copy-of-PRUNUS-MEDIA(?:-\d+x\d+)?\.png$/i;
const officialSocials = [
  'https://www.facebook.com/people/Prunusmedia/61564233269657/',
  'https://www.instagram.com/prunus.media/'
];
const email='contactprunusmedia@gmail.com';

function setAttr(tag,name,value){
  const safe=String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const existing=new RegExp('(\\s'+name+'\\s*=\\s*)(["\\x27])[^"\\x27]*\\2','i');
  if(existing.test(tag))return tag.replace(existing,(_,prefix)=>prefix+'"'+safe+'"');
  return tag.replace(/>$/, ' '+name+'="'+safe+'">');
}
function getAttr(tag,name){
  const re=new RegExp('(?:^|\\s)'+name+'\\s*=\\s*(["\\x27])([\\s\\S]*?)\\1','i');
  return (re.exec(tag)||[])[2]||'';
}
function filenameOf(src){
  try {return decodeURIComponent(src.split(/[?#]/)[0].split('/').pop()||'');}
  catch{return src.split(/[?#]/)[0].split('/').pop()||'';}
}
function altForImage(src){
  const name=filenameOf(src);
  if(primaryLogo.test(src)) return 'Prunus Media logo';
  if(decorativeLogoSet.has(name))return ''; // repeated, decorative service marquee icons
  if(knownAlts.has(name))return knownAlts.get(name);
  // Generic photographs / stock illustrations with no verified subject are
  // decorative alongside nearby descriptive text; never invent a subject.
  return '';
}

export function improveImages(html){
  return html.replace(/<img\b[^>]*>/gi,(original,offset)=>{
    let tag=original;
    const src=getAttr(tag,'src')||getAttr(tag,'data-src');
    const name=filenameOf(src);
    const inHeader=html.slice(0,offset).lastIndexOf('<header') >
      html.slice(0,offset).lastIndexOf('</header');
    const isLogo=primaryLogo.test(src);
    const isHero=name==='Hero-image.png';
    if(!/\balt\s*=/i.test(tag))tag=setAttr(tag,'alt',altForImage(src));
    if(!/\bdecoding\s*=/i.test(tag))tag=setAttr(tag,'decoding','async');
    const isPriority=(inHeader&&isLogo)||isHero;
    if(isPriority){
      tag=setAttr(tag,'loading','eager');
      if(isHero)tag=setAttr(tag,'fetchpriority','high');
    }else if(!/\bloading\s*=/i.test(tag)){
      tag=setAttr(tag,'loading','lazy');
    }

    // Keep the original image's source and srcset URLs, but guide browsers to
    // request the actual rendered size rather than treating a 70px icon as a
    // 2,000px image. These are byte-level optimisations, not layout redesigns.
    if(isLogo){
      tag=setAttr(tag,'src','/wp-content/uploads/2024/08/Copy-of-PRUNUS-MEDIA-300x300.png');
      tag=setAttr(tag,'sizes','(max-width: 670px) 90px, 110px');
    }else if(decorativeLogoSet.has(name)){
      const small=src.replace(/\.png$/,'-300x75.png');
      tag=setAttr(tag,'src',small);
      if(getAttr(tag,'srcset'))tag=setAttr(tag,'sizes','(max-width: 670px) 22vw, 180px');
    }else if(isHero){
      tag=setAttr(tag,'src',src.replace(/\.png$/,'-1024x724.png'));
      tag=setAttr(tag,'sizes','(max-width: 670px) 92vw, (max-width: 1100px) 55vw, 650px');
    }else if(getAttr(tag,'srcset')&&/breakdance-image-object|bde-image2/.test(tag)){
      tag=setAttr(tag,'sizes','(max-width: 670px) 96vw, (max-width: 1100px) 55vw, 750px');
    }

    // Preserve image aspect ratio during load. Most original Breakdance images
    // already have intrinsic dimensions; only fill those lacking both values.
    if(!getAttr(tag,'width')&&!getAttr(tag,'height')&&getAttr(tag,'srcset')){
      const match=getAttr(tag,'srcset').match(/-(\d{2,4})x(\d{2,4})\.(?:png|jpe?g|webp)\s+\d+w/i);
      if(match){
        tag=setAttr(tag,'width',match[1]);
        tag=setAttr(tag,'height',match[2]);
      }
    }
    return tag;
  });
}

export function improveStructure(html,filename){
  if(filename==='index.html'){
    const hero=/(<)h2(\s+class="bde-dual-heading-35-625\b[^"]*"[^>]*>)([\s\S]*?)(<\/)h2(>)/i;
    if(!hero.test(html))throw new Error('Cannot locate the main homepage hero for semantic H1 correction');
    html=html.replace(hero,(_,open,attrs,inside,close,end)=>open+'h1'+attrs+inside+close+'h1'+end);
  }
  if(filename==='contact/index.html'){
    html=html.replace(/<h1(\s+class="bde-heading-30-125\b[^"]*"[^>]*>)([\s\S]*?)<\/h1>/i,
      (_,attributes,contents)=>'<h2'+attributes+contents+'</h2>');
  }
  if(filename==='website-design/content-creation/index.html'){
    const old='Brand identity design for UK businesses. Logos, colour, typography and practical brand systems designed to work across your website and marketing.';
    const value='Website and social media content creation for UK businesses, including SEO copy, articles, service-page content and ongoing marketing support.';
    if(!html.includes(old))throw new Error('Content Creation duplicate description not found');
    html=html.replaceAll(old,value);
  }
  return html;
}

export function improveSchema(html){
  return html.replace(/<script\b([^>]*\bclass=["']rank-math-schema["'][^>]*)>([\s\S]*?)<\/script>/gi,(whole,attrs,source)=>{
    let data;
    try{data=JSON.parse(source);}catch{return whole;}
    const graph=data?.['@graph'];
    if(!Array.isArray(graph))return whole;
    const org=graph.find(node=>node?.['@type']==='Organization');
    if(!org)return whole;

    // The agency genuinely serves UK businesses online. No private home
    // address, unverified telephone or invented opening hours are published.
    org.url='https://prunusmedia.com/';
    org.areaServed={'@type':'Country',name:'United Kingdom'};
    org.contactPoint={
      '@type':'ContactPoint',contactType:'customer service',
      email,areaServed:'GB',availableLanguage:'English'
    };
    org.sameAs=officialSocials;
    if(org.logo&&typeof org.logo==='object'){
      org.logo.url='https://prunusmedia.com/wp-content/uploads/2024/08/Copy-of-PRUNUS-MEDIA-300x300.png';
      org.logo.contentUrl=org.logo.url;
      org.logo.width='300';
      org.logo.height='300';
    }
    const website=graph.find(node=>node?.['@type']==='WebSite');
    if(website){
      website.url='https://prunusmedia.com/';
      // WP's exported /?s= search action is not a working Astro site search.
      if(website.potentialAction?.target==='/?s={search_term_string}')delete website.potentialAction;
    }
    const encoded=JSON.stringify(data).replace(/</g,'\\u003c');
    return '<script'+attrs+'>'+encoded+'</script>';
  });
}

export function enhanceLegacyPage(html,filename){
  return improveImages(improveSchema(improveStructure(html,filename)));
}
