import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4309,
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${process.env.BOVEDA_API_PORT || 4310}` },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
