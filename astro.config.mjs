import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://prunusmedia.com',
  output: 'static',
  trailingSlash: 'always',
  build: { format: 'directory' }
});
