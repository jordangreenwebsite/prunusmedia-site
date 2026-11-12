/**
 * Browser smoke / screenshot comparison. Never hits the SEO Worker audit
 * endpoint or sends a production contact enquiry.
 */
import { chromium } from 'playwright';
import { getLegacyRoutes } from '../src/lib/exported-pages.mjs';
import { industryPages } from '../src/data/industry-pages.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import path from 'node:path';

const port = 4322;
const local = 'http://127.0.0.1:' + port;
const production = 'https://prunusmedia.com';
const output = path.join(process.cwd(), 'screenshots');
mkdirSync(output, { recursive: true });
const server = spawn('npm', ['run','preview','--','--host','127.0.0.1','--port',String(port)], {
  stdio: 'pipe', env: process.env
});
let serverOutput = '';
server.stdout.on('data', (part) => serverOutput += String(part));
server.stderr.on('data', (part) => serverOutput += String(part));
async function waitForServer() {
  for (let attempt=0; attempt<90; attempt++) {
    try {
      const response = await fetch(local + '/');
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Local Astro preview failed to launch: ' + serverOutput.slice(-1500));
}
let browser;
let failures = [];
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const visualMetrics = [];
  const cases = [
    { route: '/', label: 'homepage-desktop', width: 1440, height: 900 },
    { route: '/', label: 'homepage-mobile', width: 390, height: 844, mobile: true },
    { route: '/seo-agency-uk/free-seo-audit/', label: 'auditor-desktop', width: 1440, height: 900 },
    { route: '/contact/', label: 'contact-mobile', width: 390, height: 844, mobile: true },
    { route: '/industries/', label: 'industries-directory-desktop', width: 1440, height: 900 },
    { route: '/industries/', label: 'industries-directory-mobile', width: 390, height: 844, mobile: true },
    { route: '/industries/accountants/', label: 'accountants-desktop', width: 1440, height: 900 },
    { route: '/industries/private-clinics/', label: 'clinics-desktop', width: 1440, height: 900 },
    { route: '/blog/', label: 'blog-desktop', width: 1440, height: 900 },
    { route: '/our-work/', label: 'portfolio-desktop', width: 1440, height: 900 },
    { route: '/pricing/', label: 'pricing-desktop', width: 1440, height: 900 },
    { route: '/pricing/', label: 'pricing-mobile', width: 390, height: 844, mobile: true },
    { route: '/website-design/', label: 'website-menu-desktop', width: 1440, height: 900 },
    { route: '/website-design/ecommerce-website-design/', label: 'ecommerce-menu-desktop', width: 1440, height: 900 }
  ];
  for (const test of cases) {
    console.log('Checking ' + test.label + ' on local Astro build');
    const ctx = await browser.newContext({
      viewport: { width: test.width, height: test.height },
      deviceScaleFactor: 1,
      isMobile: !!test.mobile,
      hasTouch: !!test.mobile,
      reducedMotion: 'reduce'
    });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    let localStatus;
    try {
      const response = await page.goto(local + test.route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      localStatus = response.status();
      if (localStatus !== 200) throw new Error('Local HTTP status ' + localStatus);
      await Promise.race([page.evaluate(() => document.fonts.ready), new Promise((r) => setTimeout(r, 1200))]);
      await page.waitForTimeout(350);
      await page.screenshot({ path: path.join(output, test.label + '-astro.png'), fullPage: false, animations:'disabled', timeout: 6500 });
      const title = await page.title();
      const visibleLinks = await page.locator('header a[href]').count();
      if (!title || visibleLinks < 4) failures.push(test.label + ': missing title or expected header navigation');


      // The editorial links live inside the ORIGINAL Our Work and
      // About/Contact dropdowns, not as new top-level menu items.
      const workItem = page.locator('header .bde-menu-dropdown-27-153 .prunus-added-dropdown-item a[href="/our-work/"]');
      const blogItem = page.locator('header .bde-menu-dropdown-27-152 .prunus-added-dropdown-item a[href="/blog/"]');
      if (await workItem.count() !== 1 || await blogItem.count() !== 1) {
        failures.push(test.label + ': required Work / Blog dropdown links absent');
      } else {
        const firstWork = await page.locator('header .bde-menu-dropdown-27-153 .breakdance-dropdown-links > li:first-child a').getAttribute('href');
        const nextWork = await page.locator('header .bde-menu-dropdown-27-153 .breakdance-dropdown-links > li:nth-child(2) a').getAttribute('href');
        if (firstWork !== '/pricing/' || nextWork !== '/our-work/') {
          failures.push(test.label + ': Pricing must precede Our Work in its dropdown');
        }
        // Four menus, four single columns, a single visible logo.
        const headerCols=await page.locator('header .breakdance-dropdown-column').count();
        if(headerCols!==4) failures.push(test.label+': duplicate header columns, found '+headerCols);
        const logo=page.locator('header img.breakdance-image-object').first();
        if(await logo.count()!==1) failures.push(test.label+': header logo missing');
        else {
          const logoState=await logo.evaluate(el=>{
            const b=el.getBoundingClientRect();
            return {width:b.width,height:b.height,src:el.getAttribute('src')};
          });
          if(logoState.width<25 || logoState.height<25 || !logoState.src?.includes('Copy-of-PRUNUS-MEDIA-300x300.png')){
            failures.push(test.label+': header logo hidden or not optimised');
          }
        }
        for(const menuId of ['148','149','153','152']){
          const list=page.locator('header .bde-menu-dropdown-27-'+menuId+' .breakdance-dropdown-links');
          const first=await list.locator(':scope > li:first-child a').getAttribute('href');
          const pricing=await list.locator(':scope > li.prunus-pricing-dropdown-item a[href="/pricing/"]').count();
          if(first!=='/pricing/'||pricing!==1)failures.push(test.label+': Pricing missing or duplicated in dropdown '+menuId);
        }
        for (const url of ['/blog/', '/our-work/']) {
          const result = await page.request.get(local + url);
          if (!result.ok()) failures.push(test.label + ': ' + url + ' returns ' + result.status());
        }
        if (test.route === '/') {
          if (test.mobile) {
            await page.locator('.breakdance-menu-toggle').click({ timeout:5000 });
            await page.waitForTimeout(100);
          }
          for (const [id, anchor] of [['153',workItem],['152',blogItem]]) {
            const button = page.locator('header .bde-menu-dropdown-27-' + id + ' .breakdance-dropdown-toggle > button.breakdance-menu-link');
            await button.click({ timeout:5000 });
            if (!await anchor.isVisible()) failures.push(test.label + ': submenu link not visible ' + id);
          }
          if (test.mobile) await page.keyboard.press('Escape');
        }
      }

      // Skip link hidden visually until actual keyboard focus.
      { // Shared header: every page must have an accessible keyboard-only skip link.
        const skip=page.locator('.pm-skip-link');
        if(await skip.count()!==1) failures.push(test.label+': skip link absent or duplicated');
        else {
          const hidden=await skip.evaluate(el=> {
            const css=getComputedStyle(el);
            return css.clipPath==='inset(50%)' && el.getBoundingClientRect().width<=2;
          });
          if(!hidden) failures.push(test.label+': skip link visible without keyboard focus');
          await skip.focus();
          const shown=await skip.evaluate(el=>{
            const css=getComputedStyle(el);
            return css.clipPath!=='inset(50%)' && el.getBoundingClientRect().width>20;
          });
          if(!shown) failures.push(test.label+': skip link not visible on focus');
          await skip.evaluate(el=>el.blur());
        }
      }
      if(test.route==='/'){
        const promo=page.locator('.pm-home-pricing');
        if(await promo.count()!==1 || await promo.locator('a[href="/pricing/"]').count()!==1){
          failures.push(test.label+': homepage pricing invitation missing');
        }
      }
      // Rebuilt native details must expose all six original answers.
      // Test a real open and close for every question, not merely an icon.
      if(test.route==='/'){
        const faqs=page.locator('.pm-faq__item');
        if(await faqs.count()!==6){
          failures.push(test.label+': expected six rebuilt FAQs');
        }else{
          const titles=await faqs.locator('summary .pm-faq__title').allTextContents();
          const expected=[
            'How much does a business website cost in the UK?',
            'Do you build small websites?',
            'Is SEO included with website design?',
            'Can you write all the website content?',
            'Can you continue doing SEO after launch?',
            'Do you use templates?'
          ];
          if(JSON.stringify(titles.map(s=>s.trim()))!==JSON.stringify(expected)){
            failures.push(test.label+': FAQ question copy changed or missing');
          }
          for(let i=0;i<6;i++){
            const item=faqs.nth(i);
            const summary=item.locator('summary');
            const answer=item.locator('.pm-faq__answer');
            if(!((await answer.textContent())||'').trim()){
              failures.push(test.label+': FAQ '+(i+1)+' answer empty');
            }
            await summary.click();
            if(!await item.evaluate(el=>el.open)||!await answer.isVisible()){
              failures.push(test.label+': FAQ '+(i+1)+' answer does not open');
            }
            const contentHeight=await answer.evaluate(el=>el.getBoundingClientRect().height);
            if(contentHeight<22)failures.push(test.label+': FAQ '+(i+1)+' has no visible answer height');
            await summary.click();
            if(await item.evaluate(el=>el.open)||await answer.isVisible()){
              failures.push(test.label+': FAQ '+(i+1)+' answer does not close');
            }
          }
        }
      }
      if(test.route==='/'&&test.mobile){
        const cards=page.locator('.bde-section-35-325 .bde-image-box');
        if(await cards.count()!==4)failures.push(test.label+': expected four homepage service cards');
        else{
          const metrics=await cards.evaluateAll(elements=>elements.map(card=>{
            const button=card.querySelector('.ee-imagebox-button');
            if(!button)return {button:false};
            const outer=card.getBoundingClientRect(),cta=button.getBoundingClientRect();
            return {button:true,inside:cta.top>=outer.top+8&&cta.bottom<=outer.bottom-8,
              height:outer.height,visible:getComputedStyle(button).display!=='none'};
          }));
          if(metrics.some(item=>!item.button||!item.inside||!item.visible)){
            failures.push(test.label+': service card pink CTA missing or clipped: '+JSON.stringify(metrics));
          }
        }
        const strategy=await page.locator(
          '.bde-div-35-557,.bde-div-35-560,.bde-div-35-563,.bde-div-35-567,.bde-div-35-570,.bde-div-35-573'
        ).evaluateAll(elements=>elements.map(card=>{
          const box=card.getBoundingClientRect(),h=card.querySelector('.bde-heading')?.getBoundingClientRect(),
            p=card.querySelector('.bde-text')?.getBoundingClientRect();
          return {ok:!!h&&!!p&&h.left>=box.left+10&&h.right<=box.right-10&&
            p.left>=box.left+10&&p.right<=box.right-10};
        }));
        if(strategy.length!==6||strategy.some(x=>!x.ok)){
          failures.push(test.label+': SEO strategy cards lack safe horizontal padding');
        }
      }
      if(test.route==='/pricing/'){
        if(await page.locator('.pm-pricing__build').count()!==3) failures.push(test.label+': expected three website build cards');
        if(await page.locator('.pm-pricing__seo-card').count()!==1) failures.push(test.label+': expected one SEO price card');
      }
      if (await page.locator('header .prunus-client-login').count()) {
        failures.push(test.label + ': client login incorrectly still in header');
      }
      const footerLogin = page.locator('.prunus-footer-login');
      if (await footerLogin.count() !== 1 || await footerLogin.getAttribute('href') !== '/client-login/') {
        failures.push(test.label + ': client login missing from footer');
      }


      if(test.route==='/'){
        const mainHeading=page.locator('h1.bde-dual-heading-35-625');
        if(await mainHeading.count()!==1)failures.push(test.label+': one visible SEO hero H1 missing');
        else if(!(await mainHeading.innerText()).includes('to become your best source of new business.')){
          failures.push(test.label+': homepage SEO H1 wording missing');
        }
        const imagesWithoutAlt=await page.locator('img:not([alt])').count();
        if(imagesWithoutAlt)failures.push(test.label+': images lacking alt='+imagesWithoutAlt);
        const heroImage=page.locator('img.bde-image2-35-620');
        if(await heroImage.count()===1){
          const dims=await heroImage.evaluate(el=>({w:el.getAttribute('width'),h:el.getAttribute('height'),src:el.getAttribute('src')}));
          if(!dims.w||!dims.h||!/\/assets\/prunus-images\/hero-768\.webp$/.test(dims.src))failures.push(test.label+': hero image sizing/accessibility regression');
        }
      }

      // The homepage is now fed by the same Astro content collection as the
      // full portfolio. The first verified project is the roofing rebuild.
      if (test.route === '/') {
        const cards=page.locator('#recent-work .pm-project-card');
        if(await cards.count()!==3)failures.push(test.label+': homepage must have 3 recent work cards');
        const first=await cards.first().locator('h3 a').getAttribute('href');
        if(first!=='/our-work/j-piper-cleaning-services/'){
          failures.push(test.label+': featured J Piper project must be first');
        }
        const featuredHrefs=await cards.locator('h3 a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
        const expectedFeatured=[
          '/our-work/j-piper-cleaning-services/',
          '/our-work/residential-roofing-and-fascias/',
          '/our-work/cotswold-pawprints/'
        ];
        if (JSON.stringify(featuredHrefs)!==JSON.stringify(expectedFeatured)) {
          failures.push(test.label+': homepage portfolio cards out of approved order');
        }
        const more=page.locator('#recent-work .pm-home-work__more');
        if(await more.getAttribute('href')!=='/our-work/'){
          failures.push(test.label+': Recent Work missing link to complete portfolio');
        }
        const highlight=page.locator('.bde-dual-heading-35-625 .dual-heading--secondary.js-annotate');
        if(await highlight.count()!==1)failures.push(test.label+': white highlighted heading missing');
        else{
          const styles=await highlight.evaluate((el)=>{
            const css=getComputedStyle(el);
            return {backgroundImage:css.backgroundImage,backgroundColor:css.backgroundColor,
              visible:el.getBoundingClientRect().width>0};
          });
          console.log('HOME HIGHLIGHT RENDERED STYLES '+JSON.stringify(styles));
          if(!styles.visible || !/rgb\(255,\s*255,\s*255\)|#fff|white/.test(styles.backgroundImage)){
            failures.push(test.label+': Websites built highlight does not actually render white');
          }
          if(/236,\s*205,\s*130|243,\s*220,\s*155|eccd82/i.test(styles.backgroundImage)){
            failures.push(test.label+': gold highlight still present in rendered style');
          }
        }
        const olderGold=page.locator('.bde-animated-heading-35-469 .bde-animated-heading__word');
        const goldCount=await olderGold.count();
        if(goldCount){
          const nonWhite=await olderGold.evaluateAll(nodes=>nodes.some(el=>{
            const css=getComputedStyle(el);
            return css.backgroundColor!=='rgb(255, 255, 255)';
          }));
          if(nonWhite)failures.push(test.label+': rotating heading still has a gold background');
        }
      }
      if (test.route === '/our-work/') {
        const cards=page.locator('.pm-project-card');
        // Source portfolio entries are living editorial content; never hard-code the count.
        const workDirectory=path.join(process.cwd(),'src/content/work');
        const approvedProjects=readdirSync(workDirectory).filter(file=>file.endsWith('.md'))
          .map(file=>readFileSync(path.join(workDirectory,file),'utf8'))
          .filter(source=>!/^[ \t]*draft:\s*true\s*$/m.test(source));
        if(await cards.count()!==approvedProjects.length){
          failures.push(test.label+': expected '+approvedProjects.length+' approved portfolio entries');
        }
        const externalLinks=page.locator('.pm-project-card .pm-project-website');
        const expectedLinked=approvedProjects.filter(source=>/^website:\s*["']?https:\/\//m.test(source)).length;
        if(await externalLinks.count()!==expectedLinked){
          failures.push(test.label+': expected '+expectedLinked+' externally linked portfolio projects');
        }
        const hrefs=await externalLinks.evaluateAll(nodes=>nodes.map(a=>a.href));
        if(hrefs.some(href=>!href.startsWith('https://')))failures.push(test.label+': external website link lacks HTTPS');
        const detailSlugs=await cards.locator('h3 a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
        for (const detail of detailSlugs) {
          const response=await page.request.get(local+detail);
          if(!response.ok())failures.push(test.label+': portfolio detail '+detail+' returns '+response.status());
        }
        const outdated=new Set([
          '/our-work/guardians-brand-works/',
          '/our-work/stephenus/',
          '/our-work/coffee-art-socks/'
        ]);
        if(detailSlugs.some(slug=>outdated.has(slug))){
          failures.push(test.label+': superseded portfolio entries still displayed');
        }
        if(await page.locator('a[href="/our-work/residential-roofing-and-fascias/"]').count()===0){
          failures.push(test.label+': residential roofing portfolio entry missing');
        }
      }
      if(await page.locator('.pm-site-footer').count()!==1){
        failures.push(test.label+': redesigned shared footer missing');
      }
      if(await page.locator('.pm-site-footer a[href="/seo-agency-uk/free-seo-audit/"]').count()===0){
        failures.push(test.label+': footer internal SEO audit link missing');
      }
      const loginResponse=await page.request.get(local+'/client-login/');
      if(!loginResponse.ok())failures.push(test.label+': client-login route returns '+loginResponse.status());
      if (test.route === '/') {
        const logo = page.locator('header .bde-image-27-105 img');
        const dimensions = await logo.boundingBox();
        if (!dimensions || dimensions.width < 30 || dimensions.height < 30) {
          failures.push(test.label + ': header logo hidden or collapsed');
        }
      }

      // Visual QA captures of the two intentionally redesigned sections;
      // these supplement, not replace, interactive and pixel-diff tests.
      if (test.route === '/') {
        await page.locator('#recent-work').screenshot({
          path:path.join(output,test.mobile?'recent-work-mobile.png':'recent-work-desktop.png'),
          animations:'disabled',timeout:9000
        });
        await page.locator('.pm-site-footer').screenshot({
          path:path.join(output,test.mobile?'footer-mobile.png':'footer-desktop.png'),
          animations:'disabled',timeout:9000
        });
      }
      if (!test.mobile && test.route === '/') {
        const canvas = await page.locator('#prunus-cursor-fx').count();
        if (!canvas) failures.push(test.label + ': Prunus flower canvas not mounted');
      }
      if (test.route.includes('free-seo-audit')) {
        const form = await page.locator('#paForm').count();
        if (!form) failures.push(test.label + ': SEO auditor form missing');
      }
      if (test.route === '/contact/') {
        const formAction = await page.locator('form.prunus-contact-form').getAttribute('action');
        if (formAction !== 'https://formspree.io/f/mpqenpep') failures.push(test.label + ': contact form destination changed');
      }
      console.log('PASS local page ' + test.route + ': ' + title + ' | header links=' + visibleLinks +
        (consoleErrors.length ? ' | JS exceptions=' + consoleErrors.length : ''));
      if (consoleErrors.length) {
        console.error('Browser exceptions: ' + consoleErrors.slice(0,6).join(' | '));
        failures.push(test.label + ': ' + consoleErrors.length + ' JavaScript exceptions');
      }
    } catch (error) {
      failures.push(test.label + ': ' + String(error));
    }
    if (process.env.COMPARE_LIVE === '1') try {
      const prodResponse = await page.goto(production + test.route, { waitUntil: 'domcontentloaded', timeout: 9000 });
      if (prodResponse && prodResponse.ok()) {
        await Promise.race([page.evaluate(() => document.fonts.ready), new Promise((r) => setTimeout(r, 4000))]);
        await page.waitForTimeout(350);
        await page.screenshot({ path: path.join(output, test.label + '-live.png'), fullPage: false, animations:'disabled', timeout: 12000 });
        // Same viewport and reduced-motion preference on both sites.
        const localImage = PNG.sync.read(readFileSync(path.join(output, test.label + '-astro.png')));
        const liveImage = PNG.sync.read(readFileSync(path.join(output, test.label + '-live.png')));
        if (localImage.width === liveImage.width && localImage.height === liveImage.height) {
          const diff = new PNG({ width: localImage.width, height: localImage.height });
          const changed = pixelmatch(localImage.data, liveImage.data, diff.data,
            localImage.width, localImage.height, { threshold: .12, includeAA: false });
          const ratio = Number((100 * changed / (localImage.width * localImage.height)).toFixed(2));

          const bands = [];
          const rowsPerBand = Math.ceil(localImage.height / 6);
          for (let y=0; y<localImage.height; y+=rowsPerBand) {
            const end = Math.min(localImage.height, y + rowsPerBand);
            const startByte = y * localImage.width * 4;
            const endByte = end * localImage.width * 4;
            const count = pixelmatch(
              localImage.data.subarray(startByte,endByte),
              liveImage.data.subarray(startByte,endByte),
              null, localImage.width, end-y, {threshold:.12,includeAA:false}
            );
            bands.push({
              startY:y,endY:end,
              differencePercent:Number((100*count/(localImage.width*(end-y))).toFixed(2))
            });
          }
          visualMetrics.push({ route:test.route,viewport:test.label,pixelDifferencePercent:ratio,bands });
          console.log('VISUAL BANDS ' + test.label + ': ' +
            bands.map(b => b.startY + '-' + b.endY + '=' + b.differencePercent + '%').join(' | '));

          writeFileSync(path.join(output, test.label + '-diff.png'), PNG.sync.write(diff));
          console.log('VISUAL DIFFERENCE ' + test.label + ': ' + ratio + '% of pixels (manual review required)');
        }
      } else console.log('Production screenshot unavailable: ' + test.route);
    } catch (error) {
      console.log('Production comparison could not be captured for ' + test.route + ': ' + String(error).slice(0,200));
    }
    await ctx.close();
  }


  // In normal motion, source-marked sections must start hidden and then
  // actually reveal as they scroll into view. Previous tests used reduced
  // motion and failed to exercise this critical migration requirement.
  const motion = await browser.newContext({
    viewport:{width:1280,height:780},reducedMotion:'no-preference'
  });
  const motionPage = await motion.newPage();
  // /industries/ is a native Astro page, not a Breakdance-export with legacy
  // entrance markers. Verify migrated reveal effects only on retained exports.
  for (const route of ['/', '/website-design/']) {
    await motionPage.goto(local + route, {waitUntil:'domcontentloaded', timeout:16000});
    const reveals = motionPage.locator('[data-prunus-reveal]');
    const count = await reveals.count();
    console.log('SCROLL REVEALS ' + route + ': ' + count + ' original section markers');
    if (!count) failures.push(route + ': no migrated entrance effects found');
    if (count) {
      const target = reveals.last();
      await target.scrollIntoViewIfNeeded({ timeout:8000 });
      try {
        await motionPage.waitForFunction((node) => node?.classList.contains('prunus-revealed'),
          await target.elementHandle(), {timeout:4000});
      } catch {
        failures.push(route + ': reveal failed to animate during scroll');
      }
    }
  }

  // Validate scroll-up recovery below the ~1,100px threshold, after the
  // visitor has scrolled down and left the navigation.
  await motionPage.goto(local+'/',{waitUntil:'domcontentloaded',timeout:16000});
  await motionPage.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,1400);});
  await motionPage.waitForTimeout(500);
  const hidden=await motionPage.locator('.bde-header-builder').evaluate(
    node=>node.classList.contains('pm-header-hidden'));
  if(!hidden)failures.push('Sticky header failed to hide beyond 1100px on scroll down');
  await motionPage.evaluate(()=>{window.scrollTo(0,1230);});
  await motionPage.waitForTimeout(350);
  const visible=await motionPage.locator('.bde-header-builder').evaluate(
    node=>!node.classList.contains('pm-header-hidden'));
  if(!visible)failures.push('Sticky header failed to reveal after scrolling up');
  console.log('STICKY HEADER: hidden-down='+hidden+' revealed-up='+visible);

  await motion.close();

  // Independently exercise every original Astro route, not just the eight
  // screenshot targets. Catch hidden plugin initializers or malformed inline
  // scripts on individual service/industry pages.
  const sweep = await browser.newContext({
    viewport: { width: 1240, height: 900 },
    reducedMotion: 'reduce'
  });
  const sweepPage = await sweep.newPage();
  const routeErrors = [];
  let pageErrors = [];
  sweepPage.on('pageerror', (error) => pageErrors.push(error.message));
  let visited = 0;
  for (const { slug } of getLegacyRoutes()) {
    const url = '/' + slug + '/';
    pageErrors = [];
    try {
      const response = await sweepPage.goto(local + url, { waitUntil: 'domcontentloaded', timeout: 16000 });
      if (!response || response.status() !== 200) {
        routeErrors.push(url + ': invalid status ' + (response?.status() ?? 'no response'));
      }
      // Check every generated legacy route, not only Our Work / Pricing.
      // Must be hidden before interaction even if the external CSS is stale.
      const skipState=await sweepPage.locator('a.pm-skip-link').evaluateAll(nodes=>{
        if(nodes.length!==1) return {valid:false,reason:'expected one skip link; found '+nodes.length};
        const el=nodes[0],cs=getComputedStyle(el),rect=el.getBoundingClientRect();
        return {valid:cs.clipPath==='inset(50%)'&&rect.width<=2,reason:
          'clip-path='+cs.clipPath+', width='+rect.width};
      });
      if(!skipState.valid)routeErrors.push(url+': skip link visible at rest ('+skipState.reason+')');
      await sweepPage.waitForTimeout(90);
      if (pageErrors.length) routeErrors.push(url + ': ' + pageErrors.slice(0, 3).join(' | '));
      visited++;
    } catch (error) {
      routeErrors.push(url + ': ' + String(error));
    }
  }
  await sweep.close();
  writeFileSync(path.join(output, 'route-smoke.json'),
    JSON.stringify({ inspected: visited, errors: routeErrors }, null, 2) + '\n');
  console.log('ALL-ROUTE BROWSER SWEEP ' + visited + ' legacy pages, ' + routeErrors.length + ' errors');
  if (routeErrors.length) failures.push(...routeErrors);


  // All 37 industry pages: check hero boundaries on both desktop and mobile.
  // The three older Breakdance routes need a separate selector from Astro routes.
  const industryRoutes = [
    ...['accountants','private-clinics','physiotherapists'].map(slug=>({slug,legacy:true})),
    ...industryPages.map(({slug})=>({slug,legacy:false}))
  ];
  const industryFindings=[];
  for(const width of [1440,390]){
    const context = await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
    const tab = await context.newPage();
    for(const {slug,legacy} of industryRoutes){
      const route='/industries/'+slug+'/';
      try{
        const response=await tab.goto(local+route,{waitUntil:'domcontentloaded',timeout:13000});
        if(response?.status()!==200){industryFindings.push(route+' HTTP '+response?.status());continue}
        await tab.evaluate(()=>window.scrollTo(0,0));
        const state=await tab.evaluate(({legacy,width})=>{
          const hero = legacy
            ? document.querySelector('.pm-legacy-industry-hero')
            : document.querySelector('.pm-sector__hero');
          const columns=legacy
            ? document.querySelector('.pm-legacy-industry-hero__inner')
            : hero;
          const left=legacy
            ? document.querySelector('.pm-legacy-industry-hero__copy')
            : document.querySelector('.pm-sector__hero-copy');
          const right=legacy
            ? document.querySelector('.pm-legacy-industry-hero__example')
            : document.querySelector('.pm-sector__demo-preview, .pm-sector__hero-visual');
          const heading=hero?.querySelector('h1');
          const rect=(el)=>{if(!el)return null;const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
          return {hero:rect(hero),columns:rect(columns),left:rect(left),right:rect(right),
            h1:rect(heading),headingCount:document.querySelectorAll('h1').length,
            documentWidth:document.documentElement.scrollWidth,viewport:width,
            textOverflow:left?Array.from(left.querySelectorAll('h1,p,.bde-text'))
             .filter(el=>{const r=el.getBoundingClientRect(), p=left.getBoundingClientRect();return r.width>0&&(r.left<p.left-4||r.right>p.right+4)})
             .map(el=>el.tagName+'.'+el.className).slice(0,4):[]};
        },{legacy,width});
        const issue=[];
        if(!state.hero||!state.left||!state.right||!state.h1)issue.push('missing hero layout');
        else{
          if(state.headingCount!==1)issue.push('H1 count '+state.headingCount);
          if(state.documentWidth>width+8)issue.push('horizontal viewport overflow '+state.documentWidth+'px');
          if(state.left.x< -4||state.left.right>width+5)issue.push('copy outside viewport');
          if(state.right.x< -4||state.right.right>width+5)issue.push('preview outside viewport');
          if(state.textOverflow.length)issue.push('text overflow '+state.textOverflow.join(','));
          if(width>=900){
            if(state.left.right>state.right.x+9)issue.push('copy overlaps preview by '+Math.round(state.left.right-state.right.x)+'px');
            if(state.h1.y<85)issue.push('heading obscured by sticky header');
          }else{
            if(state.left.bottom>state.right.y+10)issue.push('mobile columns overlap');
          }
        }
        if(issue.length)industryFindings.push(slug+' '+width+'px: '+issue.join(' / '));
        if(legacy && ['accountants','private-clinics','physiotherapists'].includes(slug)){
          await tab.screenshot({path:path.join(output,'industry-'+slug+'-'+width+'.png'),fullPage:false,animations:'disabled',timeout:6000});
        }
      }catch(error){industryFindings.push(slug+' '+width+'px: '+String(error).slice(0,130))}
    }
    await context.close();
  }
  // The /industries/ directory is now native Astro, so the original
  // 25-card Breakdance export must not appear at any screen width.
  for(const width of [1440,768,390,320]){
    const ctx=await browser.newContext({viewport:{width,height:840},reducedMotion:'reduce'});
    const tab=await ctx.newPage();
    try{
      const response=await tab.goto(local+'/industries/',{waitUntil:'domcontentloaded',timeout:15000});
      if(response?.status()!==200)industryFindings.push('directory '+width+'px: HTTP '+response?.status());
      const result=await tab.evaluate(()=>{
        const host=document.querySelector('.pm-industry-directory');
        const links=[...document.querySelectorAll('.pm-industry-directory__link')];
        const rect=(el)=>el?.getBoundingClientRect();
        const hero=rect(document.querySelector('.pm-industry-directory__hero'));
        const h1=rect(document.querySelector('.pm-industry-directory__hero h1'));
        const card=rect(links[0]);
        const bad=links.filter(link=>{
          const r=link.getBoundingClientRect();
          return r.width<200 || r.height>120 || r.left < -3 || r.right > window.innerWidth + 3;
        });
        return {found:!!host,linkCount:links.length,headingCount:document.querySelectorAll('h1').length,
          docWidth:document.documentElement.scrollWidth,viewport:window.innerWidth,
          cardWidth:card?.width,heroTop:hero?.top,h1Top:h1?.top,badLinks:bad.length,
          legacy:!!document.querySelector('.bde-section-522-100')};
      });
      if(!result.found||result.legacy)industryFindings.push('directory '+width+'px: legacy directory still visible');
      if(result.linkCount!==37)industryFindings.push('directory '+width+'px: expected 37 links, got '+result.linkCount);
      if(result.headingCount!==1)industryFindings.push('directory '+width+'px: H1 count '+result.headingCount);
      if(result.docWidth>width+8)industryFindings.push('directory '+width+'px: horizontal page overflow '+result.docWidth);
      if(result.badLinks)industryFindings.push('directory '+width+'px: '+result.badLinks+' cards too narrow, tall or clipped');
      if(result.h1Top<80)industryFindings.push('directory '+width+'px: H1 under header');
      await tab.screenshot({path:path.join(output,'industry-directory-'+width+'.png'),fullPage:true,animations:'disabled'});
    }catch(e){industryFindings.push('directory '+width+'px: '+String(e))}
    await ctx.close();
  }
  console.log('INDUSTRY LAYOUT SWEEP: '+industryRoutes.length+' pages x 2 viewports; '+industryFindings.length+' findings');
  writeFileSync(path.join(output,'industry-layout-sweep.json'),JSON.stringify({pages:industryRoutes.length,widths:[1440,390],findings:industryFindings},null,2)+'\n');
  if(industryFindings.length)failures.push(...industryFindings);


  // iOS-compatible progressive enhancement: the FAQ is genuinely native.
  // One run with scripts disabled proves a stale JS bundle cannot hide answers.
  {
    const noJsCtx=await browser.newContext({
      viewport:{width:390,height:844},isMobile:true,hasTouch:true,javascriptEnabled:false
    });
    const noJs=await noJsCtx.newPage();
    await noJs.goto(local+'/',{waitUntil:'domcontentloaded'});
    const item=noJs.locator('.pm-faq__item').first(),answer=item.locator('.pm-faq__answer');
    await item.locator('summary').click();
    if(!await item.evaluate(el=>el.open)||!await answer.isVisible()){
      failures.push('homepage-mobile: native FAQ does not work without JavaScript');
    }
    await noJsCtx.close();
  }
  // Separate full-motion test checks the actual 320ms open/290ms close.
  {
    const motionCtx=await browser.newContext({
      viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'no-preference'
    });
    const motionPage=await motionCtx.newPage();
    await motionPage.goto(local+'/',{waitUntil:'domcontentloaded'});
    const item=motionPage.locator('.pm-faq__item').first(),answer=item.locator('.pm-faq__answer');
    await item.locator('summary').click();
    await motionPage.waitForTimeout(390);
    if(!await item.evaluate(el=>el.open)||!await answer.isVisible()){
      failures.push('homepage-mobile: animated FAQ does not reveal answer');
    }
    await item.locator('summary').click();
    await motionPage.waitForTimeout(390);
    if(await item.evaluate(el=>el.open)||await answer.isVisible()){
      failures.push('homepage-mobile: animated FAQ does not close');
    }
    await motionCtx.close();
  }

  // Beyond the 37 sector pages, inspect ALL other public Astro/legacy routes
  // at mobile and desktop widths. The previous industry-only test missed
  // overflow on shared pages, so treat this as a permanent regression guard.
  const allPublicRoutes=[];
  const scanRendered=(folder,parts=[])=>{
    for(const entry of readdirSync(folder,{withFileTypes:true})){
      if(['wp-content','wp-includes','assets','_astro'].includes(entry.name))continue;
      const next=path.join(folder,entry.name);
      if(entry.isDirectory())scanRendered(next,[...parts,entry.name]);
      else if(entry.isFile()&&entry.name==='index.html'){
        const route='/' + (parts.length?parts.join('/')+'/':'');
        if(!/^\/(?:page|author|qs|client-login)\//.test(route)&&!route.startsWith('/industries/')){
          allPublicRoutes.push(route);
        }
      }
    }
  };
  scanRendered(path.join(process.cwd(),'dist'));
  const otherPageFindings=[];
  for(const width of [390,1440]){
    const ctx=await browser.newContext({viewport:{width,height:840},reducedMotion:'reduce'});
    const tab=await ctx.newPage();
    for(const route of allPublicRoutes){
      try{
        const response=await tab.goto(local+route,{waitUntil:'domcontentloaded',timeout:12000});
        if(response?.status()!==200){
          otherPageFindings.push(route+' '+width+'px: HTTP '+response?.status());continue;
        }
        // All legacy FAQs are rebuilt into native details on any route.
        if(width===390){
          const faqs=tab.locator('.pm-faq__item');
          if(await tab.locator('.bde-faq__item').count()){
            otherPageFindings.push(route+': obsolete builder FAQ still present');
          }
          for(let i=0,count=await faqs.count();i<count;i++){
            const item=faqs.nth(i),answer=item.locator('.pm-faq__answer');
            await item.locator('summary').click({timeout:3500});
            if(!await item.evaluate(el=>el.open)||!await answer.isVisible() ||
               await answer.evaluate(el=>el.getBoundingClientRect().height)<20){
              otherPageFindings.push(route+': FAQ '+(i+1)+' does not reveal its answer');
            }
            await item.locator('summary').click({timeout:3500});
            if(await item.evaluate(el=>el.open)||await answer.isVisible()){
              otherPageFindings.push(route+': FAQ '+(i+1)+' does not close');
            }
          }
        }
        const state=await tab.evaluate(()=>{
          const viewport=window.innerWidth;
          const h1=[...document.querySelectorAll('h1')].filter(el=>{
            const r=el.getBoundingClientRect();
            const cs=getComputedStyle(el);
            return r.width>0&&r.height>0&&cs.display!=='none'&&cs.visibility!=='hidden';
          });
          const headingRects=h1.map(el=>{
            const r=el.getBoundingClientRect();
            return {left:r.left,right:r.right,width:r.width};
          });
          return {viewport,documentWidth:document.documentElement.scrollWidth,
            visibleH1:h1.length,headingRects};
        });
        if(state.documentWidth>width+12)otherPageFindings.push(route+' '+width+'px: horizontal page overflow '+state.documentWidth);
        if(state.headingRects.some(r=>r.left< -15 || r.right>width+15)){
          otherPageFindings.push(route+' '+width+'px: main heading outside viewport');
        }
      }catch(error){otherPageFindings.push(route+' '+width+'px: '+String(error).slice(0,135))}
    }
    await ctx.close();
  }
  console.log('SITEWIDE RESPONSIVE SWEEP: '+allPublicRoutes.length+' additional routes x 2 widths; '+otherPageFindings.length+' findings');
  writeFileSync(path.join(output,'sitewide-responsive-sweep.json'),
    JSON.stringify({routes:allPublicRoutes.length,widths:[390,1440],findings:otherPageFindings},null,2)+'\n');
  if(otherPageFindings.length)failures.push(...otherPageFindings);

  writeFileSync(path.join(output, 'visual-metrics.json'), JSON.stringify(visualMetrics,null,2) + '\n');
  writeFileSync(path.join(output, 'readme.txt'),
    'Prunus Media screenshot evidence. *-astro.png = staged Astro build; *-live.png = production website where reachable.\n' +
    'Viewport sizes and page route labels are recorded in scripts/visual-smoke.mjs.\n' +
    'Visual sign-off still requires human review. Browser smoke does not prove pixel equality.\n' +
    'Smoke failures:\n' + (failures.length ? failures.join('\n') : 'None reported') + '\n');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  server.stdout.destroy();
  server.stderr.destroy();
}
if (failures.length) {
  console.error('Browser smoke failures:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('Browser smoke checks passed; screenshots captured for visual comparison.');
process.exit(0);
