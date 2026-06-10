import { defineConfig, devices } from "@playwright/test";

// Visual-QA suite. Runs against the LIVE deployments (no local server) so it
// exercises exactly what users see. Override the targets via env:
//   FATE_HOSTS="https://fate-studio.arisjirat.com,https://fate-studio-dp.arisjirat.com"
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/__report__" }]],
  use: {
    viewport: { width: 1600, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
