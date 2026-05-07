import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
//
// We expose two ways to reach Kong:
//   1) Direct CORS calls (default in production / docker preview).
//      Set VITE_API_BASE=http://localhost:8000 (or the public Kong URL).
//   2) Vite dev proxy under /api-proxy → http://localhost:8000.
//      Useful when CORS is disabled or when the React app is served from a
//      different origin during development.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api-proxy": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api-proxy/, ""),
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
  },
});
