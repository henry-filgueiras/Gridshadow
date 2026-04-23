import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Deployed at https://<user>.github.io/Gridshadow/, so assets must be
// served from that subpath. In dev this is just '/'.
const base = process.env.GITHUB_PAGES === 'true' ? '/Gridshadow/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
