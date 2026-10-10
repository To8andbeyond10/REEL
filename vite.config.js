import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// The economy code (economy/*.ts) imports node:crypto for paytable hashes; the browser gets a small stand-in.
export default defineConfig({
  resolve: {
    alias: { 'node:crypto': fileURLToPath(new URL('./src/shims/crypto.js', import.meta.url)) }
  }
});
