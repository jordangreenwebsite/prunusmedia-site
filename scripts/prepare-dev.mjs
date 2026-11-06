/**
 * Astro's development server serves static assets from public/. The existing
 * WordPress export lives in wp-content/ and wp-includes/ at repository root.
 * Copy the original static assets to a local, ignored public/ directory so
 * "npm run dev" previews the preserved design rather than broken images/CSS.
 * Safe to run more than once; committed sources are never changed.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const base=process.cwd(), publicDir=path.join(base,'public');
mkdirSync(publicDir, {recursive:true});
for (const year of ['2024', '2025', '2026']) {
  const source = path.join(base, 'wp-content', 'uploads', year);
  if (!existsSync(source)) throw new Error('Missing source media year: ' + year);
  cpSync(source, path.join(publicDir, 'wp-content', 'uploads', year), {recursive:true, force:true});
}
console.log('Prepared preserved static assets for local Astro development.');
