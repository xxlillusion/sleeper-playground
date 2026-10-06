import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served at /league/ next to the vanilla explorer. Perspective's ESM uses top-level await, so the build target must be esnext.
export default defineConfig({
  base: "/league/",
  plugins: [react()],
  build: { target: "esnext", outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 4000 },
  server: { port: 5173, strictPort: true },
});
