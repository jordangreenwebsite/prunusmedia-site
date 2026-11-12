import { chromium } from 'playwright';
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const targetDirectory = 'public/images/website-previews';
mkdirSync(targetDirectory, { recursive: true });

// These are the published websites used in Prunus industry-page heroes.
// Screenshots are captured at build-time in GitHub Actions, never via a third-party
// 'Generating Preview...' service in the user's browser.
const sites = [
  ['easy-cloud-accounting', 'https://easycloudaccounting.pages.dev/'],
  ['ioana-aesthetics-london', 'https://ioana-aesthetics-london.pages.dev/'],
  ['charley-hayes-smr', 'https://charleyhayessmr.pages.dev/'],
  ['gudgeons-groundworks', 'https://gudgeonsgroundworks.pages.dev/'],
  ['katies-flower-hut', 'https://katies-flower-hut.pages.dev/'],
  ['my-sweet-pea-flowers', 'https://www.mysweetpeaflowers.com/'],
  ['tj-bespoke-designs', 'https://tjbespokedesignswebsite.pages.dev/'],
  ['residential-roofing', 'https://residential-roofing.co.uk/'],
  ['pp-power-detailing', 'https://pppowerdetailing.com/'],
  ['j-piper-cleaning', 'https://jpipercleaning.com/'],
  ['lee-green', 'https://leegreen.pages.dev/'],
  ['coffee-at-odd-socks', 'https://coffeeatoddsocks.pages.dev/']
];

const browser = await chromium.launch({ headless: true });
const missing = [];
for (const [slug, url] of sites) {
  const path = join(targetDirectory, slug + '.jpg');
  if (existsSync(path) && statSync(path).size > 18000) {
    console.log('Already captured: ' + slug);
    continue;
  }
  const page = await browser.newPage({
    viewport: { width: 1440, height: 950 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce'
  });
  try {
    console.log('Capturing ' + url);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    if (!response?.ok()) throw new Error('HTTP ' + (response?.status() ?? 'no response'));
    await page.evaluate(async () => {
      const fonts = document.fonts?.ready;
      if (fonts) await Promise.race([fonts, new Promise(resolve => setTimeout(resolve, 4000))]);
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1700);
    const bodyText = (await page.locator('body').innerText({timeout:5000})).slice(0,4000);
    if (/generating preview|just a moment\.\.\.|access denied|error 403|this site can.t be reached/i.test(bodyText)) {
      throw new Error('Site has a placeholder or anti-bot challenge');
    }
    const bodySize = await page.locator('body').evaluate(el=>({ width: el.scrollWidth, height: el.scrollHeight }));
    if(bodySize.height < 280) throw new Error('Page body too small for a meaningful preview');
    await page.screenshot({ path, type: 'jpeg', quality: 78, animations: 'disabled', fullPage: false });
    if (statSync(path).size < 18000) throw new Error('Screenshot appears nearly empty');
    console.log('Captured ' + slug + ' (' + statSync(path).size + ' bytes)');
  } catch (error) {
    console.log('CAPTURE FAILED ' + slug + ': ' + String(error));
    missing.push({ slug, url, error: String(error) });
  } finally {
    await page.close();
  }
}
await browser.close();
writeFileSync('website-preview-capture-report.json', JSON.stringify({ missing, count: sites.length }, null, 2));
if (missing.length) {
  console.error('Missing screenshots: ' + missing.map(x=>x.slug).join(', '));
  process.exitCode = 1;
}
