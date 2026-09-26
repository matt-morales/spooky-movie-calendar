/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development the Go API runs on :8080 (see `make dev`). Proxying keeps
// the browser on one origin, just like production where a Cloudflare Pages
// Function forwards /api/* to Cloud Run.
const api = process.env.API_ORIGIN ?? "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true, // reachable from phones on your Wi-Fi
    proxy: { "/api": api, "/images": api },
  },
  preview: {
    proxy: { "/api": api, "/images": api },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "functions/**/*.test.ts"],
  },
});
