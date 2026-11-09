/**
 * Small, reproducible WebP assets from the existing approved hero artwork.
 * Build-time only: no remote optimiser, no WordPress or Breakdance runtime.
 * Keep source artwork in Git until native Astro pages replace the legacy DOM.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const source = path.join(process.cwd(), 'wp-content/uploads/2026/09');
const output = path.join(process.cwd(), 'public/assets/prunus-images');
const jobs = [
  ['Hero-image-768x543.png', 'hero-768.webp'],
  ['Hero-image-1024x724.png', 'hero-1024.webp'],
  ['Prunus-main-hero-768x432.png', 'background-768.webp'],
  ['Prunus-main-hero-1024x576.png', 'background-1024.webp'],
  ['Prunus-main-hero-1536x864.png', 'background-1536.webp']
];
await mkdir(output, { recursive: true });
for (const [file, target] of jobs) {
  const inputPath = path.join(source, file);
  const outputPath = path.join(output, target);
  await sharp(inputPath).webp({ quality: 86, effort: 5 }).toFile(outputPath);
}
console.log('Generated ' + jobs.length + ' responsive WebP hero images.');
