/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "web-only-imports-shared",
      comment:
        "apps/web may depend on @huddle/shared and the pure @huddle/grades engine only; never on pipeline, jobs, writer or infra",
      severity: "error",
      from: { path: "^apps/web" },
      to: { path: "^(packages/(pipeline|jobs|writer)|infra)" },
    },
    {
      name: "grades-is-pure",
      comment: "the grading engine is pure: no I/O packages, no Node built-ins",
      severity: "error",
      from: { path: "^packages/grades/src" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "packages-never-import-apps",
      severity: "error",
      from: { path: "^(packages|infra)" },
      to: { path: "^apps" },
    },
    {
      name: "no-orphans",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "\\.config\\.(ts|js|cjs)$",
          "(^|/)test/",
          "\\.spec\\.ts$",
          "^infra/functions/",
          "^apps/web/src/pages/",
          // React islands are imported from .astro files, which the cruiser does not parse.
          "^apps/web/src/components/.*\\.tsx$",
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: ["node_modules", "dist", "cdk\\.out", "coverage", "\\.astro"] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "default"],
      extensions: [".ts", ".tsx", ".js", ".mjs", ".cjs", ".astro"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
