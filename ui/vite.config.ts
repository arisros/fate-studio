import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// The Go server embeds the build output (../assets) via go:embed and serves
// hashed files under /assets/*, with index.html returned for all SPA routes.
//
// URLs in index.html stay absolute; the server rewrites them and the <base>
// element to its mount prefix (see spa.go). URLs inside the bundle (lazy chunks
// and their CSS) are emitted relative to the importing chunk, which the server
// cannot rewrite. API calls and the SSE stream resolve against <base>.
export default defineConfig({
  plugins: [react()],
  resolve: {
    // libavoid-js does not export its WASM; importing it with ?url lets Vite
    // emit it once, hashed, next to the chunk that loads it.
    alias: [
      {
        find: /^libavoid-wasm(?=\?|$)/,
        replacement: path.resolve(__dirname, "node_modules/libavoid-js/dist/libavoid.wasm"),
      },
    ],
  },
  base: "/assets/",
  experimental: {
    renderBuiltUrl: (filename, { hostType }) =>
      hostType === "html" ? `/assets/${filename}` : { relative: true },
  },
  build: {
    outDir: "../assets",
    emptyOutDir: true,
    assetsDir: ".",
    rollupOptions: {
      output: {
        entryFileNames: "app-[hash].js",
        chunkFileNames: "chunk-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
        // Split the heavy graph engines into their own chunks so they load with
        // the (lazy) chart, not in the initial app shell.
        manualChunks(id) {
          if (id.includes("node_modules/elkjs")) return "elk";
          if (id.includes("node_modules/libavoid-js")) return "libavoid";
          if (id.includes("node_modules/@xyflow")) return "xyflow";
        },
      },
    },
  },
});
