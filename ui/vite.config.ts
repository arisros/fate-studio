import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Go server embeds the build output (../assets) via go:embed and serves
// hashed files under /assets/*, with index.html returned for all SPA routes.
// So assets must be referenced under /assets/ and emitted into ../assets.
export default defineConfig({
  plugins: [react()],
  base: "/assets/",
  build: {
    outDir: "../assets",
    emptyOutDir: true,
    assetsDir: ".",
    // index.html lands in ../assets/index.html; hashed js/css beside it.
    rollupOptions: {
      output: {
        entryFileNames: "app-[hash].js",
        chunkFileNames: "chunk-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
      },
    },
  },
});
