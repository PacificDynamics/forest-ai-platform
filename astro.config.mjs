import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import react from '@astrojs/react';
import netlify from '@astrojs/netlify/functions';
import 'dotenv/config';  // Add this line at the top

export default defineConfig({
  integrations: [tailwind(), react()],
  output: 'server',
  adapter: netlify(),
  vite: {
    build: {
      rollupOptions: {
        external: [
          '@aws-sdk/client-s3',
          '@aws-sdk/credential-providers'
        ]
      }
    },
    ssr: {
      noExternal: ['lucide-react']
    },
    // Update environment variable configuration
    envPrefix: ['FOREST_AI_'],
    define: {
      'process.env.FOREST_AI_AWS_REGION': JSON.stringify(process.env.FOREST_AI_AWS_REGION),
      'process.env.FOREST_AI_S3_ACCESS_KEY_ID': JSON.stringify(process.env.FOREST_AI_S3_ACCESS_KEY_ID),
      'process.env.FOREST_AI_S3_ACCESS_KEY': JSON.stringify(process.env.FOREST_AI_S3_ACCESS_KEY),
      'process.env.FOREST_AI_REPLY_EMAIL': JSON.stringify(process.env.FOREST_AI_REPLY_EMAIL)
    }
  }
});