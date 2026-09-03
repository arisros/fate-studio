import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Go server embeds the build output (../assets) via go:embed and serves
// hashed files under /assets/*, with index.html returned for all SPA routes.
//
// These paths are absolute because Vite requires it. That pins the built shell
// to the site root, so the server rewrites both the <base> element and these
// /assets/ references to its mount prefix before serving the page (see
// spa.go). Everything else the app requests — API calls, the SSE stream — is
// written relative and resolves against that <base>.
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
