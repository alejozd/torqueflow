import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  // The shared tenant-flow test walks ~25 routes/actions across every fase;
  // Next.js dev mode compiles each route on first visit, which pushes this
  // single test past the 30s default once Fase 7's citas/SMTP steps were added.
  timeout: 90_000,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    // package.json's "dev" script pins Next to port 3025 (avoids clashing
    // with other local apps on 3000) -- must match here or webServer never
    // becomes reachable and every e2e run times out with 0 tests executed.
    baseURL: "http://localhost:3025",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3025",
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
