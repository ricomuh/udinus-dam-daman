import { defineConfig } from 'vite';

export default defineConfig({
  base: '/udinus-dam-daman/1.0.0/',
  server: {
    headers: {
      'Content-Disposition': 'inline',
    },
  },
  build: {
    assetsInlineLimit: 0,
  },
  assetsInclude: ['**/*.ogg', '**/*.mp3', '**/*.wav'],
});
