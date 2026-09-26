import { defineConfig, devices } from "@playwright/test";

// Browser tests against a running local stack (`make up` or `make dev`).
// Uses the installed Google Chrome, so no browser download is needed, except
// for the iphone project: real WebKit (Safari's engine), which needs a one-time
// `npx playwright install webkit`.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { channel: "chrome", viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { channel: "chrome", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "iphone", use: { ...devices["iPhone 15"] } },
    { name: "pixel", use: { ...devices["Pixel 7"], channel: "chrome" } },
    // Real Chrome in an Android emulator: run via scripts/android-e2e.sh.
    ...(process.env.ANDROID_CDP ? [{ name: "android", testMatch: "regression.spec.ts", use: { isMobile: true, hasTouch: true } }] : []),
  ],
});
