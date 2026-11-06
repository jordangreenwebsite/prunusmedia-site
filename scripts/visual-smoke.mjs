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
