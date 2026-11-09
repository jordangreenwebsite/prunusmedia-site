/**
 * Browser smoke / screenshot comparison. Never hits the SEO Worker audit
 * endpoint or sends a production contact enquiry.
 */
import { chromium } from 'playwright';
import { getLegacyRoutes } from '../src/lib/exported-pages.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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
    { route: '/industries/accountants/', label: 'accountants-desktop', width: 1440, height: 900 },
    { route: '/industries/private-clinics/', label: 'clinics-desktop', width: 1440, height: 900 },
    { route: '/blog/', label: 'blog-desktop', width: 1440, height: 900 },
    { route: '/our-work/', label: 'portfolio-desktop', width: 1440, height: 900 }
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
        if (firstWork !== '/our-work/') failures.push(test.label + ': Our Work must be first in its dropdown');
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
      if (await page.locator('header .prunus-client-login').count()) {
        failures.push(test.label + ': client login incorrectly still in header');
      }
      const footerLogin = page.locator('.prunus-footer-login');
      if (await footerLogin.count() !== 1 || await footerLogin.getAttribute('href') !== '/client-login/') {
        failures.push(test.label + ': client login missing from footer');
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
        if(await cards.count()!==17)failures.push(test.label+': expected 17 approved portfolio entries');
        const externalLinks=page.locator('.pm-project-card .pm-project-website');
        if(await externalLinks.count()!==17)failures.push(test.label+': every project must have external website link');
        const hrefs=await externalLinks.evaluateAll(nodes=>nodes.map(a=>a.href));
        if(hrefs.some(href=>!href.startsWith('https://')))failures.push(test.label+': external website link lacks HTTPS');
        const detailSlugs=await cards.locator('h3 a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
        for (const detail of detailSlugs) {
          const response=await page.request.get(local+detail);
          if(!response.ok())failures.push(test.label+': portfolio detail '+detail+' returns '+response.status());
        }
        const outdated=new Set([
          '/our-work/guardians-brand-works/',
          '/our-work/my-sweet-pea-flowers/',
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
  for (const route of ['/', '/industries/', '/website-design/']) {
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
