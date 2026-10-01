import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "infra"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/*/src/**", "infra/lib/**"],
      exclude: ["**/*.test.ts"],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
