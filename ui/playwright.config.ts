import { defineConfig, devices } from "@playwright/test";

// Visual-QA suite. By default it starts the demo studio locally, once at the
// root and once mounted under /studio/. Point it at other deployments with
//   FATE_HOSTS="https://studio.example.com,https://other.example.com"
const local = !process.env.FATE_HOSTS;

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
  webServer: local
    ? [
        {
          command: "go run ../cmd/fate-studio --demos --addr :8197",
          url: "http://localhost:8197/api/machines",
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
        },
        {
          command: "go run ./e2e/mounted --addr :8198",
          url: "http://localhost:8198/studio/api/machines",
          reuseExistingServer: !process.env.CI,
          timeout: 120000,
        },
      ]
    : undefined,
});
