import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  site: 'https://wikys0609-tech.github.io',
  base: '/picnic',
  integrations: [
    tailwind({
      applyBaseStyles: false,
    }),
  ],
});
