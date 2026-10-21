import { defineConfig } from "vite";

/* OTHERFORM build config.
   - `base: "./"` keeps asset URLs relative so the built site can be
     dropped on any static host or sub-path.
   - The module-preload polyfill is dropped: it is dead weight on every
     browser that can run this app.
   - Everything else is Vite's default production pipeline (Rollup
     tree-shaking, esbuild minify, CSS minify). */
export default defineConfig({
  base: "./",
  build: {
    target: "es2019",
    cssMinify: true,
    reportCompressedSize: true,
    assetsInlineLimit: 4096,
    modulePreload: { polyfill: false },
    /* The single chunk is ~504 kB raw / ~128 kB gzip and is almost entirely
       tree-shaken Three.js. That is a deliberate, measured choice (see
       SIZE_REPORT.md), so raise the warning threshold above it. */
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
