import { defineConfig } from 'vite'

export default defineConfig({
  // GitHub Pages deploys to /<repo-name>/ by default.
  // Set base to '/' if using a custom domain or root deployment.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
