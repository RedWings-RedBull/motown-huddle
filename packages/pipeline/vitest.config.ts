import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    // A non-UTC default zone so any host-dependent date handling shows up in CI and locally.
    env: { TZ: "America/Detroit" },
  },
});
