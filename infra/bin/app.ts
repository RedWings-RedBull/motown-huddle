import * as cdk from "aws-cdk-lib";

import { loadDotEnv, requireAccountId } from "../lib/env.js";
import { HuddleSiteStack } from "../lib/site-stack.js";

loadDotEnv();
const account = requireAccountId();

const app = new cdk.App();
new HuddleSiteStack(app, "HuddleSite", {
  env: { account, region: "us-east-1" },
  repo: process.env.HUDDLE_GITHUB_REPO ?? "RedWings-RedBull/motown-huddle",
  ...(process.env.HUDDLE_BUDGET_EMAIL ? { budgetEmail: process.env.HUDDLE_BUDGET_EMAIL } : {}),
  description: "Motown Huddle static site (S3 + CloudFront + GitHub OIDC roles)",
});
