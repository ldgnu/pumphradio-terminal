import { defineConfig } from 'vite'

export default defineConfig({
  base: './',  // relativo: funciona en dominio custom (pumphradio.com.ar) Y en subpath github.io
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
})
