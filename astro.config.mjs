import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';
import node from '@astrojs/node';

export default defineConfig({
  integrations: [tailwind(), react()],
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  vite: {
    ssr: {
      noExternal: ['lucide-react']
    },
    envPrefix: ['FOREST_AI_']
  }
});
