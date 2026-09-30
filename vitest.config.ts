import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*", "infra"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/*/src/**", "infra/lib/**"],
      // packages/pipeline is a stub until M1; drop the exclusion when the pipeline lands.
      exclude: ["**/*.test.ts", "packages/pipeline/src/**"],
      thresholds: { lines: 90, functions: 90, branches: 80, statements: 90 },
    },
  },
});
