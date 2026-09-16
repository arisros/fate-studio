import { defineConfig } from "vitest/config";

// Unit tests for the pure model/layout/handles/collision functions.
// These touch no DOM and no workers, so the default node environment is fine;
// individual files that need jsdom can set `// @vitest-environment jsdom`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    globals: false,
    clearMocks: true,
  },
});
