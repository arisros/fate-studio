import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const wasmSrc  = path.resolve(__dirname, "node_modules/libavoid-js/dist/libavoid.wasm");
const wasmDist = path.resolve(__dirname, "../assets/libavoid.wasm");

// The Go server embeds the build output (../assets) via go:embed and serves
// hashed files under /assets/*, with index.html returned for all SPA routes.
// So assets must be referenced under /assets/ and emitted into ../assets.
export default defineConfig({
  plugins: [
    react(),
    {
      // Make libavoid.wasm available at /assets/libavoid.wasm:
      //   dev  → Vite middleware intercepts the request
      //   prod → writeBundle copies the file next to the hashed JS bundle
      name: "libavoid-wasm",
      configureServer(server) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        server.middlewares.use("/assets/libavoid.wasm", (_req: any, res: any) => {
          res.setHeader("Content-Type", "application/wasm");
          fs.createReadStream(wasmSrc).pipe(res);
        });
      },
      writeBundle() {
        if (fs.existsSync(wasmSrc)) fs.copyFileSync(wasmSrc, wasmDist);
      },
    },
  ],
  base: "/assets/",
  build: {
    outDir: "../assets",
    emptyOutDir: true,
    assetsDir: ".",
    rollupOptions: {
      output: {
        entryFileNames: "app-[hash].js",
        chunkFileNames: "chunk-[hash].js",
        assetFileNames: "[name]-[hash][extname]",
      },
    },
  },
});
