import { defineConfig } from 'vite'

export default defineConfig({
  base: '/pumphradio-terminal/',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
})
